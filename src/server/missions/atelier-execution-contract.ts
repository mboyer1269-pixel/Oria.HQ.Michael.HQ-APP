import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalizeEntry, computeEntryHash } from "@/server/ledger/hash-chain-canonicalizer";
import { sealNewLedgerRow } from "@/server/ledger/hash-chain-live-seal";
import { toLedgerChainEntry, type LedgerRowForChain } from "@/server/ledger/hash-chain-ledger-fields";
import { computeHmac } from "@/server/ledger/hash-chain-verifier";
import type { Mission } from "@/core/types";
import { atelierDevelopmentBindingSchema, atelierDevelopmentContextSchema, claimMatchesDevelopmentMission,
  readAtelierDevelopmentClaim, ATELIER_DEVELOPMENT_KEY, type AtelierDevelopmentContext } from "./atelier-development-contract";

/** Dormant transactional boundary only: no approval producer, executor, or runtime permission. */
export const ATELIER_EXECUTION_KEY = "_atelierExecution";
const uuid = z.uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const atelierExecutionContextSchema = atelierDevelopmentContextSchema.extend({ actorId: uuid }).strict();
export const atelierExecutionRequestSchema = z.object({ runId: uuid, decisionId: uuid, attemptId: uuid,
  installationId: uuid }).strict();
export type AtelierExecutionRequest = z.infer<typeof atelierExecutionRequestSchema>;
export const atelierExecutionPayloadSchema = z.object({
  version: z.literal(1), operation: z.literal("atelier.spec.start"),
  runId: uuid, installationId: uuid, binding: atelierDevelopmentBindingSchema,
  automaticCommitAllowed: z.literal(false), runtimeActivationAllowed: z.literal(false),
}).strict();
export type AtelierExecutionPayload = z.infer<typeof atelierExecutionPayloadSchema>;
export const atelierExecutionClaimSchema = z.object({
  version: z.literal(1), state: z.literal("dispatch_requested"),
  missionId: uuid, workspaceId: z.string().min(1).max(160), actorId: uuid,
  runId: uuid, attemptId: uuid, installationId: uuid, decisionId: uuid,
  intentId: z.string().min(1).max(500), bindingHash: digest, payloadHash: digest,
  requestedAt: z.iso.datetime({ offset: true }), consumedAt: z.iso.datetime({ offset: true }), ledgerId: uuid,
  executionStarted: z.literal(false), runtimeActivationAllowed: z.literal(false),
}).strict();
export type AtelierExecutionClaim = z.infer<typeof atelierExecutionClaimSchema>;
export const executionIntentId = (workspaceId: string, missionId: string, runId: string) =>
  `atelier1:${workspaceId}:${missionId}:${runId}:spec.start`;
export const hashExecutionPayloadJson = (json: string) => createHash("sha256").update(json, "utf8").digest("hex");

/** Exact row-source projection. JSON null and nullable DB columns are deliberately explicit. */
export function atelierExecutionSnapshot(m: Mission) {
  return { id: m.id, workspace_id: m.workspaceId, mode_id: m.modeId, title: m.title, objective: m.objective,
    assigned_agent_id: m.assignedAgentId, autonomy_level: m.autonomyLevel, status: m.status, risk_level: m.riskLevel,
    requires_approval: m.requiresApproval, cost_budget_cents: m.costBudgetCents ?? null,
    input: m.input, expected_output: m.expectedOutput, result: m.result ?? null };
}

/** Revalidates the canonical reservation. This is consistency, NOT authentication or approval. */
export function buildAtelierExecutionInput(mission: Mission, context: AtelierDevelopmentContext, raw: unknown) {
  const ctx = atelierExecutionContextSchema.safeParse(context);
  const req = atelierExecutionRequestSchema.safeParse(raw);
  const claim = readAtelierDevelopmentClaim(mission.input[ATELIER_DEVELOPMENT_KEY]);
  if (!ctx.success || !req.success || !claim || claim.runId !== req.data.runId
    || !claimMatchesDevelopmentMission(claim, mission, ctx.data)) return null;
  const payload = atelierExecutionPayloadSchema.parse({ version: 1, operation: "atelier.spec.start",
    runId: claim.runId, installationId: req.data.installationId, binding: claim.binding,
    automaticCommitAllowed: false, runtimeActivationAllowed: false });
  // The SQL function hashes THESE exact UTF-8 bytes after checking their decoded shape.
  // JSONB textual ordering is never used as a substitute for the approved payload bytes.
  const payloadJson = JSON.stringify(payload);
  return { context: ctx.data, request: req.data, payload, payloadJson,
    payloadHash: hashExecutionPayloadJson(payloadJson), intentId: executionIntentId(mission.workspaceId, mission.id, claim.runId),
    expectedUpdatedAt: mission.updatedAt, snapshot: atelierExecutionSnapshot(mission) };
}
export type AtelierExecutionInput = NonNullable<ReturnType<typeof buildAtelierExecutionInput>>;

export const ATELIER_EXECUTION_LEDGER_SUMMARY = "Owner decision consumed for exact Atelier reservation; no runtime activated";
const tailSchema = z.object({
  id: uuid, workspace_id: z.string(), user_id: uuid, agent_id: z.string().nullable(), skill_id: z.string().nullable(),
  mission_id: z.string().nullable(), action_type: z.string(), event_type: z.string().nullable(), summary: z.string(),
  autonomy_level: z.number().int(), requires_confirmation: z.boolean(), payload: z.unknown(), metadata: z.unknown(),
  created_at: z.iso.datetime({ offset: true }), prev_hash: digest.nullable(), entry_hash: digest, hmac: digest,
  canonical_version: z.literal(1),
});

/** Reuses the frozen v1 canonicalizer/sealer. No key enters the RPC or approval payload.
 * A tail is an optimistic expectation, not a lock: SQL rechecks it in the mutation transaction.
 */
export function buildAtelierExecutionLedger(input: AtelierExecutionInput, rawTail: unknown, hmacKey: string, now: string) {
  const parsed = rawTail === null ? null : tailSchema.parse(rawTail);
  const tail = parsed ? toLedgerChainEntry(parsed as LedgerRowForChain) : null;
  if (parsed && (!tail || tail.workspace_id !== input.context.workspaceId
    || computeEntryHash(tail, tail.prev_hash) !== tail.entry_hash || computeHmac(tail.entry_hash, hmacKey) !== tail.hmac))
    throw new Error("Invalid workspace ledger tail");
  const instant = new Date(now).getTime();
  if (!Number.isFinite(instant)) throw new Error("Invalid ledger timestamp");
  const createdAt = new Date(Math.max(instant, tail ? new Date(tail.created_at).getTime() + 1 : instant)).toISOString();
  const row: LedgerRowForChain = { id: input.request.attemptId, workspace_id: input.context.workspaceId,
    user_id: input.context.actorId, agent_id: null, skill_id: null, mission_id: input.payload.binding.missionId,
    action_type: "mission.atelier_dispatch_requested", event_type: "action", summary: ATELIER_EXECUTION_LEDGER_SUMMARY,
    autonomy_level: 0, requires_confirmation: true, payload: input.payload,
    metadata: { attemptId: input.request.attemptId, decisionId: input.request.decisionId, runId: input.request.runId,
      intentId: input.intentId, payloadHash: input.payloadHash, executionStarted: false }, created_at: createdAt };
  const seal = sealNewLedgerRow({ row, tail, enabled: true, hmacKey });
  if (!seal) throw new Error("Ledger seal unavailable");
  return { canonicalJson: canonicalizeEntry(row), prevHash: seal.prev_hash,
    entryHash: seal.entry_hash, hmac: seal.hmac, canonicalVersion: seal.canonical_version };
}

export function executionClaimMatches(claim: AtelierExecutionClaim, input: AtelierExecutionInput) {
  return claim.missionId === input.payload.binding.missionId && claim.workspaceId === input.context.workspaceId
    && claim.actorId === input.context.actorId && claim.runId === input.request.runId
    && claim.installationId === input.request.installationId && claim.bindingHash === input.payload.binding.bindingHash
    && claim.payloadHash === input.payloadHash && claim.intentId === input.intentId && claim.ledgerId === claim.attemptId;
}
