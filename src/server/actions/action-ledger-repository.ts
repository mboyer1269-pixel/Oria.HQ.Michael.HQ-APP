import { randomUUID } from "node:crypto";

import type { ActionLedgerStatus, CalendarStorageMode, ModelMode } from "@/core/types";
import type { LedgerEventType } from "@/core/types";
import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import type { ServerUserContext } from "@/server/auth/user-context";
import type { ActionLedgerRow, ActionLedgerInsert, Json } from "@/server/db/types";
import {
  getOrCreateLocalChainWriter,
} from "@/server/ledger/hash-chain-local-registry";
import {
  resolveLedgerChainScope,
  toCanonicalLedgerFields,
  type LedgerRowForChain,
} from "@/server/ledger/hash-chain-ledger-fields";
import { resolveLedgerHmacKey } from "@/server/ledger/hash-chain-hmac-key";
import { sealNewLedgerRow } from "@/server/ledger/hash-chain-live-seal";
import { isHashChainWriteEnabled } from "@/server/ledger/hash-chain-write-flag";
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
  prevHash?: string | null;
  entryHash?: string | null;
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
  const extended = row as ActionLedgerRow & {
    prev_hash?: string | null;
    entry_hash?: string | null;
    hmac?: string | null;
    canonical_version?: number | null;
  };

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
    prevHash: extended.prev_hash ?? undefined,
    entryHash: extended.entry_hash ?? undefined,
    hmac: extended.hmac ?? undefined,
    canonicalVersion: extended.canonical_version ?? undefined,
  };
}

function buildRowForSeal(
  input: RecordActionInput,
  user: ServerUserContext,
  id: string,
  createdAt: string,
): LedgerRowForChain {
  return {
    id,
    user_id: user.userId,
    workspace_id: input.workspaceId ?? null,
    agent_id: input.agentId ?? null,
    skill_id: input.skillId ?? null,
    mission_id: input.missionId ?? null,
    action_type: input.actionType,
    event_type: input.eventType ?? null,
    summary: input.summary,
    autonomy_level: input.autonomyLevel,
    requires_confirmation: input.requiresConfirmation,
    payload: (input.payload ?? {}) as LedgerRowForChain["payload"],
    metadata: buildMetadata(input) as LedgerRowForChain["metadata"],
    created_at: createdAt,
  };
}

async function fetchSupabaseChainTail(
  supabase: NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>,
  workspaceId: string | null,
  userId: string,
): Promise<LedgerChainEntry | null> {
  const query = supabase
    .from("action_ledger")
    .select("id, workspace_id, user_id, agent_id, skill_id, mission_id, action_type, event_type, summary, autonomy_level, requires_confirmation, payload, metadata, created_at, prev_hash, entry_hash, hmac, canonical_version")
    .not("entry_hash", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);

  const { data, error } = workspaceId
    ? await query.eq("workspace_id", workspaceId)
    : await query.is("workspace_id", null).eq("user_id", userId);

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("entry_hash") || message.includes("column")) {
      return null;
    }
    throw new ActionLedgerRepositoryError(`Failed to read ledger chain tail: ${error.message}`);
  }

  const row = data?.[0];
  if (!row || typeof row.entry_hash !== "string") return null;

  return {
    id: row.id,
    workspace_id: row.workspace_id,
    user_id: row.user_id,
    agent_id: row.agent_id,
    skill_id: row.skill_id,
    mission_id: row.mission_id,
    action_type: row.action_type,
    event_type: row.event_type,
    summary: row.summary,
    autonomy_level: row.autonomy_level,
    requires_confirmation: row.requires_confirmation,
    payload: row.payload as LedgerRowForChain["payload"],
    metadata: row.metadata as LedgerRowForChain["metadata"],
    created_at: row.created_at,
    prev_hash: row.prev_hash ?? null,
    entry_hash: row.entry_hash,
    hmac: row.hmac ?? null,
    canonical_version: row.canonical_version ?? undefined,
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
      const id = createLocalId();
      const createdAt = new Date().toISOString();
      const chainScope = resolveLedgerChainScope(input.workspaceId ?? null, user.userId);
      const rowForSeal = buildRowForSeal(input, user, id, createdAt);

      let prevHash: string | null | undefined;
      let entryHash: string | undefined;
      let hmac: string | null | undefined;
      let canonicalVersion: number | undefined;

      if (isHashChainWriteEnabled()) {
        const hmacKey = resolveLedgerHmacKey();
        const writer = getOrCreateLocalChainWriter(chainScope, hmacKey);
        const sealed = writer.append(toCanonicalLedgerFields(rowForSeal));
        prevHash = sealed.prev_hash;
        entryHash = sealed.entry_hash;
        hmac = sealed.hmac ?? null;
        canonicalVersion = sealed.canonical_version;
      }

      const entry: ActionLedgerEntry = {
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
        payload: input.payload ?? {},
        metadata: buildMetadata(input),
        createdAt,
        storageMode: "local",
        prevHash,
        entryHash,
        hmac,
        canonicalVersion,
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
      const id = randomUUID();
      const createdAt = new Date().toISOString();
      const rowForSeal = buildRowForSeal(input, user, id, createdAt);

      const insertPayload: ActionLedgerInsert = {
        id,
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
        created_at: createdAt,
      };

      if (isHashChainWriteEnabled()) {
        const hmacKey = resolveLedgerHmacKey();
        const tail = await fetchSupabaseChainTail(
          supabase,
          input.workspaceId ?? null,
          user.userId,
        );
        const chainCols = sealNewLedgerRow({ row: rowForSeal, tail, hmacKey });
        if (chainCols) {
          insertPayload.prev_hash = chainCols.prev_hash;
          insertPayload.entry_hash = chainCols.entry_hash;
          insertPayload.hmac = chainCols.hmac;
          insertPayload.canonical_version = chainCols.canonical_version;
        }
      }

      const { data, error } = await supabase
        .from("action_ledger")
        .insert(insertPayload)
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
