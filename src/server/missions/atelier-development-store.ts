import "server-only";
import type { Mission } from "@/core/types";
import type { Json } from "@/server/db/types";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import { mapMissionRow } from "./mission-row";
import { ATELIER_DEVELOPMENT_KEY, claimMatchesDevelopmentMission, readAtelierDevelopmentClaim,
  type AtelierDevelopmentClaim } from "./atelier-development-contract";

export type AtelierDevelopmentStore = {
  load(workspaceId: string, missionId: string): Promise<Mission | null>;
  reserve(expected: Mission, claim: AtelierDevelopmentClaim): Promise<Mission | null>;
};

/** Conservative request-target budget below postgrest-js' 8,000-character warning.
 * Full snapshots can exceed proxy URL limits, especially after UTF-8 percent encoding.
 * This bounds the standard /rest/v1/missions target, not every custom proxy topology.
 * Larger missions require an atomic server-side CAS before this path can support them.
 */
export const MAX_ATELIER_CAS_REQUEST_TARGET_BYTES = 6000;
type CasFilter = [column: string, operator: "eq" | "is", value: string | number | boolean | null];
function reservationFilters(expected: Mission): CasFilter[] {
  return [
    ["workspace_id", "eq", expected.workspaceId], ["id", "eq", expected.id], ["status", "eq", expected.status],
    ["updated_at", "eq", expected.updatedAt], ["input", "eq", JSON.stringify(expected.input)],
    ["mode_id", "eq", expected.modeId], ["title", "eq", expected.title], ["objective", "eq", expected.objective],
    ["assigned_agent_id", "eq", expected.assignedAgentId], ["autonomy_level", "eq", expected.autonomyLevel],
    ["requires_approval", "eq", expected.requiresApproval], ["expected_output", "eq", expected.expectedOutput],
    ["risk_level", "eq", expected.riskLevel],
    expected.costBudgetCents === undefined ? ["cost_budget_cents", "is", null] : ["cost_budget_cents", "eq", expected.costBudgetCents],
    expected.result === undefined ? ["result", "is", null] : ["result", "eq", JSON.stringify(expected.result)],
  ];
}
export function atelierDevelopmentReservationRequestTargetBytes(expected: Mission): number {
  // The installed PostgREST builder uses URLSearchParams.append(column, `${operator}.${value}`).
  // Use the very same filter tuples below: no duplicated, drifting list of guarded columns.
  const url = new URL("https://offline.invalid/rest/v1/missions");
  for (const [column, operator, value] of reservationFilters(expected)) url.searchParams.append(column, `${operator}.${value}`);
  url.searchParams.set("select", "*");
  return Buffer.byteLength(url.pathname + url.search, "utf8");
}
export class AtelierDevelopmentSnapshotTooLargeError extends Error {
  readonly reservationAttempted = false;
  readonly maxRequestTargetBytes = MAX_ATELIER_CAS_REQUEST_TARGET_BYTES;
  constructor(readonly requestTargetBytes: number) {
    super("atelier_development_snapshot_too_large");
    this.name = "AtelierDevelopmentSnapshotTooLargeError";
  }
}

/** Existing missions table only. No local fallback, schema change, or ledger/approval write. */
export function createAtelierDevelopmentStore(client = createOptionalSupabaseAdminClient()): AtelierDevelopmentStore | null {
  if (!client) return null;
  return {
    async load(workspaceId, missionId) {
      const { data, error } = await client.from("missions").select()
        .eq("workspace_id", workspaceId).eq("id", missionId).maybeSingle();
      if (error) throw Error("atelier_development_store_unavailable");
      return data && data.workspace_id === workspaceId && data.id === missionId ? mapMissionRow(data) : null;
    },
    async reserve(expected, claim) {
      const valid = readAtelierDevelopmentClaim(claim);
      if (!valid || Object.prototype.hasOwnProperty.call(expected.input, ATELIER_DEVELOPMENT_KEY)
        || valid.binding.missionVersion !== expected.updatedAt
        || !claimMatchesDevelopmentMission(valid, expected, {
          workspaceId: valid.binding.workspaceId, modeId: valid.binding.modeId, actorId: valid.binding.actorId,
        })) throw Error("atelier_development_claim_invalid");
      const requestTargetBytes = atelierDevelopmentReservationRequestTargetBytes(expected);
      if (requestTargetBytes > MAX_ATELIER_CAS_REQUEST_TARGET_BYTES)
        throw new AtelierDevelopmentSnapshotTooLargeError(requestTargetBytes);
      // A monotonic version also distinguishes two operations inside one millisecond.
      const updatedAt = new Date(Math.max(Date.now(), Date.parse(expected.updatedAt) + 1)).toISOString();
      const input = { ...expected.input, [ATELIER_DEVELOPMENT_KEY]: valid };
      let query = client.from("missions").update({ input: input as unknown as Json, updated_at: updatedAt });
      // Protect the entire input/result and each bound source field, even without an updated_at bump.
      for (const [column, operator, value] of reservationFilters(expected)) query = query.filter(column, operator, value);
      const { data, error } = await query.select().maybeSingle();
      if (error) throw Error("atelier_development_reservation_unknown");
      if (!data) return null;
      if (data.workspace_id !== expected.workspaceId || data.id !== expected.id)
        throw Error("atelier_development_reservation_mismatch");
      return mapMissionRow(data);
    },
  };
}
