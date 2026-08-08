import type { ActionLedgerStatus, CalendarStorageMode, ModelMode } from "@/core/types";
import type { LedgerEventType } from "@/core/types";
import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import type { ServerUserContext } from "@/server/auth/user-context";
import type { ActionLedgerRow, ActionLedgerInsert, Json } from "@/server/db/types";
import type { CanonicalJson } from "@/server/ledger/hash-chain-canonicalizer";
import {
  allocateLedgerSealIdentity,
  requireLiveSealHmacKey,
  resolveLocalChainTail,
  sealLiveLedgerAppend,
} from "@/server/ledger/hash-chain-live-write";
import type { LedgerChainEntry } from "@/server/ledger/hash-chain-verifier";
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
  /** Hash-chain seal fields — set when LEDGER_HASH_CHAIN_WRITE is ON. */
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

function asCanonicalJson(value: Json): CanonicalJson {
  return value as CanonicalJson;
}

async function resolveSupabaseChainTail(
  supabase: NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>,
  workspaceId: string | null,
): Promise<LedgerChainEntry | null> {
  let query = supabase
    .from("action_ledger")
    .select(
      "id, user_id, workspace_id, agent_id, skill_id, mission_id, action_type, event_type, summary, autonomy_level, requires_confirmation, payload, metadata, created_at, prev_hash, entry_hash, hmac, canonical_version",
    )
    .not("entry_hash", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);

  query = workspaceId === null ? query.is("workspace_id", null) : query.eq("workspace_id", workspaceId);

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new ActionLedgerRepositoryError(`Failed to resolve hash-chain tip: ${error.message}`);
  }
  if (!data || typeof data.entry_hash !== "string" || data.entry_hash.length === 0) {
    return null;
  }

  return {
    id: data.id,
    workspace_id: data.workspace_id,
    user_id: data.user_id,
    agent_id: data.agent_id,
    skill_id: data.skill_id,
    mission_id: data.mission_id,
    action_type: data.action_type,
    event_type: data.event_type,
    summary: data.summary,
    autonomy_level: data.autonomy_level,
    requires_confirmation: data.requires_confirmation,
    payload: asCanonicalJson(data.payload),
    metadata: asCanonicalJson(data.metadata),
    created_at: data.created_at,
    prev_hash: data.prev_hash ?? null,
    entry_hash: data.entry_hash,
    hmac: data.hmac ?? null,
    canonical_version: data.canonical_version ?? undefined,
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

function createLocalActionLedgerRepository(user: ServerUserContext): ActionLedgerRepository {
  return {
    mode: "local",
    async record(input) {
      const metadata = buildMetadata(input);
      const payload = input.payload ?? {};
      const hmacKey = requireLiveSealHmacKey();

      let identity = {
        id: createLocalId(),
        createdAt: new Date().toISOString(),
      };
      let chain:
        | {
            prevHash: string | null;
            entryHash: string;
            hmac: string | null;
            canonicalVersion: number;
          }
        | undefined;

      if (hmacKey) {
        identity = allocateLedgerSealIdentity();
        const tail = resolveLocalChainTail(localEntries, input.workspaceId);
        const columns = sealLiveLedgerAppend({
          identity,
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
          tail,
          hmacKey,
        });
        chain = {
          prevHash: columns.prev_hash,
          entryHash: columns.entry_hash,
          hmac: columns.hmac,
          canonicalVersion: columns.canonical_version,
        };
      }

      const entry: ActionLedgerEntry = {
        id: identity.id,
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
        createdAt: identity.createdAt,
        storageMode: "local",
        ...chain,
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
      const metadata = buildMetadata(input);
      const payload = input.payload ?? {};
      const hmacKey = requireLiveSealHmacKey();

      const insertRow: ActionLedgerInsert = {
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
        payload,
        metadata,
      };

      if (hmacKey) {
        const identity = allocateLedgerSealIdentity();
        const tail = await resolveSupabaseChainTail(supabase, input.workspaceId ?? null);
        const columns = sealLiveLedgerAppend({
          identity,
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
          tail,
          hmacKey,
        });

        insertRow.id = identity.id;
        insertRow.created_at = identity.createdAt;
        insertRow.prev_hash = columns.prev_hash;
        insertRow.entry_hash = columns.entry_hash;
        insertRow.hmac = columns.hmac;
        insertRow.canonical_version = columns.canonical_version;
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
