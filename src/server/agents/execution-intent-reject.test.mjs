#!/usr/bin/env node

// src/server/agents/execution-intent-reject.test.mjs
//
// Covers the CEO rejection path: the pure guard decision (404 / 409 / ok) and
// the underlying terminal transition (pending -> failed, CEO_REJECTED) against
// the in-memory repository. No HTTP, no Supabase, no n8n.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

// Force the local-fallback path (no Supabase client).
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

test("Execution intent rejection", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const reject = await jiti.import(
    path.join(projectRoot, "src/features/agents/execution-intent-reject.ts"),
  );
  const { resolveExecutionIntentRejection, EXECUTION_INTENT_REJECT_FAILURE_CODE } = reject;

  const { buildAgentExecutionIntent } = await jiti.import(
    path.join(projectRoot, "src/features/agents/execution-intent.ts"),
  );

  const repo = await jiti.import(
    path.join(projectRoot, "src/server/agents/execution-intent-repository.ts"),
  );
  const {
    createAgentExecutionIntent,
    getAgentExecutionIntent,
    listPendingAgentExecutionIntents,
    transitionAgentExecutionIntent,
    __clearAgentExecutionIntentsForTests,
  } = repo;

  const USER = "11111111-1111-1111-1111-111111111111";

  function makeIntent(overrides = {}) {
    return buildAgentExecutionIntent({
      intentId: overrides.intentId ?? "intent-1",
      workspaceId: overrides.workspaceId ?? "ws1",
      agentId: "hermes",
      skillId: "task.create",
      toolName: "n8n_webhook_trigger",
      autonomyLevel: 2,
      payload: {
        agentId: "hermes",
        skillId: "task.create",
        client: "Acme",
        email: "a@b.com",
        actionType: "send_email",
        missionId: "m1",
        data: {},
      },
      createdAt: overrides.createdAt ?? "2026-06-10T00:00:00.000Z",
    });
  }

  t.beforeEach(() => __clearAgentExecutionIntentsForTests());
  t.afterEach(() => __clearAgentExecutionIntentsForTests());

  // ── Pure guard ──────────────────────────────────────────────────────────────
  await t.test("guard: absent intent -> not_found", () => {
    assert.deepEqual(resolveExecutionIntentRejection(null), { kind: "not_found" });
  });

  await t.test("guard: pending intent -> ok (narrows the intent)", () => {
    const intent = makeIntent();
    const decision = resolveExecutionIntentRejection(intent);
    assert.equal(decision.kind, "ok");
    assert.equal(decision.intent.intentId, "intent-1");
  });

  await t.test("guard: non-pending intent -> conflict (any non-pending status)", () => {
    for (const status of ["executing", "executed", "failed"]) {
      const decision = resolveExecutionIntentRejection({ ...makeIntent(), status });
      assert.equal(decision.kind, "conflict", `status ${status}`);
      assert.equal(decision.status, status);
    }
  });

  // ── Terminal transition the route applies ────────────────────────────────────
  await t.test("reject: pending -> failed with CEO_REJECTED, drops from pending", async () => {
    await createAgentExecutionIntent("ws1", USER, makeIntent());
    await createAgentExecutionIntent(
      "ws1",
      USER,
      makeIntent({ intentId: "intent-2", createdAt: "2026-06-11T00:00:00.000Z" }),
    );

    const rejected = await transitionAgentExecutionIntent("ws1", "intent-1", {
      toStatus: "failed",
      updatedAt: "t1",
      failureCode: EXECUTION_INTENT_REJECT_FAILURE_CODE,
    });
    assert.equal(rejected.status, "failed");
    assert.equal(rejected.failureCode, "CEO_REJECTED");

    const stillPending = await listPendingAgentExecutionIntents("ws1");
    assert.equal(stillPending.length, 1);
    assert.equal(stillPending[0].intentId, "intent-2");

    const got = await getAgentExecutionIntent("ws1", "intent-1");
    assert.equal(got.status, "failed");
    assert.equal(got.failureCode, "CEO_REJECTED");
  });

  // ── Terminal-state refusals at the model layer ───────────────────────────────
  await t.test("reject: an already-terminal intent cannot transition to failed", async () => {
    await createAgentExecutionIntent("ws1", USER, makeIntent());
    // Drive it to a terminal `executed` state first.
    await transitionAgentExecutionIntent("ws1", "intent-1", { toStatus: "executing", updatedAt: "t1" });
    await transitionAgentExecutionIntent("ws1", "intent-1", {
      toStatus: "executed",
      updatedAt: "t2",
      actionRef: "ref",
    });
    await assert.rejects(() =>
      transitionAgentExecutionIntent("ws1", "intent-1", {
        toStatus: "failed",
        updatedAt: "t3",
        failureCode: EXECUTION_INTENT_REJECT_FAILURE_CODE,
      }),
    );
  });

  await t.test("reject: a missing intent transition is refused", async () => {
    await assert.rejects(() =>
      transitionAgentExecutionIntent("ws1", "does-not-exist", {
        toStatus: "failed",
        updatedAt: "t1",
        failureCode: EXECUTION_INTENT_REJECT_FAILURE_CODE,
      }),
    );
  });
});
