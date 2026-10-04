import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import { buildOpenHandsSubmission, type OpenHandsSubmissionDossier } from "./openhands-submission";
import { buildModelExecutionReceipt } from "./openhands-model-execution-receipt";
import { deriveUnavailableModelIds, resolveProviderConnectionDiscovery, type ProviderConnectionProbe } from "../agents/models/provider-connection-discovery";
import type { ProviderRegistry } from "../agents/models/provider-registry-contract";
import type { Mission } from "@/core/types";
import { openHandsReceiptSchema, OPENHANDS_RESERVATION_KEY } from "./openhands-reservation";
import { launchConfigSchema, type LaunchBinding } from "@/core/openhands-launch-contract";
import type { OpenHandsResultReceipt } from "@/core/openhands-result-contract";
export { launchConfigSchema, type LaunchConfig, type LaunchBinding } from "@/core/openhands-launch-contract";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1).max(160);
export const OPENHANDS_LAUNCH_KEY = "_openhandsLaunch";
export const launchAuthoritySchema = z.object({ version: z.literal(1), id: z.uuid(), scope: z.literal("openhands.launch"),
  workspaceId: id, missionId: z.uuid(), reservationId: z.uuid(), payloadHash: digest, launchHash: digest,
  actorId: id, approvedAt: z.iso.datetime({ offset: true }), expiresAt: z.iso.datetime({ offset: true }) }).strict();
export type LaunchAuthority = z.infer<typeof launchAuthoritySchema>;
export const launchClaimSchema = z.object({ version: z.literal(1), launchId: z.uuid(), authorizationId: z.uuid(),
  /** Server verified decision; never accepted from the browser. Required by the DB for effectful claims. */
  approvalRecordId: z.uuid().optional(),
  workspaceId: id, missionId: z.uuid(), reservationId: z.uuid(), payloadHash: digest, launchHash: digest,
  actorId: id, runnerId: id, imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  commitSha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),
  containerName: z.string().regex(/^hq-openhands-[a-f0-9-]{36}$/),
  state: z.enum(["claimed", "creation_requested", "container_created", "start_requested", "execution_finished", "running", "succeeded", "failed", "cancelled", "reconciliation_required"]),
  modelExecutionReceipt: z.unknown().optional(),
  containerId: digest.optional(),
  sessionId: id.optional(),
  startRequestedAt: z.iso.datetime({offset:true}).optional(),
  process: z.object({exitCode:z.number().int(),containerStopped:z.literal(true),deadlineExceeded:z.boolean()}).strict().optional(),
  /** Only set when an interrupted launch was explicitly closed on observed state. */
  reconciliation: z.object({reason:z.enum(["interrupted_before_start","result_unrecoverable"]),
    containerState:z.enum(["absent","created","dead"]),observedAt:z.iso.datetime({offset:true})}).strict().optional(),
  claimedAt: z.iso.datetime({ offset: true }), authorizationExpiresAt: z.iso.datetime({ offset: true }) }).strict();
export type LaunchClaim = z.infer<typeof launchClaimSchema>;
export type LaunchStore = { load(workspaceId: string, missionId: string): Promise<Mission | null>;
  readSubmission(mission: Mission, actorId: string): Promise<OpenHandsSubmissionDossier | null>;
  compareAndSwap(mission: Mission, claim: LaunchClaim, result?: OpenHandsResultReceipt): Promise<Mission | null>;
  /** Persist then canonically reread a decision at an authenticated owner boundary. */
  persistAuthority(binding: LaunchBinding, actorId: string, now: number): Promise<unknown>;
  readAuthority(binding: LaunchBinding, actorId: string): Promise<unknown> };

export function launchBinding(mission: Mission, actorId: string, rawConfig: unknown, canonical: OpenHandsSubmissionDossier | null): LaunchBinding | null {
  const config = launchConfigSchema.safeParse(rawConfig);
  const receipt = openHandsReceiptSchema.safeParse(mission.input[OPENHANDS_RESERVATION_KEY]);
  if (!config.success || !receipt.success || receipt.data.state !== "audit_recorded" || receipt.data.actorId !== actorId
    || receipt.data.workspaceId !== mission.workspaceId || receipt.data.missionId !== mission.id || mission.status !== "draft") return null;
  if (!canonical) return null;
  const candidate={...mission,input:{...mission.input},updatedAt:receipt.data.missionVersion};
  // A stopped, already-claimed launch may subsequently receive result evidence.
  // Results are not submission inputs; preserve them in storage while rebuilding
  // the original approved dossier. Initial submissions still reject any result.
  const existingClaim = launchClaimSchema.safeParse(mission.input[OPENHANDS_LAUNCH_KEY]);
  if (existingClaim.success && existingClaim.data.state === "execution_finished"
    && existingClaim.data.missionId === mission.id && existingClaim.data.workspaceId === mission.workspaceId
    && existingClaim.data.actorId === actorId && existingClaim.data.payloadHash === receipt.data.payloadHash
    && existingClaim.data.reservationId === receipt.data.reservationId) candidate.result = undefined;
  delete candidate.input[OPENHANDS_RESERVATION_KEY];
  delete candidate.input[OPENHANDS_LAUNCH_KEY];
  const rebuilt=buildOpenHandsSubmission(candidate,mission.workspaceId,{missionId:mission.id,expectedUpdatedAt:receipt.data.missionVersion,
    commitSha:canonical.source.commitSha,executorVersion:canonical.executorVersion,budget:canonical.budget,
    ...(canonical.foundationModelId ? {foundationModelId:canonical.foundationModelId} : {})});
  if(rebuilt.status!=="prepared" || !isDeepStrictEqual(rebuilt.dossier,canonical)
    || canonical.payloadHash!==receipt.data.payloadHash || canonical.idempotencyKey!==receipt.data.idempotencyKey
    || config.data.executorVersion!==canonical.executorVersion
    || config.data.foundationModelId!==canonical.foundationModelId
    || config.data.maxCostCents!==canonical.budget.maxCostCents || config.data.maxTokens!==canonical.budget.maxTokens
    || config.data.maxIterations!==canonical.budget.maxIterations || config.data.timeoutSeconds!==canonical.budget.timeoutSeconds) return null;
  const payload = { workspaceId: mission.workspaceId, missionId: mission.id, reservationId: receipt.data.reservationId,
    payloadHash: receipt.data.payloadHash, commitSha:canonical.source.commitSha, config: config.data };
  return { ...payload, launchHash: hash(payload) };
}
export function validateLaunchAuthority(raw: unknown, binding: LaunchBinding, actorId: string, now: number): LaunchAuthority | null {
  const parsed = launchAuthoritySchema.safeParse(raw);
  if (!parsed.success || !Number.isFinite(now)) return null;
  const a = parsed.data;
  if (a.actorId !== actorId || a.workspaceId !== binding.workspaceId || a.missionId !== binding.missionId
    || a.reservationId !== binding.reservationId || a.payloadHash !== binding.payloadHash || a.launchHash !== binding.launchHash
    || Date.parse(a.approvedAt) > now || Date.parse(a.expiresAt) <= now
    || Date.parse(a.expiresAt) <= Date.parse(a.approvedAt) || Date.parse(a.expiresAt)-Date.parse(a.approvedAt)>600000) return null;
  return a;
}

/** No browser authority/receipt parameter. Context must be authenticated upstream.
 * This tranche reserves only: no Docker, scheduler, lease takeover or execution. */
export function createOpenHandsLaunchService(deps: { store: () => LaunchStore | null; now?: () => number; connectionDiscovery?: { registry: ProviderRegistry; probe: ProviderConnectionProbe } }) {
  return async (context: { workspaceId: string; actorId: string }, request: { missionId: string; config: unknown },
    confirmation?: { confirm: true; expectedLaunchHash: string; approvalRecordId?: string }) => {
    const closed = (status: string) => ({ status, externalEffectAllowed: false as const });
    let attempted = false;
    try {
      if (!id.safeParse(context.workspaceId).success || !id.safeParse(context.actorId).success || !z.uuid().safeParse(request.missionId).success) return closed("invalid_request");
      const store = deps.store(); if (!store) return closed("unavailable");
      const mission = await store.load(context.workspaceId, request.missionId);
      if (!mission || mission.workspaceId !== context.workspaceId || mission.id !== request.missionId) return closed("not_found");
      const binding = launchBinding(mission, context.actorId, request.config, await store.readSubmission(mission,context.actorId));
      if (!binding) return closed("ineligible_mission");
      const priorRaw = mission.input[OPENHANDS_LAUNCH_KEY];
      if (priorRaw !== undefined) {
        const prior = launchClaimSchema.safeParse(priorRaw);
        if (!prior.success) return closed("reconciliation_required");
        if (prior.data.launchHash !== binding.launchHash || prior.data.actorId !== context.actorId
          || prior.data.workspaceId !== binding.workspaceId || prior.data.missionId !== binding.missionId) return closed("conflict");
        return { ...closed("reconciliation_required"), claim: prior.data };
      }
      if (!confirmation) return { ...closed("prepared"), binding };
      if (confirmation.confirm !== true || confirmation.expectedLaunchHash !== binding.launchHash) return closed("dossier_changed");
      const now = deps.now ?? Date.now;
      if (deps.connectionDiscovery) {
        const discovery = await resolveProviderConnectionDiscovery(deps.connectionDiscovery.registry, {
          workspaceId: binding.workspaceId,
          requestingWorkspaceId: context.workspaceId,
          probe: deps.connectionDiscovery.probe,
          nowIso: new Date(now()).toISOString(),
        });
        if (discovery.status !== "ok") return closed("connection_required");
        const unavailableModelIds = deriveUnavailableModelIds(deps.connectionDiscovery.registry, discovery.snapshot);
        if (binding.config.foundationModelId && unavailableModelIds.includes(binding.config.foundationModelId)) {
          return closed("connection_required");
        }
      }
      attempted = true;
      await store.persistAuthority(binding, context.actorId, now());
      const authority = validateLaunchAuthority(await store.readAuthority(binding, context.actorId), binding, context.actorId, now());
      if (!authority) return closed("authorization_denied");
      const launchId = randomUUID();
      const requestedModelId = binding.config.foundationModelId ?? "default";
      const modelExecutionReceipt = buildModelExecutionReceipt({
        eligible: true,
        modelId: requestedModelId,
        providerId: "openhands-acp",
        runtimeAdapterId: binding.config.runnerId,
        sentinelle: { defaultZone: "red", requiresApprovalForToolUse: true },
        sentinelleRequired: true,
        ledgerRequired: true,
        pinned: true,
        reason: "OpenHands ACP model approved for launch",
        skipped: [],
      }, launchId, null);
      if (modelExecutionReceipt.status !== "ok") return closed("reconciliation_required");
      const claim: LaunchClaim = { version: 1, launchId, authorizationId: authority.id, modelExecutionReceipt: modelExecutionReceipt.receipt,
        ...(confirmation.approvalRecordId ? { approvalRecordId: confirmation.approvalRecordId } : {}), workspaceId: binding.workspaceId,
        missionId: binding.missionId, reservationId: binding.reservationId, payloadHash: binding.payloadHash, launchHash: binding.launchHash,
        actorId: context.actorId, runnerId: binding.config.runnerId, imageDigest: binding.config.imageDigest,commitSha:binding.commitSha,
        containerName: `hq-openhands-${launchId}`, state: "claimed", claimedAt: new Date(now()).toISOString(), authorizationExpiresAt: authority.expiresAt };
      if (Date.parse(authority.expiresAt) <= now()) return closed("authorization_denied");
      const saved = await store.compareAndSwap(mission, claim);
      return saved ? { ...closed("claimed"), claim } : closed("conflict");
    } catch { return closed(attempted ? "reconciliation_required" : "unavailable"); }
  };
}
