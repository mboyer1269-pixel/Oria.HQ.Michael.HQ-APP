#!/usr/bin/env node
// GAP (red on purpose) — G1 follow-up 4, Sentinelle P2 #2.
// The route's 500 ledger_unavailable body must expose `revert`, coherent with
// `status` and the stored row. Today only the service level is tested, so
// dropping `revert` from route.ts (ledger_unavailable branch) stays green.
//
// No legitimate seam exists to make the LOCAL action ledger fail inside the
// real route: createActionLedgerRepository() only switches on env/config, and
// toggling NODE_ENV mid-test was rejected by the reviewer.
// CONTRACT ASKED OF THE IMPLEMENTER (Atelier): export from
// src/server/actions/action-ledger-repository.ts a test-only hook
//   __setLocalLedgerRecordFailureForTests(fn | null)
// where fn(input) may throw to simulate an unavailable ledger. This test turns
// green once the seam exists and the route keeps `revert` in the body.
// SIMULATED: local-fallback repo, real route handler, fetch replaced.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { rateLimit, createIntent, getIntent, approve, installN8n, clearHook, repo }
  from "../../../proofs/approval-route-harness.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(projectRoot, "src"),
  "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs") } });
const ledgerRepo = await jiti.import(path.join(projectRoot, "src/server/actions/action-ledger-repository.ts"));

for (const [label, conflict] of [["claim reverted", false], ["claim revert conflict", true]]) {
  test(`(l) ledger down after claim (${label}): 500 ledger_unavailable with a coherent revert field, no dispatch`, async () => {
    assert.equal(typeof ledgerRepo.__setLocalLedgerRecordFailureForTests, "function",
      "missing injection seam __setLocalLedgerRecordFailureForTests (see header)");
    rateLimit.__resetRateLimitersForTests();
    const id = await createIntent(`l-ledger-down-${conflict ? "conflict" : "ok"}`);
    ledgerRepo.__setLocalLedgerRecordFailureForTests((input) => {
      if (input?.metadata?.intentId === id) throw new Error("ledger unavailable (simulated)");
    });
    if (conflict) {
      // Make the claim revert (executing -> pending) hit zero rows.
      repo.__setBeforeLocalTransitionHookForTests((ws, intentId, patch) => {
        if (intentId === id && patch.toStatus === "pending") throw new Error("0 rows (simulated revert conflict)");
      });
    }
    const n8n = installN8n();
    try {
      const r = await approve(id);
      assert.equal(r.status, 500, JSON.stringify(r.body));
      assert.equal(r.body.reason, "ledger_unavailable");
      const stored = (await getIntent(id)).status;
      if (conflict) {
        assert.equal(r.body.revert, "revert_conflict");
        assert.equal(r.body.status, stored);
      } else {
        assert.equal(r.body.revert, "reverted");
        assert.equal(r.body.status, "pending");
        assert.equal(stored, "pending");
      }
      assert.equal(n8n.calls.length, 0);
    } finally {
      ledgerRepo.__setLocalLedgerRecordFailureForTests?.(null);
      clearHook(); n8n.restore();
    }
  });
}
