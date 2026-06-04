#!/usr/bin/env node

// src/server/outbound/outbound-policy-engine.test.mjs
//
// Pure unit tests for canExecuteOutboundAction().
// No DB, no network, no side effects.

import assert from "node:assert/strict";
import test from "node:test";

const { canExecuteOutboundAction } = await import("./outbound-policy-engine.ts");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBatch(overrides = {}) {
  return {
    id: "batch_test",
    workspaceId: "ws_test",
    agentId: "agent_hermes",
    subVoie: "follow_up",
    audienceType: "warm_lead",
    recipientCount: 5,
    messageTemplate: "Hi {{name}}, following up...",
    aiDisclosure: "Assisted by Orya HQ AI",
    consentBasis: "implied_verified",
    consentProvenance: [{ type: "email_reply", source: "crm", value: "prior-interaction" }],
    unsubscribeMechanism: "present",
    jurisdiction: "CA",
    riskLevel: "medium",
    approvalMode: "batch",
    contentHash: "abc123",
    sendWindow: { start: "2026-06-04T08:00:00Z", end: "2026-06-04T18:00:00Z" },
    volumeCap: 10,
    state: "policy_checked",
    createdAt: "2026-06-03T00:00:00Z",
    updatedAt: "2026-06-03T00:00:00Z",
    ...overrides,
  };
}

const noSuppression = [];
const noReputation = null;
const noBudget = null;
const noOrgBudget = null;

// ---------------------------------------------------------------------------
// HARD BLOCKS
// ---------------------------------------------------------------------------

test("BLOCK — consentBasis unknown", () => {
  const result = canExecuteOutboundAction({
    batch: makeBatch({ consentBasis: "unknown" }),
    suppressionEntries: noSuppression,
    reputationState: noReputation,
    agentBudgetGuard: noBudget,
    orgBudgetGuard: noOrgBudget,
    agentDailyUsdSpent: 0,
    orgDailyUsdSpent: 0,
  });
  assert.strictEqual(result.decision, "BLOCK");
  assert.ok(result.record.consentIssues.length > 0);
});

test("BLOCK — unsubscribe mechanism absent", () => {
  const result = canExecuteOutboundAction({
    batch: makeBatch({ unsubscribeMechanism: "absent" }),
    suppressionEntries: noSuppression,
    reputationState: noReputation,
    agentBudgetGuard: noBudget,
    orgBudgetGuard: noOrgBudget,
    agentDailyUsdSpent: 0,
    orgDailyUsdSpent: 0,
  });
  assert.strictEqual(result.decision, "BLOCK");
  assert.ok(result.record.complianceFlags.some((f) => f.includes("unsubscribe")));
});

test("BLOCK — suppression hit", () => {
  const result = canExecuteOutboundAction({
    batch: makeBatch(),
    suppressionEntries: [
      { id: "s1", workspaceId: "ws_test", contactKey: "test@example.com",
        reason: "unsubscribed", source: { type: "email_reply", source: "crm", value: "x" },
        createdAt: "2026-06-01T00:00:00Z" },
    ],
    reputationState: noReputation,
    agentBudgetGuard: noBudget,
    orgBudgetGuard: noOrgBudget,
    agentDailyUsdSpent: 0,
    orgDailyUsdSpent: 0,
  });
  assert.strictEqual(result.decision, "BLOCK");
  assert.strictEqual(result.record.suppressionHits, 1);
});

test("BLOCK — circuit breaker open", () => {
  const result = canExecuteOutboundAction({
    batch: makeBatch(),
    suppressionEntries: noSuppression,
    reputationState: {
      mailboxId: "mx1", workspaceId: "ws_test", domain: "oria-hq.cloud",
      dailySentCount: 10, dailyCap: 100,
      rollingBounceRate: 0.12, rollingComplaintRate: 0.002,
      circuitBreaker: "open", lastUpdatedAt: "2026-06-03T12:00:00Z",
    },
    agentBudgetGuard: noBudget,
    orgBudgetGuard: noOrgBudget,
    agentDailyUsdSpent: 0,
    orgDailyUsdSpent: 0,
  });
  assert.strictEqual(result.decision, "BLOCK");
  assert.ok(result.record.reputationWarnings.some((w) => w.includes("Circuit breaker")));
});

test("BLOCK — recipientCount exceeds volumeCap", () => {
  const result = canExecuteOutboundAction({
    batch: makeBatch({ recipientCount: 20, volumeCap: 10 }),
    suppressionEntries: noSuppression,
    reputationState: noReputation,
    agentBudgetGuard: noBudget,
    orgBudgetGuard: noOrgBudget,
    agentDailyUsdSpent: 0,
    orgDailyUsdSpent: 0,
  });
  assert.strictEqual(result.decision, "BLOCK");
  assert.ok(result.record.reasons.some((r) => r.includes("volumeCap")));
});

test("BLOCK — daily cap reached", () => {
  const result = canExecuteOutboundAction({
    batch: makeBatch(),
    suppressionEntries: noSuppression,
    reputationState: {
      mailboxId: "mx1", workspaceId: "ws_test", domain: "oria-hq.cloud",
      dailySentCount: 100, dailyCap: 100,
      rollingBounceRate: 0.01, rollingComplaintRate: 0.0001,
      circuitBreaker: "closed", lastUpdatedAt: "2026-06-03T12:00:00Z",
    },
    agentBudgetGuard: noBudget,
    orgBudgetGuard: noOrgBudget,
    agentDailyUsdSpent: 0,
    orgDailyUsdSpent: 0,
  });
  assert.strictEqual(result.decision, "BLOCK");
  assert.ok(result.record.reputationWarnings.some((w) => w.includes("Daily sending cap")));
});

test("BLOCK — agent USD budget exceeded", () => {
  const result = canExecuteOutboundAction({
    batch: makeBatch(),
    suppressionEntries: noSuppression,
    reputationState: noReputation,
    agentBudgetGuard: {
      agentId: "agent_hermes", workspaceId: "ws_test",
      dailyTokenBudget: 100000, dailyUsdBudget: 5,
      maxLoopsPerTask: 10, maxRetries: 3,
      repetitionDetection: { enabled: true, window: 10, haltAfterK: 3 },
      escalationThreshold: 3,
    },
    orgBudgetGuard: noOrgBudget,
    agentDailyUsdSpent: 5,
    orgDailyUsdSpent: 0,
  });
  assert.strictEqual(result.decision, "BLOCK");
  assert.ok(result.record.reasons.some((r) => r.includes("daily USD budget exceeded")));
});

test("BLOCK — org daily cap exceeded", () => {
  const result = canExecuteOutboundAction({
    batch: makeBatch(),
    suppressionEntries: noSuppression,
    reputationState: noReputation,
    agentBudgetGuard: noBudget,
    orgBudgetGuard: { workspaceId: "ws_test", dailyUsdCap: 20, monthlyUsdCap: 500 },
    agentDailyUsdSpent: 0,
    orgDailyUsdSpent: 20,
  });
  assert.strictEqual(result.decision, "BLOCK");
  assert.ok(result.record.reasons.some((r) => r.includes("Org daily USD cap")));
});

test("BLOCK — CASL implied_verified without consentProvenance", () => {
  const result = canExecuteOutboundAction({
    batch: makeBatch({ jurisdiction: "CA", consentBasis: "implied_verified", consentProvenance: [] }),
    suppressionEntries: noSuppression,
    reputationState: noReputation,
    agentBudgetGuard: noBudget,
    orgBudgetGuard: noOrgBudget,
    agentDailyUsdSpent: 0,
    orgDailyUsdSpent: 0,
  });
  assert.strictEqual(result.decision, "BLOCK");
  assert.ok(result.record.consentIssues.some((i) => i.includes("CASL")));
});

// ---------------------------------------------------------------------------
// GREEN ZONE (ALLOW)
// ---------------------------------------------------------------------------

test("ALLOW — internal_test audience", () => {
  const result = canExecuteOutboundAction({
    batch: makeBatch({ audienceType: "internal_test" }),
    suppressionEntries: noSuppression,
    reputationState: noReputation,
    agentBudgetGuard: noBudget,
    orgBudgetGuard: noOrgBudget,
    agentDailyUsdSpent: 0,
    orgDailyUsdSpent: 0,
  });
  assert.strictEqual(result.decision, "ALLOW");
  assert.ok(result.record.reasons.some((r) => r.includes("internal_test")));
});

test("ALLOW — reply_assist on known_contact with valid approval token", () => {
  const result = canExecuteOutboundAction({
    batch: makeBatch({ subVoie: "reply_assist", audienceType: "known_contact", approvalToken: "tok_abc" }),
    suppressionEntries: noSuppression,
    reputationState: noReputation,
    agentBudgetGuard: noBudget,
    orgBudgetGuard: noOrgBudget,
    agentDailyUsdSpent: 0,
    orgDailyUsdSpent: 0,
  });
  assert.strictEqual(result.decision, "ALLOW");
  assert.ok(result.record.reasons.some((r) => r.includes("reply_assist")));
});

// ---------------------------------------------------------------------------
// YELLOW ZONE (REQUIRE_APPROVAL)
// ---------------------------------------------------------------------------

test("REQUIRE_APPROVAL — follow_up on warm_lead", () => {
  const result = canExecuteOutboundAction({
    batch: makeBatch({ subVoie: "follow_up", audienceType: "warm_lead" }),
    suppressionEntries: noSuppression,
    reputationState: noReputation,
    agentBudgetGuard: noBudget,
    orgBudgetGuard: noOrgBudget,
    agentDailyUsdSpent: 0,
    orgDailyUsdSpent: 0,
  });
  assert.strictEqual(result.decision, "REQUIRE_APPROVAL");
});

test("REQUIRE_APPROVAL — cold_email + cold_prospect (Yellow strict)", () => {
  const result = canExecuteOutboundAction({
    batch: makeBatch({
      subVoie: "cold_email",
      audienceType: "cold_prospect",
      consentBasis: "express",
      consentProvenance: [{ type: "email_reply", source: "crm", value: "opt-in-form" }],
    }),
    suppressionEntries: noSuppression,
    reputationState: noReputation,
    agentBudgetGuard: noBudget,
    orgBudgetGuard: noOrgBudget,
    agentDailyUsdSpent: 0,
    orgDailyUsdSpent: 0,
  });
  assert.strictEqual(result.decision, "REQUIRE_APPROVAL");
  assert.ok(result.record.reasons.some((r) => r.includes("Yellow strict")));
});

test("REQUIRE_APPROVAL — re_activation on warm_lead", () => {
  const result = canExecuteOutboundAction({
    batch: makeBatch({ subVoie: "re_activation", audienceType: "warm_lead" }),
    suppressionEntries: noSuppression,
    reputationState: noReputation,
    agentBudgetGuard: noBudget,
    orgBudgetGuard: noOrgBudget,
    agentDailyUsdSpent: 0,
    orgDailyUsdSpent: 0,
  });
  assert.strictEqual(result.decision, "REQUIRE_APPROVAL");
});
