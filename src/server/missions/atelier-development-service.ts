import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Mission } from "@/core/types";
import { isDurableMissionDraftEnabled } from "./mission-persistence-flag";
import { AtelierDevelopmentSnapshotTooLargeError, createAtelierDevelopmentStore, type AtelierDevelopmentStore } from "./atelier-development-store";
import { ATELIER_DEVELOPMENT_KEY, atelierDevelopmentContextSchema, atelierDevelopmentRequestSchema,
  buildAtelierDevelopmentBinding, claimMatchesDevelopmentMission, readAtelierDevelopmentClaim,
  type AtelierDevelopmentBinding, type AtelierDevelopmentClaim, type AtelierDevelopmentContext } from "./atelier-development-contract";

type ClosedStatus = "disabled" | "unavailable" | "invalid_request" | "not_found" | "ineligible_mission"
  | "conflict" | "reconciliation_required" | "not_reserved";
type NoExecution = { executionRequested: false; externalEffectAllowed: false };
export type AtelierDevelopmentReceipt = NoExecution & (
  | { status: ClosedStatus }
  | { status: "snapshot_too_large"; reservationAttempted: false; requestTargetBytes: number; maxRequestTargetBytes: number }
  | { status: "prepared"; binding: AtelierDevelopmentBinding }
  | { status: "reserved"; claim: AtelierDevelopmentClaim; source: "created" | "existing" | "recovered" }
);
const noExecution = { executionRequested: false, externalEffectAllowed: false } as const;
const closed = (status: ClosedStatus): AtelierDevelopmentReceipt => ({ ...noExecution, status });
const reserved = (claim: AtelierDevelopmentClaim, source: "created" | "existing" | "recovered"): AtelierDevelopmentReceipt =>
  ({ ...noExecution, status: "reserved", claim, source });
const confirmationSchema = z.object({ expectedBindingHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();

function existing(mission: Mission, context: AtelierDevelopmentContext, expectedHash?: string,
  source: "existing" | "recovered" = "existing"): AtelierDevelopmentReceipt {
  if (!Object.prototype.hasOwnProperty.call(mission.input, ATELIER_DEVELOPMENT_KEY)) return closed("not_reserved");
  const claim = readAtelierDevelopmentClaim(mission.input[ATELIER_DEVELOPMENT_KEY]);
  if (!claim) return closed("reconciliation_required");
  if (!claimMatchesDevelopmentMission(claim, mission, context)
    || (expectedHash !== undefined && claim.binding.bindingHash !== expectedHash)) return closed("conflict");
  return reserved(claim, source);
}

/** Preparation/reservation only. Protected HTTP callers may reserve; no executor is a dependency.
 * The authenticated caller must supply context. A reservation is NOT owner approval,
 * a G1 decision, a builder license, a budget debit, or permission to spawn a process.
 */
export function createAtelierDevelopmentService(deps: {
  enabled?: () => boolean; store?: () => AtelierDevelopmentStore | null;
  now?: () => number; newRunId?: () => string;
} = {}) {
  const getStore = deps.store ?? createAtelierDevelopmentStore;
  const isEnabled = deps.enabled ?? isDurableMissionDraftEnabled;
  async function load(context: AtelierDevelopmentContext, missionId: string, store: AtelierDevelopmentStore) {
    const mission = await store.load(context.workspaceId, missionId);
    return mission?.id === missionId && mission.workspaceId === context.workspaceId && mission.modeId === context.modeId ? mission : null;
  }
  return {
    async prepare(context: AtelierDevelopmentContext, raw: unknown): Promise<AtelierDevelopmentReceipt> {
      const ctx = atelierDevelopmentContextSchema.safeParse(context);
      const request = atelierDevelopmentRequestSchema.safeParse(raw);
      if (!ctx.success || !request.success) return closed("invalid_request");
      try {
        if (!isEnabled()) return closed("disabled");
        const store = getStore(); if (!store) return closed("unavailable");
        const mission = await load(ctx.data, request.data.missionId, store); if (!mission) return closed("not_found");
        if (Object.prototype.hasOwnProperty.call(mission.input, ATELIER_DEVELOPMENT_KEY)) {
          const prior = readAtelierDevelopmentClaim(mission.input[ATELIER_DEVELOPMENT_KEY]);
          if (!prior) return closed("reconciliation_required");
          const candidate = buildAtelierDevelopmentBinding({ ...mission, updatedAt: prior.binding.missionVersion }, ctx.data, request.data);
          return candidate ? existing(mission, ctx.data, candidate.bindingHash) : closed("conflict");
        }
        const binding = buildAtelierDevelopmentBinding(mission, ctx.data, request.data);
        return binding ? { ...noExecution, status: "prepared", binding } : closed("ineligible_mission");
      } catch { return closed("unavailable"); }
    },
    async reserve(context: AtelierDevelopmentContext, raw: unknown, confirmation: unknown): Promise<AtelierDevelopmentReceipt> {
      const ctx = atelierDevelopmentContextSchema.safeParse(context);
      const request = atelierDevelopmentRequestSchema.safeParse(raw);
      const confirmed = confirmationSchema.safeParse(confirmation);
      if (!ctx.success || !request.success || !confirmed.success) return closed("invalid_request");
      let store: AtelierDevelopmentStore | null = null;
      let writeAttempted = false;
      try {
        if (!isEnabled()) return closed("disabled");
        store = getStore(); if (!store) return closed("unavailable");
        const mission = await load(ctx.data, request.data.missionId, store); if (!mission) return closed("not_found");
        const prior = readAtelierDevelopmentClaim(mission.input[ATELIER_DEVELOPMENT_KEY]);
        const binding = buildAtelierDevelopmentBinding(prior ? { ...mission, updatedAt: prior.binding.missionVersion } : mission, ctx.data, request.data);
        if (Object.prototype.hasOwnProperty.call(mission.input, ATELIER_DEVELOPMENT_KEY)) {
          if (!prior) return closed("reconciliation_required");
          if (!binding || binding.bindingHash !== confirmed.data.expectedBindingHash) return closed("conflict");
          return existing(mission, ctx.data, binding.bindingHash);
        }
        if (!binding) return closed("ineligible_mission");
        if (binding.bindingHash !== confirmed.data.expectedBindingHash) return closed("conflict");
        const claim = readAtelierDevelopmentClaim({ version: 1, state: "reserved", runId: (deps.newRunId ?? randomUUID)(),
          reservedAt: new Date((deps.now ?? Date.now)()).toISOString(), binding, executionRequested: false });
        if (!claim) return closed("invalid_request");
        writeAttempted = true;
        const saved = await store.reserve(mission, claim);
        if (saved) {
          const receipt = existing(saved, ctx.data, binding.bindingHash);
          return receipt.status === "reserved" && receipt.claim.runId === claim.runId
            ? reserved(receipt.claim, "created") : closed("reconciliation_required");
        }
        const winner = await load(ctx.data, request.data.missionId, store);
        if (!winner) return closed("conflict");
        const receipt = existing(winner, ctx.data, binding.bindingHash);
        return receipt.status === "not_reserved" ? closed("conflict") : receipt;
      } catch (error) {
        if (error instanceof AtelierDevelopmentSnapshotTooLargeError) return { ...noExecution, status: "snapshot_too_large",
          reservationAttempted: false, requestTargetBytes: error.requestTargetBytes, maxRequestTargetBytes: error.maxRequestTargetBytes };
        if (!writeAttempted || !store) return closed("unavailable");
        // A response may be lost after commit. Read once; never reapply the write or launch.
        try {
          const reread = await load(ctx.data, request.data.missionId, store);
          if (reread) {
            const receipt = existing(reread, ctx.data, confirmed.data.expectedBindingHash, "recovered");
            if (receipt.status === "reserved" || receipt.status === "conflict") return receipt;
          }
        } catch { /* the outcome remains unknown */ }
        return closed("reconciliation_required");
      }
    },
    async lookup(context: AtelierDevelopmentContext, missionId: string): Promise<AtelierDevelopmentReceipt> {
      const ctx = atelierDevelopmentContextSchema.safeParse(context);
      if (!ctx.success || !z.uuid().safeParse(missionId).success) return closed("invalid_request");
      try {
        if (!isEnabled()) return closed("disabled");
        const store = getStore(); if (!store) return closed("unavailable");
        const mission = await load(ctx.data, missionId, store);
        return mission ? existing(mission, ctx.data) : closed("not_found");
      } catch { return closed("unavailable"); }
    },
  };
}
