import { randomUUID } from "node:crypto";
import type { ActionLedgerStatus, CalendarStorageMode, ModelMode } from "@/core/types";
import type { LedgerEventType } from "@/core/types";
import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import type { ServerUserContext } from "@/server/auth/user-context";
import type { ActionLedgerRow, Json } from "@/server/db/types";
import type { CanonicalJson } from "@/server/ledger/hash-chain-canonicalizer";
import { resolveChainColumns, type ChainTip } from "@/server/ledger/hash-chain-live-append";
import type { ChainWriteColumns } from "@/server/ledger/hash-chain-write-plan";
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
  /** Hash-chain seal fields — set when LEDGER_HASH_CHAIN_WRITE seals the row. */
  prevHash?: string | null;
  entryHash?: string;
  hmac?: string | null;
  canonicalVersion?: number;
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

export type WorkspaceLedgerMetadataInput = {
  eventType?: LedgerEventType;
  workspaceId?: string;
  modeId?: string;
  skillId?: string;
  agentId?: string;
  assistantProfileId?: string;
  missionId?: string;
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

function isJsonRecord(value: Json | undefined): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withoutUndefinedValues(value: { [key: string]: Json | undefined }): Record<string, Json> {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, Json] => entry[1] !== undefined),
  );
}

export function toWorkspaceLedgerMetadata(input: WorkspaceLedgerMetadataInput): Record<string, Json> {
  const assistantProfileId = input.assistantProfileId ?? input.agentId;

  return withoutUndefinedValues({
    eventType: input.eventType,
    workspaceId: input.workspaceId,
    modeId: input.modeId,
    skillId: input.skillId,
    agentId: input.agentId,
    assistantProfileId,
    missionId: input.missionId,
  });
}

export function withWorkspaceActionMetadata(
  metadata: Json | undefined,
  workspaceMetadata: WorkspaceLedgerMetadataInput,
): Json {
  const base = isJsonRecord(metadata) ? metadata : {};

  return {
    ...base,
    ...toWorkspaceLedgerMetadata(workspaceMetadata),
  };
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
    prevHash: row.prev_hash ?? undefined,
    entryHash: row.entry_hash ?? undefined,
    hmac: row.hmac ?? undefined,
    canonicalVersion: row.canonical_version ?? undefined,
  };
}

function getPayloadMetadata(input: RecordActionInput): Json | undefined {
  if (!isJsonRecord(input.payload)) return undefined;

  return input.payload.metadata;
}

function buildMetadata(input: RecordActionInput): Json {
  const payloadMetadata = getPayloadMetadata(input);
  const base = {
    ...(isJsonRecord(payloadMetadata) ? payloadMetadata : {}),
    ...(isJsonRecord(input.metadata) ? input.metadata : {}),
  };

  return withWorkspaceActionMetadata(base, {
    eventType: input.eventType,
    workspaceId: input.workspaceId,
    modeId: isJsonRecord(base) && typeof base.modeId === "string" ? base.modeId : undefined,
    skillId: input.skillId,
    agentId: input.agentId,
    missionId: input.missionId ?? (typeof base.missionId === "string" ? base.missionId : undefined),
  });
}

function asCanonicalJson(value: Json): CanonicalJson {
  return value as CanonicalJson;
}

function applySealFields(
  entry: ActionLedgerEntry,
  chain: ChainWriteColumns | null,
): ActionLedgerEntry {
  if (!chain) return entry;
  return {
    ...entry,
    prevHash: chain.prev_hash,
    entryHash: chain.entry_hash,
    hmac: chain.hmac,
    canonicalVersion: chain.canonical_version,
  };
}

function resolveLocalTip(workspaceId: string | undefined): ChainTip {
  const scoped = localEntries.filter((entry) =>
    workspaceId ? entry.workspaceId === workspaceId : entry.workspaceId == null,
  );
  for (let i = scoped.length - 1; i >= 0; i--) {
    const tip = scoped[i];
    if (typeof tip?.entryHash === "string" && tip.entryHash.length > 0) {
      return { entry_hash: tip.entryHash };
    }
  }
  return null;
}

function createLocalActionLedgerRepository(user: ServerUserContext): ActionLedgerRepository {
  return {
    mode: "local",
    async record(input) {
      const id = createLocalId();
      const createdAt = new Date().toISOString();
      const metadata = buildMetadata(input);
      const payload = input.payload ?? {};

      let chain: ChainWriteColumns | null = null;
      try {
        chain = resolveChainColumns(
          {
            id,
            workspaceId: input.workspaceId,
            userId: user.userId,
            agentId: input.agentId,
            skillId: input.skillId,
            missionId: input.missionId,
            actionType: input.actionType,
            eventType: input.eventType,
            summary: input.summary,
            autonomyLevel: input.autonomyLevel,
            requiresConfirmation: input.requiresConfirmation,
            payload: asCanonicalJson(payload),
            metadata: asCanonicalJson(metadata),
            createdAt,
          },
          resolveLocalTip(input.workspaceId),
        );
      } catch (error) {
        throw new ActionLedgerRepositoryError(
          error instanceof Error ? error.message : "Hash-chain seal failed.",
        );
      }

      const entry = applySealFields(
        {
          id,
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
          payload,
          metadata,
          createdAt,
          storageMode: "local",
        },
        chain,
      );

      localEntries.push(entry);

      return entry;
    },
  };
}

async function resolveSupabaseTip(
  supabase: NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>,
  workspaceId: string | null,
): Promise<ChainTip> {
  let query = supabase
    .from("action_ledger")
    .select("entry_hash")
    .not("entry_hash", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);

  query = workspaceId ? query.eq("workspace_id", workspaceId) : query.is("workspace_id", null);

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new ActionLedgerRepositoryError(`Failed to resolve ledger chain tip: ${error.message}`);
  }

  const entryHash = data && typeof data.entry_hash === "string" ? data.entry_hash : null;
  return entryHash && entryHash.length > 0 ? { entry_hash: entryHash } : null;
}

function createSupabaseActionLedgerRepository(user: ServerUserContext): ActionLedgerRepository {
  const supabase = createOptionalSupabaseAdminClient();

  if (!supabase) {
    return createLocalActionLedgerRepository(user);
  }

  return {
    mode: "supabase",
    async record(input) {
      const id = randomUUID();
      const createdAt = new Date().toISOString();
      const metadata = buildMetadata(input);
      const payload = input.payload ?? {};
      const workspaceId = input.workspaceId ?? null;

      let chain: ChainWriteColumns | null = null;
      try {
        const tip = await resolveSupabaseTip(supabase, workspaceId);
        chain = resolveChainColumns(
          {
            id,
            workspaceId: input.workspaceId,
            userId: user.userId,
            agentId: input.agentId,
            skillId: input.skillId,
            missionId: input.missionId,
            actionType: input.actionType,
            eventType: input.eventType,
            summary: input.summary,
            autonomyLevel: input.autonomyLevel,
            requiresConfirmation: input.requiresConfirmation,
            payload: asCanonicalJson(payload),
            metadata: asCanonicalJson(metadata),
            createdAt,
          },
          tip,
        );
      } catch (error) {
        throw new ActionLedgerRepositoryError(
          error instanceof Error ? error.message : "Hash-chain seal failed.",
        );
      }

      const insertRow: Record<string, unknown> = {
        id,
        user_id: user.userId,
        action_type: input.actionType,
        event_type: input.eventType ?? null,
        summary: input.summary,
        autonomy_level: input.autonomyLevel,
        requires_confirmation: input.requiresConfirmation,
        model_id: input.modelId ?? null,
        cost_mode: input.costMode ?? null,
        workspace_id: workspaceId,
        skill_id: input.skillId ?? null,
        agent_id: input.agentId ?? null,
        mission_id: input.missionId ?? null,
        payload,
        metadata,
        created_at: createdAt,
      };

      // Only attach chain columns when sealing is active — older DBs without
      // Phase 1 columns must keep working while the flag is OFF.
      if (chain) {
        insertRow.prev_hash = chain.prev_hash;
        insertRow.entry_hash = chain.entry_hash;
        insertRow.hmac = chain.hmac;
        insertRow.canonical_version = chain.canonical_version;
      }

      const { data, error } = await supabase.from("action_ledger").insert(insertRow).select().single();

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

/** Read-only view of in-memory ledger entries (local persistence mode). */
export function listLocalActionLedgerEntries(): readonly ActionLedgerEntry[] {
  return [...localEntries];
}

export function getLocalActionLedgerEntriesForSmoke(): readonly ActionLedgerEntry[] {
  return listLocalActionLedgerEntries();
}

export function toActionLedgerStatus(error: unknown): ActionLedgerStatus {
  return error ? "failed" : "recorded";
}
