#!/usr/bin/env node

// src/server/outbound/outbound-executor-dry-run.test.mjs
//
// Pure unit tests for the dry-run execution bridge.
// No DB, no network, no real sends.

import assert from "node:assert/strict";
import test from "node:test";

const { executeBatchDryRun, isActionAlreadyProcessed } = await import("./outbound-executor-dry-run.ts");
const { generateApprovalToken } = await import("./outbound-batch-approval.ts");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date().toISOString();
const FUTURE = new Date(Date.now() + 3600_000).toISOString();
const PAST = new Date(Date.now() - 3600_000).toISOString();

function makeApprovedBatch(overrides = {}) {
  const contentHash = "hash_abc123";
  const approvalToken = generateApprovalToken(contentHash, "ceo_michael", NOW);

  return {
    id: "batch_001",
    workspaceId: "ws_test",
    agentId: "agent_hermes",
    subVoie: "follow_up",
    audienceType: "warm_lead",
    recipientCount: 2,
    messageTemplate: "Hi {{name}},\n\nFollowing up on our conversation.\n\nBest,\nMichael",
    aiDisclosure: "Assisted by Orya HQ AI",
    consentBasis: "implied_verified",
    consentProvenance: [{ type: "email_reply", source: "crm", value: "prior-contact" }],
    unsubscribeMechanism: "present",
    jurisdiction: "CA",
    riskLevel: "medium",
    approvalMode: "batch",
    contentHash,
    approvalToken,
    approvedBy: "ceo_michael",
    approvedAt: NOW,
    sendWindow: { start: PAST, end: FUTURE },
    volumeCap: 10,
    state: "approved",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeAction(id, leadId, overrides = {}) {
  return {
    id,
    workspaceId: "ws_test",
    batchId: "batch_001",
    leadId,
    idempotencyKey: `batch_001:${leadId}`,
    actionType: "follow_up",
    renderedSubject: "Following up",
    renderedBody: `Hi ${leadId},\n\nFollowing up on our conversation.\n\nBest,\nMichael`,
    personalizationSources: [],
    modelUsed: "claude-haiku-4-5",
    costEstimateCents: 1,
    state: "queued",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Successful dry-run
// ---------------------------------------------------------------------------

test("executeBatchDryRun — ok on approved batch with open window", () => {
  const batch = makeApprovedBatch();
  const actions = [makeAction("act_1", "lead_alice"), makeAction("act_2", "lead_bob")];

  const result = executeBatchDryRun(batch, actions);

  assert.strictEqual(result.status, "ok");
  assert.strictEqual(result.dryRun, true);
  assert.strictEqual(result.totalActions, 2);
  assert.strictEqual(result.actions.length, 2);
});

test("executeBatchDryRun — actions reach sent state", () => {
  const batch = makeApprovedBatch();
  const actions = [makeAction("act_1", "lead_alice")];

  const result = executeBatchDryRun(batch, actions);

  assert.strictEqual(result.actions[0].action.state, "sent");
  assert.ok(result.actions[0].action.sentAt);
});

test("executeBatchDryRun — webhook payload has all required fields", () => {
  const batch = makeApprovedBatch();
  const actions = [makeAction("act_1", "lead_alice")];

  const result = executeBatchDryRun(batch, actions);
  const payload = result.actions[0].webhookPayload;

  assert.strictEqual(payload.dryRun, true);
  assert.strictEqual(payload.batchId, "batch_001");
  assert.strictEqual(payload.leadId, "lead_alice");
  assert.strictEqual(payload.idempotencyKey, "batch_001:lead_alice");
  assert.ok(payload.unsubscribeUrl.includes("lead_alice"));
  assert.ok(payload.aiDisclosure.length > 0);
  assert.ok(payload.jurisdiction === "CA");
});

test("executeBatchDryRun — simulated callback has idempotency key", () => {
  const batch = makeApprovedBatch();
  const actions = [makeAction("act_1", "lead_alice")];

  const result = executeBatchDryRun(batch, actions);
  const cb = result.actions[0].simulatedCallback;

  assert.strictEqual(cb.dryRun, true);
  assert.strictEqual(cb.outcome, "simulated_sent");
  assert.strictEqual(cb.idempotencyKey, "batch_001:lead_alice");
  assert.ok(cb.callbackSignature.startsWith("dry-run:"));
});

test("executeBatchDryRun — ledger note present for each action", () => {
  const batch = makeApprovedBatch();
  const actions = [makeAction("act_1", "lead_alice"), makeAction("act_2", "lead_bob")];

  const result = executeBatchDryRun(batch, actions);

  for (const r of result.actions) {
    assert.ok(r.ledgerNote.includes("[DRY-RUN]"));
    assert.ok(r.ledgerNote.includes("outbound.sent"));
  }
});

// ---------------------------------------------------------------------------
// Blocked cases
// ---------------------------------------------------------------------------

test("executeBatchDryRun — BLOCKED if batch not in approved state", () => {
  const batch = makeApprovedBatch({ state: "pending_approval" });
  const result = executeBatchDryRun(batch, []);

  assert.strictEqual(result.status, "blocked");
  assert.ok(result.blockReason?.includes("pending_approval"));
  assert.strictEqual(result.totalActions, 0);
});

test("executeBatchDryRun — BLOCKED if contentHash changed after approval (token invalid)", () => {
  const batch = makeApprovedBatch({ contentHash: "different_hash" });
  const result = executeBatchDryRun(batch, []);

  assert.strictEqual(result.status, "blocked");
  assert.ok(result.blockReason?.includes("approvalToken"));
});

test("executeBatchDryRun — BLOCKED if send window expired", () => {
  const batch = makeApprovedBatch({
    sendWindow: { start: PAST, end: new Date(Date.now() - 60_000).toISOString() },
  });
  const result = executeBatchDryRun(batch, []);

  assert.strictEqual(result.status, "blocked");
  assert.ok(result.blockReason?.includes("Send window"));
});

test("executeBatchDryRun — BLOCKED if batch is blocked state", () => {
  const batch = makeApprovedBatch({ state: "blocked" });
  const result = executeBatchDryRun(batch, []);

  assert.strictEqual(result.status, "blocked");
});

// ---------------------------------------------------------------------------
// Idempotency guard
// ---------------------------------------------------------------------------

test("isActionAlreadyProcessed — false for queued actions", () => {
  assert.ok(!isActionAlreadyProcessed(makeAction("a", "l")));
});

test("isActionAlreadyProcessed — true for sent/delivered/closed/orphaned", () => {
  for (const state of ["sent", "delivered", "bounced", "outcome_captured", "closed", "orphaned"]) {
    assert.ok(isActionAlreadyProcessed(makeAction("a", "l", { state })),
      `should be true for state: ${state}`);
  }
});

// ---------------------------------------------------------------------------
// Empty batch
// ---------------------------------------------------------------------------

test("executeBatchDryRun — ok with zero actions", () => {
  const batch = makeApprovedBatch();
  const result = executeBatchDryRun(batch, []);

  assert.strictEqual(result.status, "ok");
  assert.strictEqual(result.totalActions, 0);
  assert.strictEqual(result.dryRun, true);
});
