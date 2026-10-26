#!/usr/bin/env node

// src/server/agents/execution-intent-ledger-compensation.test.mjs
//
// G2 compensation: the claim (pending -> executing) happens first, then the
// Ledger attempt. If the Ledger write throws, NOTHING is dispatched and the
// claim is reverted CONDITIONALLY (executing -> pending, same id/workspace),
// and the approval reports 500. Real in-memory repository; ledger and
// dispatch are injected spies. No network.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.NODE_ENV = "test";

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});
const { approveAndDispatchExecutionIntent } = await jiti.import(
  path.join(__dirname, "execution-intent-approval-service.ts"),
);
const repo = await jiti.import(path.join(__dirname, "execution-intent-repository.ts"));

const WS = "michael-hq";
function seedIntent(intentId) {
  const now = new Date().toISOString();
  return repo.createAgentExecutionIntent(WS, "owner", {
    intentId,
    workspaceId: WS,
    agentId: "hermes",
    skillId: "crm.update",
    toolName: "n8n_webhook_trigger",
    autonomyLevel: 2,
    status: "pending",
    payload: { agentId: "hermes", skillId: "crm.update", client: "Acme", email: "a@acme.test", actionType: "t", data: {} },
    createdAt: now,
    updatedAt: now,
    requiresCeoApproval: true,
  });
}

test("ledger down after claim -> conditional revert to pending, 500, no dispatch", async () => {
  repo.__clearAgentExecutionIntentsForTests();
  const id = "intent-ledger-down";
  await seedIntent(id);
  let dispatched = 0;
  const transition = (toStatus, expectedFromStatus) => () =>
    repo.transitionAgentExecutionIntent(WS, id, {
      toStatus,
      updatedAt: new Date().toISOString(),
      ...(expectedFromStatus ? { expectedFromStatus } : {}),
    });

  const result = await approveAndDispatchExecutionIntent({
    evaluate: () => ({ outcome: "ALLOW", reason: "ok" }),
    markExecuting: transition("executing", "pending"),
    recordAttempt: async () => {
      throw new Error("ledger unavailable");
    },
    dispatch: async () => {
      dispatched += 1;
      return { ok: true, actionRef: "x" };
    },
    recordResult: async () => {},
    markExecuted: transition("executed"),
    markFailed: transition("failed"),
    revertToPending: transition("pending"),
    revertClaim: transition("pending", "executing"),
  });

  assert.equal(dispatched, 0, "dispatch must never start without a recorded attempt");
  assert.equal(result.ok, false);
  assert.equal(result.httpStatus, 500);
  assert.equal(result.reason, "ledger_unavailable");
  assert.equal((await repo.getAgentExecutionIntent(WS, id)).status, "pending");
  repo.__clearAgentExecutionIntentsForTests();
});

test("revert that matches 0 rows is reported (claim_revert_failed), still no dispatch", async () => {
  repo.__clearAgentExecutionIntentsForTests();
  let dispatched = 0;
  const result = await approveAndDispatchExecutionIntent({
    evaluate: () => ({ outcome: "ALLOW", reason: "ok" }),
    markExecuting: async () => {},
    recordAttempt: async () => {
      throw new Error("ledger unavailable");
    },
    dispatch: async () => {
      dispatched += 1;
      return { ok: true };
    },
    recordResult: async () => {},
    markExecuted: async () => {},
    markFailed: async () => {},
    revertToPending: async () => {},
    revertClaim: async () => {
      throw new repo.AgentExecutionIntentConcurrencyError("executing", "pending");
    },
  });
  assert.equal(dispatched, 0);
  assert.equal(result.httpStatus, 500);
  assert.equal(result.reason, "ledger_unavailable");
  assert.equal(result.claimReverted, false);
});

test("compensating revert is guarded by the same payload equality as the claim", async () => {
  repo.__clearAgentExecutionIntentsForTests();
  const id = "intent-revert-guard";
  const seeded = await seedIntent(id);
  const snapshot = seeded.payload;
  let dispatched = 0;
  const result = await approveAndDispatchExecutionIntent({
    evaluate: () => ({ outcome: "ALLOW", reason: "ok" }),
    markExecuting: () =>
      repo.transitionAgentExecutionIntent(WS, id, {
        toStatus: "executing",
        expectedFromStatus: "pending",
        expectedPayload: snapshot,
        updatedAt: new Date().toISOString(),
      }),
    recordAttempt: async () => {
      // Payload rewritten while executing, then the ledger fails.
      repo.__mutateAgentExecutionIntentPayloadForTests(WS, id, (p) => ({ ...p, client: "Evil" }));
      throw new Error("ledger unavailable");
    },
    dispatch: async () => {
      dispatched += 1;
      return { ok: true };
    },
    recordResult: async () => {},
    markExecuted: async () => {},
    markFailed: async () => {},
    revertToPending: async () => {},
    revertClaim: () =>
      repo.transitionAgentExecutionIntent(WS, id, {
        toStatus: "pending",
        expectedFromStatus: "executing",
        expectedPayload: snapshot,
        updatedAt: new Date().toISOString(),
      }),
  });
  assert.equal(dispatched, 0);
  assert.equal(result.httpStatus, 500);
  assert.equal(result.claimReverted, false, "revert must match 0 rows when the payload no longer matches");
  const after = await repo.getAgentExecutionIntent(WS, id);
  assert.equal(after.status, "executing", "a rewritten payload must not be silently re-queued as pending");
  repo.__clearAgentExecutionIntentsForTests();
});
