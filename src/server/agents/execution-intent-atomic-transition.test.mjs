#!/usr/bin/env node

// src/server/agents/execution-intent-atomic-transition.test.mjs
//
// Proves the transition guard is atomic AND keyed on the CALLER's expected
// `from` status (not a fresh re-read). The dangerous race: a reject validated
// on `pending` must NOT apply once a concurrent approve advanced the row to
// `executing` (executing -> failed is otherwise legal). Covers both the
// Supabase path (injected fake client) and the in-memory path. No real
// Supabase, no network.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

function makeRow(status = "pending") {
  return {
    id: "row-1",
    workspace_id: "ws1",
    created_by_user_id: "u1",
    intent_id: "intent-1",
    agent_id: "hermes",
    skill_id: "task.create",
    tool_name: "n8n_webhook_trigger",
    autonomy_level: 2,
    status,
    payload: {
      agentId: "hermes",
      skillId: "task.create",
      client: "Acme",
      email: "a@b.com",
      actionType: "send_email",
      missionId: "m1",
      data: {},
    },
    action_ref: null,
    failure_code: null,
    requires_ceo_approval: true,
    created_at: "2026-06-10T00:00:00.000Z",
    updated_at: "2026-06-10T00:00:00.000Z",
  };
}

// Fake Supabase client. The read chain (select-only) returns `readRow`; the
// update chain (update + .eq + .select) returns `updateData` and records the eq
// filters so the test can assert which status the guard actually used.
function makeFakeClient({ readRow, updateData, captureUpdateEqs }) {
  function builder() {
    const state = { isUpdate: false, eqs: {} };
    const b = {
      select() {
        return b;
      },
      update() {
        state.isUpdate = true;
        return b;
      },
      eq(col, val) {
        state.eqs[col] = val;
        return b;
      },
      limit() {
        return b;
      },
      order() {
        return b;
      },
      then(resolve, reject) {
        if (state.isUpdate && captureUpdateEqs) captureUpdateEqs(state.eqs);
        const result = state.isUpdate
          ? { data: updateData, error: null }
          : { data: readRow ? [readRow] : [], error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return b;
  }
  return { from: () => builder() };
}

test("Atomic, caller-keyed execution-intent transition", async (t) => {
  process.env.NODE_ENV = "test";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const repo = await jiti.import(
    path.join(projectRoot, "src/server/agents/execution-intent-repository.ts"),
  );
  const {
    transitionAgentExecutionIntent,
    createAgentExecutionIntent,
    AgentExecutionIntentConcurrencyError,
    __clearAgentExecutionIntentsForTests,
  } = repo;
  const { buildAgentExecutionIntent } = await jiti.import(
    path.join(projectRoot, "src/features/agents/execution-intent.ts"),
  );

  t.afterEach(() => {
    delete globalThis.__agentExecutionIntentRepositoryClientFactory;
    __clearAgentExecutionIntentsForTests();
  });

  // ── Supabase path ────────────────────────────────────────────────────────────
  await t.test("Supabase: UPDATE is guarded by the observed status (default)", async () => {
    let updateEqs = null;
    globalThis.__agentExecutionIntentRepositoryClientFactory = () =>
      makeFakeClient({
        readRow: makeRow("pending"),
        updateData: [makeRow("failed")],
        captureUpdateEqs: (eqs) => (updateEqs = eqs),
      });

    const result = await transitionAgentExecutionIntent("ws1", "intent-1", {
      toStatus: "failed",
      updatedAt: "t1",
      failureCode: "CEO_REJECTED",
    });

    assert.equal(result.status, "failed");
    assert.equal(updateEqs.workspace_id, "ws1");
    assert.equal(updateEqs.intent_id, "intent-1");
    assert.equal(updateEqs.status, "pending");
  });

  await t.test("Supabase: zero affected rows -> concurrency error", async () => {
    globalThis.__agentExecutionIntentRepositoryClientFactory = () =>
      makeFakeClient({ readRow: makeRow("pending"), updateData: [] });

    await assert.rejects(
      () =>
        transitionAgentExecutionIntent("ws1", "intent-1", {
          toStatus: "failed",
          updatedAt: "t1",
          failureCode: "CEO_REJECTED",
        }),
      (err) => err instanceof AgentExecutionIntentConcurrencyError,
    );
  });

  await t.test(
    "Supabase: stale reject guards on expectedFromStatus, NOT the fresh read",
    async () => {
      // A concurrent approve already advanced the row to `executing`; the reject
      // still validated on `pending`. The UPDATE must be keyed on `pending` (so
      // it matches zero rows) -- never on the newer `executing`.
      let updateEqs = null;
      globalThis.__agentExecutionIntentRepositoryClientFactory = () =>
        makeFakeClient({
          readRow: makeRow("executing"),
          updateData: [], // guarded on `pending` -> nothing to update
          captureUpdateEqs: (eqs) => (updateEqs = eqs),
        });

      await assert.rejects(
        () =>
          transitionAgentExecutionIntent("ws1", "intent-1", {
            toStatus: "failed",
            expectedFromStatus: "pending",
            updatedAt: "t1",
            failureCode: "CEO_REJECTED",
          }),
        (err) => err instanceof AgentExecutionIntentConcurrencyError,
      );
      assert.equal(
        updateEqs.status,
        "pending",
        "guard uses caller's expected status, not the fresh read",
      );
    },
  );

  // ── In-memory path ───────────────────────────────────────────────────────────
  await t.test(
    "in-memory: stale reject (expect pending) cannot overwrite an executing intent",
    async () => {
      const intent = buildAgentExecutionIntent({
        intentId: "intent-1",
        workspaceId: "ws1",
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
        createdAt: "2026-06-10T00:00:00.000Z",
      });
      await createAgentExecutionIntent("ws1", "u1", intent);
      // A concurrent approve advances it to executing.
      await transitionAgentExecutionIntent("ws1", "intent-1", {
        toStatus: "executing",
        expectedFromStatus: "pending",
        updatedAt: "t1",
      });

      // The stale reject (validated on pending) must NOT overwrite it.
      await assert.rejects(
        () =>
          transitionAgentExecutionIntent("ws1", "intent-1", {
            toStatus: "failed",
            expectedFromStatus: "pending",
            updatedAt: "t2",
            failureCode: "CEO_REJECTED",
          }),
        (err) => err instanceof AgentExecutionIntentConcurrencyError,
      );
    },
  );
});
