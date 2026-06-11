#!/usr/bin/env node

// src/server/outbound/outbound-executor-live.test.mjs
//
// Pure unit tests for executeSingleSendLive(). All effects faked via ports.
// No DB, no network.

import assert from "node:assert/strict";
import test from "node:test";

const { executeSingleSendLive } = await import("./outbound-executor-live.ts");
const { generateApprovalToken } = await import("./outbound-batch-approval.ts");

const HASH = "hash_abc123";

function makeBatch(overrides = {}) {
  return {
    id: "batch_1",
    workspaceId: "ws_1",
    agentId: "agent_hermes",
    subVoie: "cold_email",
    audienceType: "cold_prospect",
    recipientCount: 1,
    messageTemplate: "tpl",
    aiDisclosure: "Assisted by Orya HQ AI",
    consentBasis: "implied_verified",
    consentProvenance: [],
    unsubscribeMechanism: "present",
    jurisdiction: "CA",
    riskLevel: "medium",
    approvalMode: "per_message",
    contentHash: HASH,
    approvalToken: generateApprovalToken(HASH, "michael", "2026-06-10T08:00:00Z"),
    approvedBy: "michael",
    approvedAt: "2026-06-10T08:00:00Z",
    sendWindow: {
      start: new Date(Date.now() - 3_600_000).toISOString(),
      end: new Date(Date.now() + 3_600_000).toISOString(),
    },
    volumeCap: 20,
    state: "approved",
    createdAt: "2026-06-10T07:00:00Z",
    updatedAt: "2026-06-10T08:00:00Z",
    ...overrides,
  };
}

function makeAction(overrides = {}) {
  return {
    id: "act_1",
    workspaceId: "ws_1",
    batchId: "batch_1",
    leadId: "lead_leetwo",
    idempotencyKey: "batch_1:lead_leetwo",
    actionType: "cold_email",
    renderedSubject: "7 non-conformités Loi 96 sur leetwo.com",
    renderedBody: "Bonjour, voici votre audit personnalisé…",
    personalizationSources: [],
    modelUsed: "claude",
    costEstimateCents: 12,
    state: "queued",
    createdAt: "2026-06-10T08:00:00Z",
    updatedAt: "2026-06-10T08:00:00Z",
    ...overrides,
  };
}

function makePorts(overrides = {}) {
  const calls = { sends: [], ledger: [], outcomes: [] };
  const ports = {
    channelSend: {
      async send(input) {
        calls.sends.push(input);
        return { ok: true, providerMessageId: "msg_123" };
      },
    },
    async isSuppressed() {
      return false;
    },
    async getRecordedOutcome() {
      return null;
    },
    async recordOutcome(key, result) {
      calls.outcomes.push({ key, result });
    },
    async recordLedgerEvent(event) {
      calls.ledger.push(event);
      return { ledgerEventId: `ledger_${calls.ledger.length}` };
    },
    async sentTodayOnChannel() {
      return 0;
    },
    ...overrides,
  };
  return { ports, calls };
}

function makeRequest(overrides = {}) {
  return {
    batch: makeBatch(),
    action: makeAction(),
    recipient: "sales@leetwo.com",
    channelId: "email",
    recipientLocalHour: 10,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test("sends one email and records ledger before + after dispatch", async () => {
  const { ports, calls } = makePorts();
  const result = await executeSingleSendLive(makeRequest(), ports);

  assert.equal(result.status, "sent");
  assert.equal(result.alreadySent, false);
  assert.equal(result.providerMessageId, "msg_123");
  assert.equal(calls.sends.length, 1);
  assert.equal(calls.sends[0].to, "sales@leetwo.com");
  // Ledger: pre-dispatch action event THEN result event.
  assert.equal(calls.ledger.length, 2);
  assert.equal(calls.ledger[0].eventType, "action");
  assert.equal(calls.ledger[0].actionType, "outbound.email.send");
  assert.equal(calls.ledger[1].eventType, "result");
  assert.equal(calls.ledger[1].actionType, "outbound.email.sent");
  // Outcome recorded for idempotency.
  assert.equal(calls.outcomes.length, 1);
  assert.equal(calls.outcomes[0].key, "batch_1:lead_leetwo");
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

test("repeated idempotencyKey returns recorded outcome and never re-sends", async () => {
  const previous = {
    status: "sent",
    actionId: "act_1",
    idempotencyKey: "batch_1:lead_leetwo",
    channelId: "email",
    providerMessageId: "msg_previous",
    ledgerEventId: "ledger_x",
    sentAt: "2026-06-10T09:00:00Z",
    alreadySent: false,
  };
  const { ports, calls } = makePorts({
    async getRecordedOutcome() {
      return previous;
    },
  });
  const result = await executeSingleSendLive(makeRequest(), ports);
  assert.equal(result.status, "sent");
  assert.equal(result.alreadySent, true);
  assert.equal(result.providerMessageId, "msg_previous");
  assert.equal(calls.sends.length, 0);
  assert.equal(calls.ledger.length, 0);
});

// ---------------------------------------------------------------------------
// Approval / batch validations (same as dry-run)
// ---------------------------------------------------------------------------

test("blocks when approvalMode is not per_message", async () => {
  const { ports, calls } = makePorts();
  const result = await executeSingleSendLive(
    makeRequest({ batch: makeBatch({ approvalMode: "batch" }) }),
    ports,
  );
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.blockCodes, ["approval_mode_not_per_message"]);
  assert.equal(calls.sends.length, 0);
});

test("blocks when batch state does not allow execution", async () => {
  const { ports } = makePorts();
  const result = await executeSingleSendLive(
    makeRequest({ batch: makeBatch({ state: "drafted" }) }),
    ports,
  );
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.blockCodes, ["batch_state"]);
});

test("blocks when contentHash changed after approval (stale token)", async () => {
  const { ports, calls } = makePorts();
  const result = await executeSingleSendLive(
    makeRequest({ batch: makeBatch({ contentHash: "hash_TAMPERED" }) }),
    ports,
  );
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.blockCodes, ["approval_token_invalid"]);
  assert.equal(calls.sends.length, 0);
});

test("blocks when send window has closed", async () => {
  const { ports } = makePorts();
  const result = await executeSingleSendLive(
    makeRequest({
      batch: makeBatch({
        sendWindow: {
          start: "2026-06-01T00:00:00Z",
          end: "2026-06-02T00:00:00Z",
        },
      }),
    }),
    ports,
  );
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.blockCodes, ["send_window_closed"]);
});

// ---------------------------------------------------------------------------
// Channel validations
// ---------------------------------------------------------------------------

test("blocks sms to cold_prospect structurally", async () => {
  const { ports, calls } = makePorts();
  const result = await executeSingleSendLive(
    makeRequest({ channelId: "sms", recipient: "+15145550000" }),
    ports,
  );
  assert.equal(result.status, "blocked");
  assert.ok(result.blockCodes.includes("audience_blocked_on_channel"));
  assert.equal(calls.sends.length, 0);
});

test("blocks when daily cap reached", async () => {
  const { ports } = makePorts({
    async sentTodayOnChannel() {
      return 20;
    },
  });
  const result = await executeSingleSendLive(makeRequest(), ports);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockCodes.includes("daily_cap_reached"));
});

// ---------------------------------------------------------------------------
// Suppression
// ---------------------------------------------------------------------------

test("blocks suppressed recipient before any dispatch or ledger write", async () => {
  const { ports, calls } = makePorts({
    async isSuppressed() {
      return true;
    },
  });
  const result = await executeSingleSendLive(makeRequest(), ports);
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.blockCodes, ["suppressed"]);
  assert.equal(calls.sends.length, 0);
  assert.equal(calls.ledger.length, 0);
});

// ---------------------------------------------------------------------------
// Ledger pre-dispatch (green-lane)
// ---------------------------------------------------------------------------

test("ledger failure BLOCKS dispatch (no ledger, no send)", async () => {
  const { ports, calls } = makePorts({
    async recordLedgerEvent() {
      throw new Error("ledger down");
    },
  });
  await assert.rejects(() => executeSingleSendLive(makeRequest(), ports), /ledger down/);
  assert.equal(calls.sends.length, 0);
});

// ---------------------------------------------------------------------------
// Provider failure
// ---------------------------------------------------------------------------

test("provider failure returns failed with result ledger event and recorded outcome", async () => {
  const { ports, calls } = makePorts({
    channelSend: {
      async send() {
        return { ok: false, errorCode: "rate_limited", retryable: true };
      },
    },
  });
  const result = await executeSingleSendLive(makeRequest(), ports);
  assert.equal(result.status, "failed");
  assert.equal(result.errorCode, "rate_limited");
  assert.equal(result.retryable, true);
  assert.equal(calls.ledger.length, 2);
  assert.equal(calls.ledger[1].actionType, "outbound.email.send_failed");
  assert.equal(calls.outcomes.length, 1);
  assert.equal(calls.outcomes[0].result.status, "failed");
});

test("failed outcome does NOT short-circuit a retry (only sent outcomes are idempotent)", async () => {
  const failedOutcome = {
    status: "failed",
    actionId: "act_1",
    idempotencyKey: "batch_1:lead_leetwo",
    channelId: "email",
    errorCode: "rate_limited",
    retryable: true,
    ledgerEventId: "ledger_x",
  };
  const { ports, calls } = makePorts({
    async getRecordedOutcome() {
      return failedOutcome;
    },
  });
  const result = await executeSingleSendLive(makeRequest(), ports);
  assert.equal(result.status, "sent");
  assert.equal(calls.sends.length, 1);
});
