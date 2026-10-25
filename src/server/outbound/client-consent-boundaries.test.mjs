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

  // Express remains a manual owner attestation, but its evidence is never verified.
  const { neutralizeClientConsent } = await import("./consent-evidence.ts");
  const manual = neutralizeClientConsent({ ...input, consentBasis: "express" });
  assert.equal(manual.consentBasis, "express");
  assert.equal(manual.consentProvenance[0].isVerified, false);
  assert.equal(forged.isVerified, true); // Do not mutate the caller's input.
  assert.equal((await queue.POST(post({ ...input, consentBasis: "express" }))).status, 201);

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
