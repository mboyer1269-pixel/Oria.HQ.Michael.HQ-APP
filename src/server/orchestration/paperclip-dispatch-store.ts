import "server-only";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import { createActionLedgerRepository } from "@/server/actions/action-ledger-repository";
import type { Json, MissionRow } from "@/server/db/types";
import type { DispatchMission, DispatchStore } from "./paperclip-dispatch";

function map(row: MissionRow): DispatchMission {
  if (!row.input || typeof row.input !== "object" || Array.isArray(row.input)) throw new Error("invalid_mission_input");
  return { id: row.id, workspaceId: row.workspace_id, title: row.title, objective: row.objective,
    expectedOutput: row.expected_output, status: row.status, updatedAt: row.updated_at, input: row.input };
}

/** Existing mission JSONB carries only a technical receipt; Paperclip owns its issue and queue. */
export function createDurablePaperclipDispatchStore(client = createOptionalSupabaseAdminClient()): DispatchStore | null {
  if (!client) return null;
  return {
    async load(workspaceId, missionId) {
      const { data, error } = await client.from("missions").select().eq("id", missionId).eq("workspace_id", workspaceId).maybeSingle();
      if (error) throw new Error("mission_store_unavailable");
      return data ? map(data) : null;
    },
    async compareAndSwap(mission, input) {
      const { data, error } = await client.from("missions").update({ input: input as Json, updated_at: new Date().toISOString() })
        .eq("id", mission.id).eq("workspace_id", mission.workspaceId).eq("status", mission.status)
        .eq("updated_at", mission.updatedAt).eq("input", JSON.stringify(mission.input)).select().maybeSingle();
      if (error) throw new Error("mission_store_unavailable");
      return data ? map(data) : null;
    },
    async audit(actorId, mission, receipt) {
      const ledger = createActionLedgerRepository({ userId: actorId, storagePreference: "supabase" });
      if (ledger.mode !== "supabase") throw new Error("durable_ledger_unavailable");
      await ledger.record({ actionType: "mission.paperclip_handoff", summary: `Paperclip handoff: ${receipt.state}`,
        autonomyLevel: 0, requiresConfirmation: true, workspaceId: mission.workspaceId, missionId: mission.id,
        metadata: { correlationKey: receipt.correlationKey, companyId: receipt.companyId, state: receipt.state,
          remoteIssueId: receipt.remoteIssueId ?? null, payloadHash: receipt.payloadHash, confirmedBy: actorId },
      });
    },
  };
}
