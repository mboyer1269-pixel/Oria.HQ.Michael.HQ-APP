#!/usr/bin/env node

// src/features/agents/execution-intent.test.mjs

import assert from "node:assert/strict";
import path from "node:path";
import test, { describe } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(projectRoot, "src") },
});

const {
  buildAgentExecutionIntent,
  validateAgentExecutionIntent,
  canTransitionExecutionIntent,
  AGENT_EXECUTION_INTENT_STATUSES,
} = await jiti.import(path.join(__dirname, "execution-intent.ts"));

function baseInput(overrides = {}) {
  return {
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
    ...overrides,
  };
}

describe("AgentExecutionIntent model", () => {
  test("builder forces status=pending and requiresCeoApproval=true", () => {
    const intent = buildAgentExecutionIntent(baseInput());
    assert.equal(intent.status, "pending");
    assert.equal(intent.requiresCeoApproval, true);
    assert.equal(intent.updatedAt, intent.createdAt);
    assert.equal(validateAgentExecutionIntent(intent).valid, true);
  });

  test("validation flags a forged executed intent without approval lock", () => {
    const intent = buildAgentExecutionIntent(baseInput());
    const forged = { ...intent, status: "executed", requiresCeoApproval: false };
    const result = validateAgentExecutionIntent(forged);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => /requiresCeoApproval must be true/.test(e)));
  });

  test("validation rejects a malformed payload (bad email, missing client)", () => {
    const intent = buildAgentExecutionIntent(
      baseInput({ payload: { ...baseInput().payload, email: "nope", client: "" } }),
    );
    const result = validateAgentExecutionIntent(intent);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => /payload.email/.test(e)));
    assert.ok(result.errors.some((e) => /payload.client/.test(e)));
  });

  test("legal transitions only", () => {
    assert.equal(canTransitionExecutionIntent("pending", "executing"), true);
    assert.equal(canTransitionExecutionIntent("pending", "failed"), true);
    assert.equal(canTransitionExecutionIntent("executing", "executed"), true);
    assert.equal(canTransitionExecutionIntent("executing", "failed"), true);
    assert.equal(canTransitionExecutionIntent("executing", "pending"), true);
    // Illegal jumps
    assert.equal(canTransitionExecutionIntent("pending", "executed"), false);
    assert.equal(canTransitionExecutionIntent("executed", "pending"), false);
    assert.equal(canTransitionExecutionIntent("failed", "executing"), false);
  });

  test("status whitelist is exactly the four states", () => {
    assert.deepEqual([...AGENT_EXECUTION_INTENT_STATUSES], [
      "pending",
      "executing",
      "executed",
      "failed",
    ]);
  });
});
