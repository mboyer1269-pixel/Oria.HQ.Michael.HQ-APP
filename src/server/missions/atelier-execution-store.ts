import "server-only";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import { resolveLedgerHmacKey } from "@/server/ledger/hash-chain-hmac-key";
import { isHashChainWriteEnabled } from "@/server/ledger/hash-chain-write-flag";
import type { Mission } from "@/core/types";
import type { AtelierDevelopmentContext } from "./atelier-development-contract";
import { atelierExecutionClaimSchema, atelierExecutionContextSchema, buildAtelierExecutionInput,
  executionClaimMatches, buildAtelierExecutionLedger, type AtelierExecutionClaim } from "./atelier-execution-contract";
import { z } from "zod";

type RpcClient = { rpc(name: string, params: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
const noExecution = { executionStarted: false, runtimeActivationAllowed: false } as const;
type ClosedStatus = "invalid_request" | "not_found" | "conflict" | "approval_required" | "unavailable" | "reconciliation_required";
export type AtelierExecutionReceipt = typeof noExecution & (
  | { status: ClosedStatus }
  | { status: "request_too_large"; claimAttempted: false }
  | { status: "claimed" | "existing"; claim: AtelierExecutionClaim }
);
const closed = (status: ClosedStatus): AtelierExecutionReceipt => ({ ...noExecution, status });
const failureSchema = z.object({ status: z.enum(["not_found", "conflict", "approval_required", "reconciliation_required"]) }).strict();
export const MAX_ATELIER_EXECUTION_RPC_BYTES = 64_000;
type LedgerDeps = { hmacKey?: () => string; enabled?: () => boolean; now?: () => string };

/** No default runtime caller. Real persistence requires the reviewed draft SQL AND G1 0033.
 * The future authenticated owner+subscription-holder caller supplies context. A DB
 * receipt is not a license, a process launch, or permission to skip host preflight.
 * Every uncertain write remains uncertain: never retry or consume another decision.
 */
export function createAtelierExecutionStore(client: RpcClient | null = createOptionalSupabaseAdminClient() as unknown as RpcClient | null, ledger: LedgerDeps = {}) {
  return {
    async claim(mission: Mission, context: AtelierDevelopmentContext, request: unknown): Promise<AtelierExecutionReceipt> {
      const input = buildAtelierExecutionInput(mission, context, request);
      if (!input) return closed("invalid_request");
      if (!client) return closed("unavailable");
      const baseParams = { p_workspace_id: input.context.workspaceId, p_actor_id: input.context.actorId,
        p_mission_id: mission.id, p_expected_updated_at: input.expectedUpdatedAt, p_expected_snapshot: input.snapshot,
        p_payload_json: input.payloadJson, p_decision_id: input.request.decisionId, p_attempt_id: input.request.attemptId };
      if (Buffer.byteLength(JSON.stringify(baseParams), "utf8") > MAX_ATELIER_EXECUTION_RPC_BYTES)
        return { ...noExecution, status: "request_too_large", claimAttempted: false };
      // Read-only preparation may fail without spending an approval. Disabled/missing
      // sealing never falls back to an unsealed ledger insert.
      let seal;
      try {
        if (!(ledger.enabled ?? isHashChainWriteEnabled)()) return closed("unavailable");
        const hmacKey = (ledger.hmacKey ?? resolveLedgerHmacKey)();
        if (!hmacKey) return closed("unavailable");
        const head = await client.rpc("read_atelier_ledger_tail", { p_workspace_id: input.context.workspaceId });
        const parsed = z.object({ status: z.literal("ready"), tail: z.unknown().nullable() }).strict().safeParse(head.data);
        if (head.error || !parsed.success || parsed.data.tail === undefined) return closed("unavailable");
        seal = buildAtelierExecutionLedger(input, parsed.data.tail, hmacKey, (ledger.now ?? (() => new Date().toISOString()))());
      } catch { return closed("unavailable"); }
      const params = { ...baseParams, p_ledger: seal };
      if (Buffer.byteLength(JSON.stringify(params), "utf8") > MAX_ATELIER_EXECUTION_RPC_BYTES)
        return { ...noExecution, status: "request_too_large", claimAttempted: false };
      try {
        const { data, error } = await client.rpc("claim_atelier_execution", params);
        if (error) return closed("reconciliation_required");
        const denied = failureSchema.safeParse(data);
        if (denied.success) return closed(denied.data.status);
        const response = z.object({ status: z.enum(["claimed", "existing"]), claim: atelierExecutionClaimSchema }).strict().safeParse(data);
        if (!response.success || !executionClaimMatches(response.data.claim, input)) return closed("reconciliation_required");
        // A newly claimed receipt must be THIS attempted transaction, not a competing winner.
        if (response.data.status === "claimed" && (response.data.claim.attemptId !== input.request.attemptId
          || response.data.claim.decisionId !== input.request.decisionId)) return closed("reconciliation_required");
        return { ...noExecution, ...response.data };
      } catch { return closed("reconciliation_required"); }
    },
    async lookup(context: AtelierDevelopmentContext, missionId: string, runId: string): Promise<AtelierExecutionReceipt> {
      const ctx = atelierExecutionContextSchema.safeParse(context);
      if (!ctx.success || !z.uuid().safeParse(missionId).success || !z.uuid().safeParse(runId).success) return closed("invalid_request");
      if (!client) return closed("unavailable");
      try {
        const { data, error } = await client.rpc("lookup_atelier_execution", { p_workspace_id: ctx.data.workspaceId,
          p_actor_id: ctx.data.actorId, p_mode_id: ctx.data.modeId, p_mission_id: missionId, p_run_id: runId });
        if (error) return closed("unavailable");
        const denied = failureSchema.safeParse(data); if (denied.success) return closed(denied.data.status);
        const found = z.object({ status: z.literal("existing"), claim: atelierExecutionClaimSchema }).strict().safeParse(data);
        if (!found.success || found.data.claim.workspaceId !== ctx.data.workspaceId || found.data.claim.actorId !== ctx.data.actorId
          || found.data.claim.missionId !== missionId || found.data.claim.runId !== runId
          || found.data.claim.ledgerId !== found.data.claim.attemptId) return closed("reconciliation_required");
        return { ...noExecution, ...found.data };
      } catch { return closed("unavailable"); }
    },
  };
}
