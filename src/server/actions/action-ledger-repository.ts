import type { ActionLedgerStatus, CalendarStorageMode, ModelMode } from "@/features/hq/types";
import type { LedgerEventType } from "@/features/skills/types";
import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import type { ServerUserContext } from "@/server/auth/user-context";
import type { ActionLedgerRow, Json } from "@/server/db/types";
import { createOptionalSupabaseAdminClient, hasSupabaseAdminConfig } from "@/server/supabase/admin";

export type ActionLedgerEntry = {
  id: string;
  userId: string;
  actionType: string;
  eventType?: LedgerEventType;
  summary: string;
  autonomyLevel: number;
  requiresConfirmation: boolean;
  modelId?: string;
  costMode?: ModelMode;
  workspaceId?: string;
  skillId?: string;
  agentId?: string;
  missionId?: string;
  payload: Json;
  metadata: Json;
  createdAt: string;
  storageMode: CalendarStorageMode;
};

/**
 * Typed shape for mission-related fields stored in metadata jsonb.
 * No DB migration required — these live inside the existing `metadata` column.
 * A future executor must pass `missionId` on every action it triggers.
 */
export type MissionLedgerMetadata = {
  missionId?: string;
  missionStatus?: string;
  missionTransition?: string;
  approvalConfirmed?: boolean;
};

export type RecordActionInput = {
  actionType: string;
  eventType?: LedgerEventType;
  summary: string;
  autonomyLevel: number;
  requiresConfirmation: boolean;
  modelId?: string;
  costMode?: ModelMode;
  workspaceId?: string;
  skillId?: string;
  agentId?: string;
  payload?: Json;
  metadata?: Json;
  /** When set, merged into metadata.missionId for mission execution traceability. */
  missionId?: string;
};

export type ActionLedgerRepository = {
  mode: CalendarStorageMode;
  record(input: RecordActionInput): Promise<ActionLedgerEntry>;
};

export class ActionLedgerRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionLedgerRepositoryError";
  }
}

const localEntries: ActionLedgerEntry[] = [];

function createLocalId() {
  return `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
    costMode: row.cost_mode ? (row.cost_mode as ModelMode) : undefined,
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

function buildMetadata(input: RecordActionInput): Json {
  const base = typeof input.metadata === "object" && input.metadata !== null && !Array.isArray(input.metadata)
    ? (input.metadata as { [key: string]: Json | undefined })
    : {};
  if (input.missionId !== undefined) {
    return { ...base, missionId: input.missionId };
  }
  return base;
}

function createLocalActionLedgerRepository(user: ServerUserContext): ActionLedgerRepository {
  return {
    mode: "local",
    async record(input) {
      const entry: ActionLedgerEntry = {
        id: createLocalId(),
        userId: user.userId,
        actionType: input.actionType,
        eventType: input.eventType,
        summary: input.summary,
        autonomyLevel: input.autonomyLevel,
        requiresConfirmation: input.requiresConfirmation,
        modelId: input.modelId,
        costMode: input.costMode,
        workspaceId: input.workspaceId,
        skillId: input.skillId,
        agentId: input.agentId,
        missionId: input.missionId,
        payload: input.payload ?? {},
        metadata: buildMetadata(input),
        createdAt: new Date().toISOString(),
        storageMode: "local",
      };

      localEntries.push(entry);

      return entry;
    },
  };
}

function createSupabaseActionLedgerRepository(user: ServerUserContext): ActionLedgerRepository {
  const supabase = createOptionalSupabaseAdminClient();

  if (!supabase) {
    return createLocalActionLedgerRepository(user);
  }

  return {
    mode: "supabase",
    async record(input) {
      const { data, error } = await supabase
        .from("action_ledger")
        .insert({
          user_id: user.userId,
          action_type: input.actionType,
          event_type: input.eventType ?? null,
          summary: input.summary,
          autonomy_level: input.autonomyLevel,
          requires_confirmation: input.requiresConfirmation,
          model_id: input.modelId ?? null,
          cost_mode: input.costMode ?? null,
          workspace_id: input.workspaceId ?? null,
          skill_id: input.skillId ?? null,
          agent_id: input.agentId ?? null,
          mission_id: input.missionId ?? null,
          payload: input.payload ?? {},
          metadata: buildMetadata(input),
        })
        .select()
        .single();

      if (error) {
        throw new ActionLedgerRepositoryError(error.message);
      }

      return mapActionRow(data, "supabase");
    },
  };
}

function createUnavailableActionLedgerRepository(): ActionLedgerRepository {
  return {
    mode: "local",
    async record() {
      throw new ActionLedgerRepositoryError(
        "Supabase configuration is required for action ledger persistence in production.",
      );
    },
  };
}

export function createActionLedgerRepository(user: ServerUserContext): ActionLedgerRepository {
  if (user.storagePreference === "supabase" && hasSupabaseAdminConfig()) {
    return createSupabaseActionLedgerRepository(user);
  }

  if (!isLocalPersistenceFallbackAllowed()) {
    return createUnavailableActionLedgerRepository();
  }

  return createLocalActionLedgerRepository(user);
}

export function toActionLedgerStatus(error: unknown): ActionLedgerStatus {
  return error ? "failed" : "recorded";
}
