#!/usr/bin/env node

// src/server/agents/execution-intent-atomic-transition.test.mjs
//
// Proves the Supabase-path transition is atomically conditional on the observed
// `from` status: the UPDATE carries `.eq("status", current.status)` and a
// zero-row result raises AgentExecutionIntentConcurrencyError (lost race),
// instead of silently "succeeding" and overwriting a row another request moved.
//
// Uses an injected fake Supabase client via the repository's global factory.
// No real Supabase, no network.

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
// update chain (update + .eq.status + .select) returns `updateData` and records
// the eq filters so the test can assert the atomic status guard was applied.
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

test("Atomic execution-intent transition (Supabase path)", async (t) => {
  process.env.NODE_ENV = "test";

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
    AgentExecutionIntentConcurrencyError,
  } = repo;

  t.afterEach(() => {
    delete globalThis.__agentExecutionIntentRepositoryClientFactory;
  });

  await t.test("update is conditional on the observed status (atomic guard)", async () => {
    let updateEqs = null;
    const client = makeFakeClient({
      readRow: makeRow("pending"),
      updateData: [makeRow("failed")], // 1 row affected -> success
      captureUpdateEqs: (eqs) => {
        updateEqs = eqs;
      },
    });
    globalThis.__agentExecutionIntentRepositoryClientFactory = () => client;

    const result = await transitionAgentExecutionIntent("ws1", "intent-1", {
      toStatus: "failed",
      updatedAt: "t1",
      failureCode: "CEO_REJECTED",
    });

    assert.equal(result.status, "failed");
    // The UPDATE was scoped by workspace, intent AND the observed status.
    assert.equal(updateEqs.workspace_id, "ws1");
    assert.equal(updateEqs.intent_id, "intent-1");
    assert.equal(updateEqs.status, "pending", "atomic guard: UPDATE ... WHERE status = observed");
  });

  await t.test("zero affected rows -> AgentExecutionIntentConcurrencyError (lost race)", async () => {
    const client = makeFakeClient({
      readRow: makeRow("pending"),
      updateData: [], // the row moved out of `pending` concurrently
    });
    globalThis.__agentExecutionIntentRepositoryClientFactory = () => client;

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
});
