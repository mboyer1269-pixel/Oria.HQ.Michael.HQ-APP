#!/usr/bin/env node

// src/features/agents/execution-intent-review-projection.test.mjs

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
  projectExecutionIntentForReview,
  projectExecutionIntentsForReview,
  resolveExecutionIntentPanelState,
} = await jiti.import(path.join(__dirname, "execution-intent-review-projection.ts"));

function baseIntent(overrides = {}) {
  return {
    intentId: "intent-1",
    workspaceId: "ws1",
    agentId: "hermes",
    skillId: "task.create",
    toolName: "n8n_webhook_trigger",
    autonomyLevel: 2,
    status: "pending",
    payload: {
      agentId: "hermes",
      skillId: "task.create",
      client: "Acme",
      email: "a@b.com",
      actionType: "send_email",
      missionId: "m1",
      data: { subject: "Hello", body: "World" },
    },
    createdAt: "2026-06-10T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
    requiresCeoApproval: true,
    ...overrides,
  };
}

describe("execution-intent review projection", () => {
  test("maps the display fields the panel needs", () => {
    const row = projectExecutionIntentForReview(baseIntent());
    assert.equal(row.intentId, "intent-1");
    assert.equal(row.agentId, "hermes");
    assert.equal(row.skillId, "task.create");
    assert.equal(row.actionType, "send_email");
    assert.equal(row.status, "pending");
    assert.equal(row.createdAt, "2026-06-10T00:00:00.000Z");
    assert.equal(row.autonomyLevel, 2);
    assert.equal(row.toolName, "n8n_webhook_trigger");
    assert.equal(row.payloadSummary.client, "Acme");
    assert.equal(row.payloadSummary.email, "a@b.com");
    assert.equal(row.payloadSummary.missionId, "m1");
    assert.deepEqual(row.payloadSummary.dataKeys, ["subject", "body"]);
  });

  test("actionRef and ventureId default to null when absent", () => {
    const row = projectExecutionIntentForReview(baseIntent());
    assert.equal(row.actionRef, null);
    assert.equal(row.payloadSummary.ventureId, null);
  });

  test("surfaces actionRef and ventureId when present", () => {
    const row = projectExecutionIntentForReview(
      baseIntent({
        actionRef: "n8n-run-42",
        payload: { ...baseIntent().payload, ventureId: "loi96" },
      }),
    );
    assert.equal(row.actionRef, "n8n-run-42");
    assert.equal(row.payloadSummary.ventureId, "loi96");
  });

  test("tolerates a missing/empty data object", () => {
    const row = projectExecutionIntentForReview(
      baseIntent({ payload: { ...baseIntent().payload, data: {} } }),
    );
    assert.deepEqual(row.payloadSummary.dataKeys, []);
  });

  test("projects a list preserving order", () => {
    const rows = projectExecutionIntentsForReview([
      baseIntent({ intentId: "a" }),
      baseIntent({ intentId: "b" }),
    ]);
    assert.deepEqual(
      rows.map((r) => r.intentId),
      ["a", "b"],
    );
  });
});

describe("execution-intent panel state", () => {
  test("not_configured when the rail is unavailable, regardless of rows", () => {
    assert.equal(
      resolveExecutionIntentPanelState({ railConfigured: false, rows: [] }),
      "not_configured",
    );
    assert.equal(
      resolveExecutionIntentPanelState({
        railConfigured: false,
        rows: [projectExecutionIntentForReview(baseIntent())],
      }),
      "not_configured",
    );
  });

  test("empty when configured but no pending intents", () => {
    assert.equal(
      resolveExecutionIntentPanelState({ railConfigured: true, rows: [] }),
      "empty",
    );
  });

  test("has_pending when configured with at least one intent", () => {
    assert.equal(
      resolveExecutionIntentPanelState({
        railConfigured: true,
        rows: [projectExecutionIntentForReview(baseIntent())],
      }),
      "has_pending",
    );
  });
});
