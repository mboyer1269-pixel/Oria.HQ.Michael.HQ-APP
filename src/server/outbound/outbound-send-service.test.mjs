#!/usr/bin/env node

// src/server/outbound/outbound-send-service.test.mjs
//
// Tests for the Send Desk service + in-memory store. Fake ledger + adapter.
// No DB, no network.

import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

const { sendOutboundActionAsCeo } = await import("./outbound-send-service.ts");
const {
  registerOutboundSendCandidate,
  listOutboundSendCandidates,
  addSuppression,
  sentTodayOnChannel,
  resetOutboundSendStoreForTests,
} = await import("./outbound-send-store.ts");
const { generateApprovalToken } = await import("./outbound-batch-approval.ts");

const HASH = "hash_abc";
const TOKEN = generateApprovalToken(HASH, "michael", "2026-06-10T08:00:00Z");

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
    approvalToken: TOKEN,
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
    renderedSubject: "Audit Loi 96",
    renderedBody: "Bonjour…",
    personalizationSources: [],
    modelUsed: "claude",
    costEstimateCents: 12,
    state: "queued",
    createdAt: "2026-06-10T08:00:00Z",
    updatedAt: "2026-06-10T08:00:00Z",
    ...overrides,
  };
}

function registerCandidate(overrides = {}) {
  registerOutboundSendCandidate({
    batch: makeBatch(),
    action: makeAction(),
    recipient: "sales@leetwo.com",
    channelId: "email",
    recipientLocalHour: 10,
    ...overrides,
  });
}

function makeDeps(overrides = {}) {
  const calls = { sends: [], ledger: [] };
  const deps = {
    channelSend: {
      async send(input) {
        calls.sends.push(input);
        return { ok: true, providerMessageId: "msg_1" };
      },
    },
    async ledger(event) {
      calls.ledger.push(event);
      return { ledgerEventId: `ledger_${calls.ledger.length}` };
    },
    ...overrides,
  };
  return { deps, calls };
}

beforeEach(() => {
  resetOutboundSendStoreForTests();
});

test("happy path: sends, increments daily counter, writes 2 ledger events", async () => {
  registerCandidate();
  const { deps, calls } = makeDeps();
  const outcome = await sendOutboundActionAsCeo(
    { workspaceId: "ws_1", actionId: "act_1", approvalToken: TOKEN },
    deps,
  );
  assert.equal(outcome.kind, "result");
  assert.equal(outcome.result.status, "sent");
  assert.equal(calls.sends.length, 1);
  assert.equal(calls.ledger.length, 2);
  assert.equal(sentTodayOnChannel("ws_1", "email"), 1);
});

test("unknown action returns not_found", async () => {
  const { deps } = makeDeps();
  const outcome = await sendOutboundActionAsCeo(
    { workspaceId: "ws_1", actionId: "act_missing", approvalToken: TOKEN },
    deps,
  );
  assert.deepEqual(outcome, { kind: "not_found" });
});

test("workspace isolation: candidate from another workspace is not_found", async () => {
  registerCandidate();
  const { deps } = makeDeps();
  const outcome = await sendOutboundActionAsCeo(
    { workspaceId: "ws_OTHER", actionId: "act_1", approvalToken: TOKEN },
    deps,
  );
  assert.deepEqual(outcome, { kind: "not_found" });
});

test("wrong approvalToken returns token_mismatch and never sends", async () => {
  registerCandidate();
  const { deps, calls } = makeDeps();
  const outcome = await sendOutboundActionAsCeo(
    { workspaceId: "ws_1", actionId: "act_1", approvalToken: "approval:FORGED:x:y" },
    deps,
  );
  assert.deepEqual(outcome, { kind: "token_mismatch" });
  assert.equal(calls.sends.length, 0);
});

test("double click sends exactly once (idempotent second result)", async () => {
  registerCandidate();
  const { deps, calls } = makeDeps();
  const first = await sendOutboundActionAsCeo(
    { workspaceId: "ws_1", actionId: "act_1", approvalToken: TOKEN },
    deps,
  );
  const second = await sendOutboundActionAsCeo(
    { workspaceId: "ws_1", actionId: "act_1", approvalToken: TOKEN },
    deps,
  );
  assert.equal(first.result.alreadySent, false);
  assert.equal(second.result.alreadySent, true);
  assert.equal(second.result.providerMessageId, "msg_1");
  assert.equal(calls.sends.length, 1);
  assert.equal(sentTodayOnChannel("ws_1", "email"), 1);
});

test("suppressed recipient is blocked", async () => {
  registerCandidate();
  addSuppression("ws_1", "SALES@leetwo.com", "unsubscribed");
  const { deps, calls } = makeDeps();
  const outcome = await sendOutboundActionAsCeo(
    { workspaceId: "ws_1", actionId: "act_1", approvalToken: TOKEN },
    deps,
  );
  assert.equal(outcome.result.status, "blocked");
  assert.deepEqual(outcome.result.blockCodes, ["suppressed"]);
  assert.equal(calls.sends.length, 0);
});

test("daily cap: 20th send passes, 21st is blocked", async () => {
  const { deps } = makeDeps();
  for (let i = 1; i <= 21; i += 1) {
    registerOutboundSendCandidate({
      batch: makeBatch({ id: `batch_${i}`, contentHash: HASH }),
      action: makeAction({
        id: `act_${i}`,
        batchId: `batch_${i}`,
        leadId: `lead_${i}`,
        idempotencyKey: `batch_${i}:lead_${i}`,
      }),
      recipient: `p${i}@example.com`,
      channelId: "email",
      recipientLocalHour: 10,
    });
  }
  let lastResult = null;
  for (let i = 1; i <= 21; i += 1) {
    const outcome = await sendOutboundActionAsCeo(
      { workspaceId: "ws_1", actionId: `act_${i}`, approvalToken: TOKEN },
      deps,
    );
    lastResult = outcome.result;
    if (i <= 20) {
      assert.equal(lastResult.status, "sent", `send ${i} should pass`);
    }
  }
  assert.equal(lastResult.status, "blocked");
  assert.ok(lastResult.blockCodes.includes("daily_cap_reached"));
  assert.equal(sentTodayOnChannel("ws_1", "email"), 20);
});

test("provider failure does not increment the daily counter", async () => {
  registerCandidate();
  const { deps } = makeDeps({
    channelSend: {
      async send() {
        return { ok: false, errorCode: "boom", retryable: true };
      },
    },
  });
  const outcome = await sendOutboundActionAsCeo(
    { workspaceId: "ws_1", actionId: "act_1", approvalToken: TOKEN },
    deps,
  );
  assert.equal(outcome.result.status, "failed");
  assert.equal(sentTodayOnChannel("ws_1", "email"), 0);
});

test("store: listOutboundSendCandidates is workspace-scoped", () => {
  registerCandidate();
  registerOutboundSendCandidate({
    batch: makeBatch({ workspaceId: "ws_2" }),
    action: makeAction({ id: "act_z", workspaceId: "ws_2" }),
    recipient: "z@example.com",
    channelId: "email",
    recipientLocalHour: 10,
  });
  assert.equal(listOutboundSendCandidates("ws_1").length, 1);
  assert.equal(listOutboundSendCandidates("ws_2").length, 1);
});

test("store: registering mismatched workspaces throws", () => {
  assert.throws(
    () =>
      registerOutboundSendCandidate({
        batch: makeBatch({ workspaceId: "ws_A" }),
        action: makeAction({ workspaceId: "ws_B" }),
        recipient: "x@example.com",
        channelId: "email",
        recipientLocalHour: 10,
      }),
    /same workspaceId/,
  );
});
