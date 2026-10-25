import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createJiti } from "jiti";

// Exercise real HTTP parsing, intake and stores; replace only session/workspace context.
test("HTTP consent assertions never become verified records", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "oria-consent-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const context = path.join(dir, "context.mjs");
  writeFileSync(context, `export async function requireOwnerApiSession() { return null; }
export async function getAuthenticatedActorId() { return 'session-user'; }
export function getActiveWorkspaceContext() { return { workspace: { id: 'ws-consent-test' }, userId: 'owner' }; }`);
  const jiti = createJiti(import.meta.url, { moduleCache: false, alias: {
    "@/server/auth/owner": context,
    "@/core/workspace-context": context,
    "@": path.resolve("src"),
    "server-only": path.resolve("src/scripts/smoke/server-only-stub.mjs"),
  } });
  const queue = await jiti.import(path.resolve("src/app/api/outbound/queue/route.ts"));
  const leads = await jiti.import(path.resolve("src/app/api/sales/leads/route.ts"));
  const post = (body) => new Request("http://localhost/api/test", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const forged = { kind: "email_reply", source: "invented-crm", referenceId: "fake",
    capturedAt: "2026-06-01T12:00:00Z", summary: "Invented proof", isVerified: true };
  const input = { channelId: "email", recipient: "test@example.com", leadId: "forged",
    subject: "Test", body: "Test", subVoie: "follow_up", audienceType: "warm_lead",
    consentBasis: "implied_verified", consentProvenance: [forged] };
  assert.equal((await queue.POST(post(input))).status, 422);
  assert.equal((await (await queue.GET()).json()).candidates.length, 0);

  // SENT-B3-1: a client-declared express basis is not proof; it goes to manual review.
  const { neutralizeClientConsent } = await import("./consent-evidence.ts");
  const manual = neutralizeClientConsent({ ...input, consentBasis: "express" });
  assert.equal(manual.consentBasis, "manual_review_required");
  assert.equal(manual.consentProvenance[0].isVerified, false);
  assert.equal(forged.isVerified, true); // Do not mutate the caller's input.
  const expressResponse = await queue.POST(post({ ...input, consentBasis: "express" }));
  assert.equal(expressResponse.status, 422);
  assert.equal((await expressResponse.json()).approvalToken, undefined);
  const coldExpress = await queue.POST(post({ ...input, audienceType: "cold_prospect", consentBasis: "express", consentProvenance: undefined }));
  assert.equal(coldExpress.status, 422);
  assert.equal((await queue.GET()).status, 200);
  assert.equal((await (await queue.GET()).json()).candidates.length, 0);

  // SENT-B3-2: same workspace selector as #410; an unauthorized workspace fails closed.
  const foreign = new Request("http://localhost/api/test?workspace=other-space", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...input, consentBasis: "manual_review_required" }) });
  assert.equal((await queue.POST(foreign)).status, 403);
  assert.equal((await queue.GET(new Request("http://localhost/api/test", { headers: { "x-oria-workspace": "other-space" } }))).status, 403);

  for (const consentBasis of ["implied_verified", "express"]) {
    const response = await leads.POST(post({ leadId: `lead-${consentBasis}`, fullName: "Test",
      email: `${consentBasis}@example.com`, source: "phone_in", consentBasis,
      consentEvidence: { source: "invented-crm", recordedAt: forged.capturedAt, reference: "fake" },
    }));
    assert.equal(response.status, 200);
    const { lead } = await response.json();
    assert.equal(lead.consentBasis, consentBasis === "express" ? "express" : "manual_review_required");
    assert.equal(lead.consentEvidence, undefined);
  }
});
