import { createHash } from "node:crypto";
import { z } from "zod";
import type { Mission } from "@/core/types";
import { subscriptionSelectionSchema } from "@/server/ai/subscription-catalog";
import { developmentMissionId } from "./development-mission";

/** Reservation metadata on the canonical mission, never an execution grant. */
export const ATELIER_DEVELOPMENT_KEY = "_atelierRun";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const identity = z.string().trim().min(1).max(160);
const relativeRepository = z.string().min(1).max(600).refine(value =>
  value === value.trim() && !value.startsWith("/") && !/[:\\\u0000-\u001f]/.test(value)
  && value.split("/").every(part => part !== "" && part !== "." && part !== ".."),
"Repository must be a traversal-free relative path");

export const atelierDevelopmentContextSchema = z.object({
  workspaceId: identity, modeId: identity, actorId: identity,
}).strict();
export type AtelierDevelopmentContext = z.infer<typeof atelierDevelopmentContextSchema>;

export const atelierDevelopmentRequestSchema = z.object({
  missionId: z.uuid(),
  repository: z.object({ relativePath: relativeRepository, baseSha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/) }).strict(),
  selection: subscriptionSelectionSchema,
  timeoutMs: z.number().int().min(1000).max(900_000),
}).strict();
export type AtelierDevelopmentRequest = z.infer<typeof atelierDevelopmentRequestSchema>;

const bindingBodySchema = z.object({
  version: z.literal(1), workspaceId: identity, modeId: identity, missionId: z.uuid(), actorId: identity,
  missionVersion: z.iso.datetime({ offset: true }), developmentPayloadHash: digest,
  missionRiskLevel: z.enum(["low", "medium", "high"]),
  // A requested instruction profile only: neither a license nor an active agent.
  specialist: z.object({ agentId: z.literal("builder"), skillId: z.literal("spec.draft"), purpose: z.literal("instruction_profile_only") }).strict(),
  repository: atelierDevelopmentRequestSchema.shape.repository,
  selection: subscriptionSelectionSchema,
  limits: z.object({ timeoutMs: atelierDevelopmentRequestSchema.shape.timeoutMs, maxNewAgentSteps: z.literal(1),
    paidApiAllowed: z.literal(false), externalEffectsAllowed: z.literal(false),
    missionCostBudgetCents: z.number().int().nonnegative().nullable() }).strict(),
  output: z.literal("SPEC.md"),
}).strict();
export const atelierDevelopmentBindingSchema = bindingBodySchema.extend({ bindingHash: digest }).strict();
export type AtelierDevelopmentBinding = z.infer<typeof atelierDevelopmentBindingSchema>;
export const atelierDevelopmentClaimSchema = z.object({
  version: z.literal(1), state: z.literal("reserved"), runId: z.uuid(),
  reservedAt: z.iso.datetime({ offset: true }), binding: atelierDevelopmentBindingSchema,
  executionRequested: z.literal(false),
}).strict();
export type AtelierDevelopmentClaim = z.infer<typeof atelierDevelopmentClaimSchema>;

const developmentMetadataSchema = z.object({
  version: z.literal(1), requestId: z.uuid(), scope: z.string().trim().min(1).max(1000),
  acceptanceCriteria: z.string().trim().min(1).max(2000), createdBy: identity, payloadHash: digest,
}).strict();
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Pure preparation. It does not resolve paths, qualify a runtime, approve, or launch. */
export function buildAtelierDevelopmentBinding(mission: Mission, context: AtelierDevelopmentContext,
  request: AtelierDevelopmentRequest): AtelierDevelopmentBinding | null {
  const ctx = atelierDevelopmentContextSchema.safeParse(context);
  const req = atelierDevelopmentRequestSchema.safeParse(request);
  const metadata = developmentMetadataSchema.safeParse(mission.input.development);
  if (!ctx.success || !req.success || !metadata.success) return null;
  const meta = metadata.data;
  if (mission.workspaceId !== ctx.data.workspaceId || mission.modeId !== ctx.data.modeId
    || mission.id !== req.data.missionId || meta.createdBy !== ctx.data.actorId
    || mission.id !== developmentMissionId(mission.workspaceId, meta.requestId)
    || mission.status !== "draft" || mission.autonomyLevel !== 0 || mission.assignedAgentId !== ""
    || mission.requiresApproval !== true) return null;
  const payloadHash = hash([mission.title, mission.objective, meta.scope, meta.acceptanceCriteria, mission.modeId, meta.createdBy]);
  const expectedOutput = `Périmètre autorisé :\n${meta.scope}\n\nCritères d’acceptation :\n${meta.acceptanceCriteria}\n\nLivrer les changements et les preuves de validation. Aucun déploiement automatique.`;
  if (payloadHash !== meta.payloadHash || mission.expectedOutput !== expectedOutput) return null;
  const body = bindingBodySchema.safeParse({
    version: 1, workspaceId: mission.workspaceId, modeId: mission.modeId, missionId: mission.id,
    actorId: ctx.data.actorId, missionVersion: mission.updatedAt, developmentPayloadHash: payloadHash, missionRiskLevel: mission.riskLevel,
    specialist: { agentId: "builder", skillId: "spec.draft", purpose: "instruction_profile_only" },
    repository: req.data.repository, selection: req.data.selection,
    limits: { timeoutMs: req.data.timeoutMs, maxNewAgentSteps: 1, paidApiAllowed: false,
      externalEffectsAllowed: false, missionCostBudgetCents: mission.costBudgetCents ?? null }, output: "SPEC.md",
  });
  return body.success ? { ...body.data, bindingHash: hash(body.data) } : null;
}

/** Validate stored bytes as data, not authority. Hashes establish consistency, not trust. */
export function readAtelierDevelopmentClaim(raw: unknown): AtelierDevelopmentClaim | null {
  const parsed = atelierDevelopmentClaimSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { bindingHash, ...body } = parsed.data.binding;
  return hash(body) === bindingHash ? parsed.data : null;
}

/** Recheck the immutable source after a reservation advanced updated_at. */
export function claimMatchesDevelopmentMission(claim: AtelierDevelopmentClaim, mission: Mission,
  context: AtelierDevelopmentContext): boolean {
  const b = claim.binding;
  const current = buildAtelierDevelopmentBinding({ ...mission, updatedAt: b.missionVersion }, context, {
    missionId: mission.id, repository: b.repository, selection: b.selection, timeoutMs: b.limits.timeoutMs,
  });
  return current?.bindingHash === b.bindingHash;
}
