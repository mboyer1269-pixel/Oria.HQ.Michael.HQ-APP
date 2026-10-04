import "server-only";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import { createActionLedgerRepository } from "@/server/actions/action-ledger-repository";
import type { Json } from "@/server/db/types";
import { mapMissionRow } from "./mission-row";
import { OPENHANDS_RESERVATION_KEY, type OpenHandsReservationStore } from "./openhands-reservation";

/** Existing missions JSONB receipt + existing durable ledger; no new queue. */
export function createOpenHandsReservationStore(client = createOptionalSupabaseAdminClient()): OpenHandsReservationStore | null {
  if (!client) return null;
  return {
    async load(workspaceId, missionId) {
      const { data, error } = await client.from("missions").select().eq("workspace_id", workspaceId).eq("id", missionId).maybeSingle();
      if (error) throw new Error("reservation_store_unavailable");
      return data ? mapMissionRow(data) : null;
    },
    async compareAndSwap(mission, receipt) {
      const input = { ...mission.input, [OPENHANDS_RESERVATION_KEY]: receipt };
      const { data, error } = await client.from("missions").update({ input: input as unknown as Json, updated_at: new Date().toISOString() })
        .eq("id", mission.id).eq("workspace_id", mission.workspaceId).eq("status", mission.status)
        .eq("updated_at", mission.updatedAt).eq("input", JSON.stringify(mission.input)).select().maybeSingle();
      if (error) throw new Error("reservation_store_unavailable");
      return data ? mapMissionRow(data) : null;
    },
    async audit(mission, receipt) {
      const ledger = createActionLedgerRepository({ userId: receipt.actorId, storagePreference: "supabase" });
      if (ledger.mode !== "supabase") throw new Error("durable_audit_unavailable");
      const entry = await ledger.record({ actionType: "mission.openhands_reservation", summary: "OpenHands dossier reserved; no external effect",
        autonomyLevel: 0, requiresConfirmation: true, workspaceId: mission.workspaceId, missionId: mission.id,
        metadata: { reservationId: receipt.reservationId, idempotencyKey: receipt.idempotencyKey, payloadHash: receipt.payloadHash,
          missionVersion: receipt.missionVersion, authorizationId: receipt.authorizationId, confirmedBy: receipt.actorId,
          authorizationExpiresAt: receipt.authorizationExpiresAt, externalEffectAllowed: false } });
      return entry.id;
    },
  };
}
