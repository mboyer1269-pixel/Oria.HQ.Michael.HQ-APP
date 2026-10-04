import "server-only";
import { buildOpenHandsSubmission, type OpenHandsSubmissionRequest } from "./openhands-submission";
import { createOpenHandsReservationService, OPENHANDS_RESERVATION_KEY, openHandsReceiptSchema, type OpenHandsReservationStore, type OpenHandsReservationReceipt } from "./openhands-reservation";
import { createOpenHandsReservationStore } from "./openhands-reservation-store";
import { createOpenHandsAuthorityStore, OpenHandsAuthorityError, type OpenHandsAuthorityStore } from "./openhands-authority-store";
import { defaultLoadLaunchConfig } from "./model-emission-launch-gate";
import type { LaunchConfig } from "@/core/openhands-launch-contract";

export function createOpenHandsConfirmationService(deps: { store?: () => OpenHandsReservationStore | null;
  authority?: () => OpenHandsAuthorityStore | null; now?: () => number; configuration?: () => LaunchConfig | null } = {}) {
  return async (context: { workspaceId: string; actorId: string }, request: OpenHandsSubmissionRequest,
    confirmation?: { expectedPayloadHash: string; confirm: true }) => {
    let persistAttempted = false;
    let authorityFailure: "expired" | "conflict" | undefined;
    try {
      const configuration = (deps.configuration ?? defaultLoadLaunchConfig)();
      if (configuration?.providerProfile) {
        if (!configuration.foundationModelId) return {status:"model_selection_required",externalEffectAllowed:false};
        if (request.foundationModelId !== undefined && request.foundationModelId !== configuration.foundationModelId)
          return {status:"model_selection_changed",externalEffectAllowed:false};
        request = {...request, foundationModelId:configuration.foundationModelId};
      }
      const store = (deps.store ?? createOpenHandsReservationStore)();
      if (!store) return { status: "unavailable", externalEffectAllowed: false };
      const mission = await store.load(context.workspaceId, request.missionId);
      if (!mission || mission.workspaceId !== context.workspaceId || mission.id !== request.missionId) return { status: "not_found", externalEffectAllowed: false };
      const candidate = { ...mission, input: { ...mission.input } };
      let priorReceipt: OpenHandsReservationReceipt | undefined;
      if (OPENHANDS_RESERVATION_KEY in candidate.input) {
        const receipt = openHandsReceiptSchema.safeParse(candidate.input[OPENHANDS_RESERVATION_KEY]);
        if (!receipt.success || receipt.data.workspaceId !== context.workspaceId || receipt.data.missionId !== mission.id) return { status: "reconciliation_required", externalEffectAllowed: false };
        priorReceipt = receipt.data;
        if (priorReceipt.actorId !== context.actorId) return { status: "authorization_denied", externalEffectAllowed: false };
        candidate.updatedAt = receipt.data.missionVersion;
        delete candidate.input[OPENHANDS_RESERVATION_KEY];
      }
      const prepared = buildOpenHandsSubmission(candidate, context.workspaceId, request);
      if (prepared.status !== "prepared") return { ...prepared, externalEffectAllowed: false };
      if (priorReceipt && (priorReceipt.idempotencyKey !== prepared.dossier.idempotencyKey || priorReceipt.payloadHash !== prepared.dossier.payloadHash)) return { status: "conflict", externalEffectAllowed: false };
      if (!confirmation && priorReceipt) return { status: priorReceipt.state === "audit_recorded" ? "already_reserved" : "reconciliation_required", receipt: priorReceipt, externalEffectAllowed: false };
      if (!confirmation) return { ...prepared, externalEffectAllowed: false };
      if (confirmation.confirm !== true || confirmation.expectedPayloadHash !== prepared.dossier.payloadHash) return { status: "dossier_changed", externalEffectAllowed: false };
      const reserve = createOpenHandsReservationService({ store: () => store, now: deps.now, resolveAuthorization: async (dossier, actorId) => {
        // Reservation reloads and rebuilds again: a racing mission change cannot
        // acquire authorization for a different dossier after the preview check.
        if (dossier.payloadHash !== confirmation.expectedPayloadHash || actorId !== context.actorId) return null;
        const authority = (deps.authority ?? createOpenHandsAuthorityStore)();
        if (!authority) return null;
        persistAttempted = true;
        try { return await authority.persist(dossier, actorId, (deps.now ?? Date.now)()); }
        catch (error) { if (error instanceof OpenHandsAuthorityError) authorityFailure = error.reason; throw error; }
      } });
      const outcome = await reserve(context, request);
      if (authorityFailure) return { status: authorityFailure === "expired" ? "authorization_expired" : "conflict", externalEffectAllowed: false };
      if (persistAttempted && outcome.status === "unavailable") return { status: "authorization_outcome_unknown", externalEffectAllowed: false };
      return outcome;
    } catch { return { status: persistAttempted ? "authorization_outcome_unknown" : "unavailable", externalEffectAllowed: false }; }
  };
}
