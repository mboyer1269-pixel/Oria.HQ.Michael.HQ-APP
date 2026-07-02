import type { CalendarStorageMode } from "@/core/types";
import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import type { ActionLedgerRow } from "@/server/db/types";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import {
  listLocalActionLedgerEntries,
  type ActionLedgerEntry,
} from "./action-ledger-repository";
import {
  DEFAULT_LEDGER_ACTIVITY_LIMIT,
  MAX_LEDGER_ACTIVITY_LIMIT,
  type ListActionLedgerInput,
  type ListActionLedgerResult,
} from "./action-ledger-read.types";

export {
  DEFAULT_LEDGER_ACTIVITY_LIMIT,
  MAX_LEDGER_ACTIVITY_LIMIT,
  type ListActionLedgerInput,
  type ListActionLedgerResult,
} from "./action-ledger-read.types";

function resolveLimit(limit?: number): number {
  const requested = limit ?? DEFAULT_LEDGER_ACTIVITY_LIMIT;
  return Math.min(Math.max(1, requested), MAX_LEDGER_ACTIVITY_LIMIT);
}

function mapActionRow(row: ActionLedgerRow, storageMode: CalendarStorageMode): ActionLedgerEntry {
  return {
    id: row.id,
    userId: row.user_id,
    actionType: row.action_type,
    eventType: row.event_type ?? undefined,
    summary: row.summary,
    autonomyLevel: row.autonomy_level,
    requiresConfirmation: row.requires_confirmation,
    modelId: row.model_id ?? undefined,
    costMode: row.cost_mode ? (row.cost_mode as ActionLedgerEntry["costMode"]) : undefined,
    workspaceId: row.workspace_id ?? undefined,
    skillId: row.skill_id ?? undefined,
    agentId: row.agent_id ?? undefined,
    missionId: row.mission_id ?? undefined,
    payload: row.payload,
    metadata: row.metadata,
    createdAt: row.created_at,
    storageMode,
  };
}

function listLocalActionLedgerEntriesForWorkspace(workspaceId: string, limit: number): ActionLedgerEntry[] {
  return listLocalActionLedgerEntries()
    .filter((entry) => entry.workspaceId === workspaceId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

/**
 * Read-only ledger activity for a workspace. Supabase is the source of truth when
 * configured; development can fall back to the in-memory local store populated by writes.
 */
export async function listActionLedgerForWorkspace(
  input: ListActionLedgerInput,
): Promise<ListActionLedgerResult> {
  const limit = resolveLimit(input.limit);
  const supabase = createOptionalSupabaseAdminClient();

  if (supabase) {
    const { data, error } = await supabase
      .from("action_ledger")
      .select()
      .eq("workspace_id", input.workspaceId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to list action ledger from Supabase: ${error.message}`);
    }

    return {
      workspaceId: input.workspaceId,
      entries: (data ?? []).map((row) => mapActionRow(row, "supabase")),
      source: "supabase",
    };
  }

  if (!isLocalPersistenceFallbackAllowed()) {
    throw new Error("Supabase configuration is required for action ledger reads in production.");
  }

  return {
    workspaceId: input.workspaceId,
    entries: listLocalActionLedgerEntriesForWorkspace(input.workspaceId, limit),
    source: "local",
  };
}
