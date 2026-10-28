#!/usr/bin/env node
// GAP (red on purpose, npm run test:gaps) — /decision must derive the actor
// kind from the VERIFIED session/token only. An agent token sent together with
// a forged header `x-hq-actor-kind: human` must get 403; the header is never
// trusted. Session minted through the ASSUMED auth seam (AUTH_SEAM, one
// constant). SIMULATED: local fallback repo.
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const AUTH_SEAM = { module: "@/server/auth/session-tokens", mint: "mintSessionToken" }; // ({ kind, ownerId, workspaceId }) -> bearer token

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const h = await import(path.join(projectRoot, "proofs/approval-route-harness.mjs"));
const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(projectRoot, "src"), "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs") },
});
const ROUTE = path.join(projectRoot, "src/app/api/agents/execution-intents/[intentId]/decision/route.ts");

for (const kind of ["agent", "runner"]) {
  test(`${kind} token + forged x-hq-actor-kind: human -> 403, intent untouched`, async () => {
    await access(ROUTE);
    const auth = await jiti.import(AUTH_SEAM.module);
    assert.equal(typeof auth[AUTH_SEAM.mint], "function", `missing auth seam ${AUTH_SEAM.module}.${AUTH_SEAM.mint}`);
    const token = await auth[AUTH_SEAM.mint]({ kind, ownerId: "owner-1", workspaceId: h.WS });
    const route = await jiti.import(ROUTE);
    const id = await h.createIntent(`spoof-${kind}`);
    const stored = await h.getIntent(id);
    const res = await route.POST(
      new Request(`http://localhost/api/agents/execution-intents/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "x-hq-actor-kind": "human" },
        body: JSON.stringify({ decision: "approved", expectedPayloadHash: h.hashExecutionIntentPayload(stored.payload), actorKind: "human" }),
      }),
      { params: Promise.resolve({ intentId: id }) },
    );
    assert.equal(res.status, 403);
    assert.equal((await h.getIntent(id)).status, "pending");
  });
}
