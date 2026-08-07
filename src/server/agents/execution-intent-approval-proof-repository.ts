// Append-only store for cryptographic CEO approval proofs (migration 0029).
// Dual-mode: Supabase when configured, in-memory local fallback in dev/test.

import type { AgentExecutionIntent } from "@/features/agents/execution-intent";
import type { ContextPartition } from "@/core/context-partition";
import { resolveContextPartition } from "@/core/context-partition";
import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import {
  computeApprovalProof,
  computeIntentPayloadHash,
  isSha256Hex,
} from "@/server/security/approval-proof";
import type {
  AgentExecutionIntentApprovalEventInsert,
  AgentExecutionIntentApprovalEventRow,
} from "@/server/db/types";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";

const PRODUCTION_GUARD_MESSAGE =
  "Execution intent approval proof persistence is unavailable: Supabase is not configured " +
  "and local-fallback persistence is only available outside production.";

const localApprovalEvents: AgentExecutionIntentApprovalEventRow[] = [];
let localSeq = 0;

type SupabaseAdminClient = NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>;

export class ExecutionIntentApprovalProofError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionIntentApprovalProofError";
  }
}

export type CreateExecutionIntentApprovalProofInput = {
  workspaceId: string;
  approvedByUserId: string;
  modeId: string;
  intent: AgentExecutionIntent;
  approvedAt?: string;
};

export type ExecutionIntentApprovalProof = {
  approvalEventId: string;
  workspaceId: string;
  intentId: string;
  modeId: string;
  contextPartition: ContextPartition;
  intentPayloadHash: string;
  approvalProof: string;
  approvedByUserId: string;
  approvedAt: string;
};

function getSupabaseClient(): SupabaseAdminClient | null {
  return createOptionalSupabaseAdminClient();
}

function assertLocalFallbackAvailable(): void {
  if (!isLocalPersistenceFallbackAllowed()) {
    throw new Error(PRODUCTION_GUARD_MESSAGE);
  }
}

function mapRowToProof(row: AgentExecutionIntentApprovalEventRow): ExecutionIntentApprovalProof {
  if (!isSha256Hex(row.intent_payload_hash) || !isSha256Hex(row.approval_proof)) {
    throw new ExecutionIntentApprovalProofError("Stored approval proof has invalid hash format.");
  }

  return {
    approvalEventId: row.id,
    workspaceId: row.workspace_id,
    intentId: row.intent_id,
    modeId: row.mode_id,
    contextPartition: row.context_partition as ContextPartition,
    intentPayloadHash: row.intent_payload_hash,
    approvalProof: row.approval_proof,
    approvedByUserId: row.approved_by_user_id,
    approvedAt: row.approved_at,
  };
}

/**
 * Records an append-only approval proof for a pending execution intent.
 * Must be called immediately before transitioning pending -> executing.
 */
export async function createExecutionIntentApprovalProof(
  input: CreateExecutionIntentApprovalProofInput,
): Promise<ExecutionIntentApprovalProof> {
  const approvedAt = input.approvedAt ?? new Date().toISOString();
  const contextPartition = resolveContextPartition(input.modeId);
  const intentPayloadHash = computeIntentPayloadHash(input.intent.payload);
  const approvalProof = computeApprovalProof({
    workspaceId: input.workspaceId,
    intentId: input.intent.intentId,
    intentPayloadHash,
    approvedByUserId: input.approvedByUserId,
    approvedAt,
  });

  const insert: AgentExecutionIntentApprovalEventInsert = {
    workspace_id: input.workspaceId,
    intent_id: input.intent.intentId,
    mode_id: input.modeId,
    context_partition: contextPartition,
    approved_by_user_id: input.approvedByUserId,
    intent_payload_hash: intentPayloadHash,
    approval_proof: approvalProof,
    approved_at: approvedAt,
  };

  const db = getSupabaseClient();

  if (!db) {
    assertLocalFallbackAvailable();
    localSeq += 1;
    const row: AgentExecutionIntentApprovalEventRow = {
      ...insert,
      id: `local-approval-${String(localSeq).padStart(6, "0")}`,
      created_at: approvedAt,
    };
    localApprovalEvents.push(structuredClone(row));
    return mapRowToProof(row);
  }

  const { data, error } = await db
    .from("agent_execution_intent_approval_events")
    .insert(insert)
    .select()
    .single();

  if (error || !data) {
    throw new ExecutionIntentApprovalProofError("Failed to persist execution intent approval proof.");
  }

  return mapRowToProof(data);
}

/** Test-only helper to clear the in-memory fallback store. */
export function __clearExecutionIntentApprovalProofsForTests(): void {
  localApprovalEvents.length = 0;
  localSeq = 0;
}
