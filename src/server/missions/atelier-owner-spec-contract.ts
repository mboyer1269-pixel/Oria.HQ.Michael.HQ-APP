import { createHash } from "node:crypto";
import { z } from "zod";
import type { Mission } from "@/core/types";
import { canonicalizeEntry, computeEntryHash } from "@/server/ledger/hash-chain-canonicalizer";
import { sealNewLedgerRow } from "@/server/ledger/hash-chain-live-seal";
import { toLedgerChainEntry, type LedgerRowForChain } from "@/server/ledger/hash-chain-ledger-fields";
import { computeHmac } from "@/server/ledger/hash-chain-verifier";
import { atelierDevelopmentBindingSchema, claimMatchesDevelopmentMission, readAtelierDevelopmentClaim,
  ATELIER_DEVELOPMENT_KEY } from "./atelier-development-contract";
import { atelierExecutionContextSchema, atelierExecutionSnapshot } from "./atelier-execution-contract";

/** Owner-operated candidate. V1 reservations/receipts are not execution permissions. */
export const OWNER_SPEC_KEY = "_atelierOwnerSpecV2";
export const OWNER_SPEC_OPERATION = "atelier.spec.start";
const uuid = z.uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const identity = z.string().min(1).max(160);
const timestamp = z.iso.datetime({ offset: true });
const requestIdentity = { missionId: uuid, runId: uuid };
export const ownerSpecContextSchema = atelierExecutionContextSchema;
export type OwnerSpecContext = z.infer<typeof ownerSpecContextSchema>;
export const ownerSpecRequestSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("review"), ...requestIdentity }).strict(),
  z.object({ command: z.literal("confirm"), ...requestIdentity, expectedReviewHash: digest }).strict(),
  z.object({ command: z.literal("recover"), ...requestIdentity }).strict(),
]);
export const ownerSpecPayloadSchema = z.object({
  version: z.literal(2), operation: z.literal(OWNER_SPEC_OPERATION), workspaceId: identity, modeId: identity,
  actorId: uuid, missionId: uuid, runId: uuid, installationId: uuid, reviewId: uuid, reviewExpiresAt: timestamp,
  binding: atelierDevelopmentBindingSchema,
  instructions: z.object({ version: z.literal("owner-spec/v1"), text: z.string().min(1).max(16_000), sha256: digest }).strict(),
  effects: z.object({ maxNewSteps: z.literal(1), output: z.literal("SPEC.md"), automaticCommitAllowed: z.literal(false),
    paidApiAllowed: z.literal(false), externalToolsAllowed: z.literal(false) }).strict(),
}).strict();
export type OwnerSpecPayload = z.infer<typeof ownerSpecPayloadSchema>;
export const ownerSpecReviewSchema = z.object({ payloadJson: z.string().min(1).max(32_000), payloadHash: digest }).strict();
export type OwnerSpecReview = z.infer<typeof ownerSpecReviewSchema>;
export const ownerSpecAdmissionSchema = z.object({ version: z.literal(2), state: z.literal("admitted"),
  workspaceId: identity, actorId: uuid, missionId: uuid, runId: uuid, installationId: uuid, attemptId: uuid,
  decisionId: uuid, payloadHash: digest, bindingHash: digest, ledgerId: uuid, admittedAt: timestamp }).strict();
export type OwnerSpecAdmission = z.infer<typeof ownerSpecAdmissionSchema>;
export type OwnerSpecExecution = { payload: OwnerSpecPayload; payloadHash: string; receipt: OwnerSpecAdmission };
export const ownerSpecManifestSchema = z.object({ version: z.literal(2), workspaceId: identity, actorId: uuid,
  missionId: uuid, runId: uuid, installationId: uuid, attemptId: uuid, decisionId: uuid, stepId: uuid,
  instructionHash: digest, sessionId: z.string().min(1).max(300).nullable(), payloadHash: digest, bindingHash: digest,
  baseSha: atelierDevelopmentBindingSchema.shape.repository.shape.baseSha,
  headSha: atelierDevelopmentBindingSchema.shape.repository.shape.baseSha,
  artifact: z.object({ kind: z.literal("spec"), path: z.literal("SPEC.md"), sha256: digest,
    bytes: z.number().int().min(1).max(64_000) }).strict(),
}).strict();
export const ownerSpecResultSchema = z.object({
  status: z.enum(["succeeded", "failed", "blocked", "interrupted", "reconciliation_required"]),
  sessionId: z.string().min(1).max(300).nullable(),
  evidence: z.object({ specText: z.string().min(1).max(64_000), sha256: digest, bytes: z.number().int().min(1).max(64_000),
    manifest: ownerSpecManifestSchema }).strict().optional(),
}).strict();
export type OwnerSpecResult = z.infer<typeof ownerSpecResultSchema>;
export const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export function ownerSpecSnapshot(m: Mission) {
  const input = { ...m.input }; delete input[OWNER_SPEC_KEY];
  return { ...atelierExecutionSnapshot(m), input };
}
export const ownerSpecIntentId = (p: OwnerSpecPayload) => `atelier2:${p.workspaceId}:${p.missionId}:${p.runId}:spec.start`;

export function buildOwnerSpecPayload(m: Mission, context: OwnerSpecContext,
  ids: { runId: string; installationId: string; reviewId: string; reviewExpiresAt: string }): OwnerSpecPayload | null {
  const ctx = ownerSpecContextSchema.safeParse(context);
  const claim = readAtelierDevelopmentClaim(m.input[ATELIER_DEVELOPMENT_KEY]);
  if (!ctx.success || !claim || claim.runId !== ids.runId || !claimMatchesDevelopmentMission(claim, m, ctx.data)) return null;
  const development = m.input.development as { scope: string; acceptanceCriteria: string };
  const text = `Owner-operated specification only. Write only SPEC.md. Do not commit, execute commands, contact external services, change code or tests.\n\nTitle: ${m.title}\nObjective: ${m.objective}\nScope: ${development.scope}\nAcceptance criteria: ${development.acceptanceCriteria}`;
  const parsed = ownerSpecPayloadSchema.safeParse({ version: 2, operation: OWNER_SPEC_OPERATION, ...ctx.data,
    missionId: m.id, ...ids, binding: claim.binding, instructions: { version: "owner-spec/v1", text, sha256: sha256(text) },
    effects: { maxNewSteps: 1, output: "SPEC.md", automaticCommitAllowed: false, paidApiAllowed: false, externalToolsAllowed: false } });
  return parsed.success ? parsed.data : null;
}
export function readOwnerSpecReview(raw: unknown): { review: OwnerSpecReview; payload: OwnerSpecPayload } | null {
  const review = ownerSpecReviewSchema.safeParse(raw);
  if (!review.success || Buffer.byteLength(review.data.payloadJson) > 32_000 || sha256(review.data.payloadJson) !== review.data.payloadHash) return null;
  try {
    const payload = ownerSpecPayloadSchema.parse(JSON.parse(review.data.payloadJson));
    if (JSON.stringify(payload) !== review.data.payloadJson || sha256(payload.instructions.text) !== payload.instructions.sha256) return null;
    return { review: review.data, payload };
  } catch { return null; }
}
export function ownerSpecAdmissionMatches(r: OwnerSpecAdmission, p: OwnerSpecPayload, payloadHash: string) {
  return r.workspaceId === p.workspaceId && r.actorId === p.actorId && r.missionId === p.missionId
    && r.runId === p.runId && r.installationId === p.installationId && r.payloadHash === payloadHash
    && r.bindingHash === p.binding.bindingHash && r.ledgerId === r.attemptId;
}
export function validateOwnerSpecResult(raw: unknown, e: OwnerSpecExecution): OwnerSpecResult | null {
  const parsed = ownerSpecResultSchema.safeParse(raw); if (!parsed.success) return null;
  const result = parsed.data;
  if (result.status !== "succeeded") return result.evidence ? null : result;
  const evidence = result.evidence; if (!evidence || !result.sessionId) return null;
  const m = evidence.manifest, p = e.payload, r = e.receipt;
  return evidence.bytes === Buffer.byteLength(evidence.specText) && evidence.sha256 === sha256(evidence.specText)
    && m.workspaceId === p.workspaceId && m.actorId === p.actorId && m.missionId === p.missionId && m.runId === p.runId
    && m.installationId === p.installationId && m.attemptId === r.attemptId && m.decisionId === r.decisionId
    && m.stepId === r.attemptId && m.instructionHash === p.instructions.sha256 && m.sessionId === result.sessionId
    && m.payloadHash === e.payloadHash && m.bindingHash === p.binding.bindingHash
    && m.baseSha === p.binding.repository.baseSha && m.headSha === m.baseSha
    && m.artifact.sha256 === evidence.sha256 && m.artifact.bytes === evidence.bytes ? result : null;
}
export function ownerSpecLedgerRow(p: OwnerSpecPayload, payloadHash: string, attemptId: string, decisionId: string,
  event: "admit" | "result", id: string, result?: OwnerSpecResult): LedgerRowForChain {
  return { id, workspace_id: p.workspaceId, user_id: p.actorId, agent_id: null, skill_id: null, mission_id: p.missionId,
    action_type: event === "admit" ? "mission.atelier_owner_spec_admitted" : "mission.atelier_owner_spec_result",
    event_type: event === "admit" ? "action" : "result", autonomy_level: 0, requires_confirmation: true,
    summary: event === "admit" ? "Explicit owner command admitted for one bound spec step" : "Observed owner spec result recorded; no new execution authorized",
    payload: event === "admit" ? p : result ?? null,
    metadata: { version: 2, operation: OWNER_SPEC_OPERATION, principal: "workspace_owner", runId: p.runId, attemptId, decisionId, payloadHash },
    created_at: new Date(0).toISOString() };
}
const tailSchema = z.object({ id: uuid, workspace_id: z.string(), user_id: uuid, agent_id: z.string().nullable(),
  skill_id: z.string().nullable(), mission_id: z.string().nullable(), action_type: z.string(), event_type: z.string().nullable(),
  summary: z.string(), autonomy_level: z.number().int(), requires_confirmation: z.boolean(), payload: z.unknown(), metadata: z.unknown(),
  created_at: timestamp, prev_hash: digest.nullable(), entry_hash: digest, hmac: digest, canonical_version: z.literal(1) });
export function sealOwnerSpecRow(row: LedgerRowForChain, rawTail: unknown, hmacKey: string, now: string) {
  const parsed = rawTail === null ? null : tailSchema.parse(rawTail);
  const tail = parsed ? toLedgerChainEntry(parsed as LedgerRowForChain) : null;
  if (parsed && (!tail || tail.workspace_id !== row.workspace_id || computeEntryHash(tail, tail.prev_hash) !== tail.entry_hash
    || computeHmac(tail.entry_hash, hmacKey) !== tail.hmac)) throw new Error("Invalid workspace ledger tail");
  const instant = new Date(now).getTime(); if (!Number.isFinite(instant)) throw new Error("Invalid ledger timestamp");
  const finalRow = { ...row, created_at: new Date(Math.max(instant, tail ? new Date(tail.created_at).getTime() + 1 : instant)).toISOString() };
  const seal = sealNewLedgerRow({ row: finalRow, tail, enabled: true, hmacKey });
  if (!seal) throw new Error("Ledger seal unavailable");
  return { canonicalJson: canonicalizeEntry(finalRow), prevHash: seal.prev_hash, entryHash: seal.entry_hash,
    hmac: seal.hmac, canonicalVersion: seal.canonical_version };
}
