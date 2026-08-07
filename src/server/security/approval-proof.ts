import { createHash } from "node:crypto";

const HEX_SHA256 = /^[0-9a-f]{64}$/;

export type ApprovalProofInput = {
  workspaceId: string;
  intentId: string;
  intentPayloadHash: string;
  approvedByUserId: string;
  approvedAt: string;
};

function canonicalizeJson(value: unknown): string {
  return JSON.stringify(value);
}

/** SHA-256 hex digest of the canonical intent payload JSON. */
export function computeIntentPayloadHash(payload: unknown): string {
  return createHash("sha256").update(canonicalizeJson(payload), "utf8").digest("hex");
}

/**
 * SHA-256 proof over the approval tuple. Stored in
 * agent_execution_intent_approval_events.approval_proof and required before
 * pending -> executing (migration 0029 trigger).
 */
export function computeApprovalProof(input: ApprovalProofInput): string {
  const canonical = [
    input.workspaceId,
    input.intentId,
    input.intentPayloadHash,
    input.approvedByUserId,
    input.approvedAt,
  ].join("|");

  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function isSha256Hex(value: string): boolean {
  return HEX_SHA256.test(value);
}
