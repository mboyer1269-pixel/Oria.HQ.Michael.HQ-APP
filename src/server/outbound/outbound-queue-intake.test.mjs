#!/usr/bin/env node

// src/server/outbound/outbound-queue-intake.test.mjs
//
// Pure unit tests for the queue intake builder. No DB, no network.

import assert from "node:assert/strict";
import test from "node:test";

const { buildApprovedSendCandidate, computeOutboundContentHash } = await import(
  "./outbound-queue-intake.ts"
);
const { isBatchApprovalStillValid } = await import("./outbound-batch-approval.ts");

function makeInput(overrides = {}) {
  return {
    workspaceId: "ws_1",
    approverId: "michael",
    channelId: "email",
    recipient: "sales@leetwo.com",
    leadId: "lead_leetwo",
    subject: "7 non-conformités Loi 96 sur leetwo.com",
    body: "Bonjour, voici votre audit personnalisé.",
    subVoie: "cold_email",
    audienceType: "cold_prospect",
    consentBasis: "implied_verified",
    ...overrides,
  };
}

test("builds an approved candidate with a token bound to the contentHash", () => {
  const result = buildApprovedSendCandidate(makeInput());
  assert.equal(result.ok, true);
  const { candidate, approvalToken } = result;
  assert.equal(candidate.batch.state, "approved");
  assert.equal(candidate.batch.approvalMode, "per_message");
  assert.equal(candidate.batch.approvalToken, approvalToken);
  assert.equal(candidate.batch.approvedBy, "michael");
  assert.equal(candidate.batch.volumeCap, 1);
  assert.equal(isBatchApprovalStillValid(candidate.batch), true);
});

test("token dies if content is mutated after intake (hash binding)", () => {
  const result = buildApprovedSendCandidate(makeInput());
  assert.equal(result.ok, true);
  const tampered = { ...result.candidate.batch, contentHash: "hash_TAMPERED" };
  assert.equal(isBatchApprovalStillValid(tampered), false);
});

test("action idempotencyKey follows `${batchId}:${leadId}`", () => {
  const result = buildApprovedSendCandidate(makeInput());
  assert.equal(result.ok, true);
  const { batch, action } = result.candidate;
  assert.equal(action.idempotencyKey, `${batch.id}:lead_leetwo`);
  assert.equal(action.batchId, batch.id);
  assert.equal(action.state, "queued");
});

test("send window defaults to 72h", () => {
  const result = buildApprovedSendCandidate(makeInput());
  assert.equal(result.ok, true);
  const { sendWindow } = result.candidate.batch;
  const hours =
    (new Date(sendWindow.end).getTime() - new Date(sendWindow.start).getTime()) / 3_600_000;
  assert.equal(Math.round(hours), 72);
});

test("blank subject/body/recipient are rejected", () => {
  for (const overrides of [{ subject: "  " }, { body: "" }, { recipient: " " }]) {
    const result = buildApprovedSendCandidate(makeInput(overrides));
    assert.equal(result.ok, false);
  }
});

test("contentHash is deterministic and content-sensitive", () => {
  const base = {
    subject: "s",
    body: "b",
    audienceType: "warm_lead",
    jurisdiction: "CA",
    consentBasis: "express",
    aiDisclosure: "d",
  };
  assert.equal(computeOutboundContentHash(base), computeOutboundContentHash({ ...base }));
  assert.notEqual(
    computeOutboundContentHash(base),
    computeOutboundContentHash({ ...base, body: "b2" }),
  );
});

test("cold_prospect intake is medium risk; warm is low", () => {
  const cold = buildApprovedSendCandidate(makeInput());
  const warm = buildApprovedSendCandidate(
    makeInput({ audienceType: "warm_lead", subVoie: "follow_up" }),
  );
  assert.equal(cold.candidate.batch.riskLevel, "medium");
  assert.equal(warm.candidate.batch.riskLevel, "low");
});
