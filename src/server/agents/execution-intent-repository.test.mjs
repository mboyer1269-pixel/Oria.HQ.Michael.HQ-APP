#!/usr/bin/env node

// src/server/agents/execution-intent-repository.test.mjs

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

// Force the local-fallback path: with no Supabase config the repository resolves
// a null client. serverEnv reads process.env eagerly at import.
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

test("Agent execution intent repository", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const repo = await jiti.import(path.join(__dirname, "execution-intent-repository.ts"));
  const { buildAgentExecutionIntent } = await jiti.import(
    path.join(projectRoot, "src/features/agents/execution-intent.ts"),
  );

  const {
    createAgentExecutionIntent,
    getAgentExecutionIntent,
    listPendingAgentExecutionIntents,
    transitionAgentExecutionIntent,
    getAgentExecutionIntentPersistenceMode,
    AgentExecutionIntentTransitionError,
    AgentExecutionIntentNotFoundError,
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

  await t.test("persistence mode is local outside production", () => {
    assert.equal(getAgentExecutionIntentPersistenceMode(), "local");
  });

  await t.test("create then getById returns a pending intent", async () => {
    await createAgentExecutionIntent("ws1", USER, makeIntent());
    const got = await getAgentExecutionIntent("ws1", "intent-1");
    assert.ok(got);
    assert.equal(got.status, "pending");
    assert.equal(got.payload.client, "Acme");
    assert.equal(got.requiresCeoApproval, true);
  });

  await t.test("listPending only returns pending intents in the workspace", async () => {
    await createAgentExecutionIntent("ws1", USER, makeIntent({ intentId: "a" }));
    await createAgentExecutionIntent("ws1", USER, makeIntent({ intentId: "b", createdAt: "2026-06-11T00:00:00.000Z" }));
    await createAgentExecutionIntent("ws2", USER, makeIntent({ intentId: "c" }));

    const pending = await listPendingAgentExecutionIntents("ws1");
    assert.equal(pending.length, 2);
    assert.equal(pending[0].intentId, "b", "most-recent first");

    // Transition one away from pending; it drops out of the pending list.
    await transitionAgentExecutionIntent("ws1", "a", { toStatus: "executing", updatedAt: "t1" });
    const stillPending = await listPendingAgentExecutionIntents("ws1");
    assert.equal(stillPending.length, 1);
    assert.equal(stillPending[0].intentId, "b");
  });

  await t.test("pending -> executing -> executed records the action ref", async () => {
    await createAgentExecutionIntent("ws1", USER, makeIntent());
    await transitionAgentExecutionIntent("ws1", "intent-1", { toStatus: "executing", updatedAt: "t1" });
    const done = await transitionAgentExecutionIntent("ws1", "intent-1", {
      toStatus: "executed",
      updatedAt: "t2",
      actionRef: "n8n_ref_1",
    });
    assert.equal(done.status, "executed");
    assert.equal(done.actionRef, "n8n_ref_1");
  });

  await t.test("an illegal transition throws and does not mutate", async () => {
    await createAgentExecutionIntent("ws1", USER, makeIntent());
    await assert.rejects(
      () => transitionAgentExecutionIntent("ws1", "intent-1", { toStatus: "executed", updatedAt: "t1" }),
      (err) => err instanceof AgentExecutionIntentTransitionError,
    );
    const got = await getAgentExecutionIntent("ws1", "intent-1");
    assert.equal(got.status, "pending", "intent stays pending after illegal transition");
  });

  await t.test("transition on a missing intent throws not-found", async () => {
    await assert.rejects(
      () => transitionAgentExecutionIntent("ws1", "nope", { toStatus: "executing", updatedAt: "t1" }),
      (err) => err instanceof AgentExecutionIntentNotFoundError,
    );
  });

  await t.test("workspace isolation: getById does not cross workspaces", async () => {
    await createAgentExecutionIntent("ws1", USER, makeIntent({ intentId: "x" }));
    assert.equal(await getAgentExecutionIntent("ws2", "x"), null);
  });
});
