// src/server/agents/execution-intent-repository.ts
//
// Durable, auditable store for agent execution intents -- the executable actions
// queued for CEO approval. Dual-mode, mirroring the prepared-action repository:
//   - With Supabase configured, intents persist to public.agent_execution_intents
//     (migration 0024) via the service-role admin client (RLS blocks anon/auth).
//   - Otherwise, in development/test, an in-memory store is used.
//   - In production WITHOUT Supabase and WITHOUT the local fallback, it THROWS.
//
// Unlike prepared_actions (append-only, never executes), this store DOES support
// a controlled status transition (pending -> executing -> executed | failed,
// with a retryable executing -> pending). Transitions are validated against the
// pure model's legal-transition table so an illegal jump can never be persisted.
// Every read and write is scoped by workspace_id. Supabase failures surface as a
// sanitized error that never leaks internals.

import type {
  AgentExecutionIntent,
  AgentExecutionIntentPayload,
  AgentExecutionIntentStatus,
} from "@/features/agents/execution-intent";
import {
  AGENT_EXECUTION_INTENT_STATUSES,
  canTransitionExecutionIntent,
} from "@/features/agents/execution-intent";
import type { VenturePersistenceMode } from "@/features/ventures/venture-save-types";
import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import type { AgentExecutionIntentInsert, AgentExecutionIntentRow } from "@/server/db/types";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";

const PRODUCTION_GUARD_MESSAGE =
  "Agent execution intent persistence is unavailable: Supabase is not configured " +
  "and local-fallback persistence is only available outside production.";

const STATUS_SET: ReadonlySet<string> = new Set(AGENT_EXECUTION_INTENT_STATUSES);

// In-memory store for local development/test (no Supabase).
const localIntents: AgentExecutionIntentRow[] = [];
let localSeq = 0;

type SupabaseAdminClient = NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>;

type ExecutionIntentRepositoryGlobals = typeof globalThis & {
  __agentExecutionIntentRepositoryClientFactory?: (() => SupabaseAdminClient | null) | null;
};

export class AgentExecutionIntentRepositoryError extends Error {
  constructor(operation: "list" | "create" | "get" | "transition") {
    super(`Agent execution intent repository ${operation} failed.`);
    this.name = "AgentExecutionIntentRepositoryError";
  }
}

export class AgentExecutionIntentTransitionError extends Error {
  constructor(from: AgentExecutionIntentStatus, to: AgentExecutionIntentStatus) {
    super(`Illegal execution-intent transition from "${from}" to "${to}".`);
    this.name = "AgentExecutionIntentTransitionError";
  }
}

export class AgentExecutionIntentNotFoundError extends Error {
  constructor(intentId: string) {
    super(`Agent execution intent not found: ${intentId}.`);
    this.name = "AgentExecutionIntentNotFoundError";
  }
}

/**
 * Thrown when an atomic status transition affects zero rows: the intent was no
 * longer in the expected `from` status when the conditional UPDATE ran (a
 * concurrent approve/reject won the race). Distinct from a programming-time
 * illegal transition (AgentExecutionIntentTransitionError); callers map this to
 * a 409 because the action target moved underneath the request.
 */
export class AgentExecutionIntentConcurrencyError extends Error {
  constructor(from: AgentExecutionIntentStatus, to: AgentExecutionIntentStatus) {
    super(`Execution-intent transition from "${from}" to "${to}" lost a concurrent race.`);
    this.name = "AgentExecutionIntentConcurrencyError";
  }
}

function getSupabaseClient(): SupabaseAdminClient | null {
  const globals = globalThis as ExecutionIntentRepositoryGlobals;
  if (globals.__agentExecutionIntentRepositoryClientFactory) {
    return globals.__agentExecutionIntentRepositoryClientFactory();
  }
  return createOptionalSupabaseAdminClient();
}

function assertLocalFallbackAvailable(): void {
  if (!isLocalPersistenceFallbackAllowed()) {
    throw new Error(PRODUCTION_GUARD_MESSAGE);
  }
}

function cloneRow(row: AgentExecutionIntentRow): AgentExecutionIntentRow {
  return structuredClone(row);
}

function requireStatus(value: unknown): AgentExecutionIntentStatus {
  if (typeof value !== "string" || !STATUS_SET.has(value)) {
    throw new AgentExecutionIntentRepositoryError("get");
  }
  return value as AgentExecutionIntentStatus;
}

// ---------------------------------------------------------------------------
// Mapping (row <-> intent)
// ---------------------------------------------------------------------------

function mapIntentToInsert(
  workspaceId: string,
  userId: string,
  intent: AgentExecutionIntent,
): AgentExecutionIntentInsert {
  if (intent.requiresCeoApproval !== true) {
    throw new AgentExecutionIntentRepositoryError("create");
  }
  return {
    workspace_id: workspaceId,
    created_by_user_id: userId,
    intent_id: intent.intentId,
    agent_id: intent.agentId,
    skill_id: intent.skillId,
    tool_name: intent.toolName,
    autonomy_level: intent.autonomyLevel,
    status: intent.status,
    payload: intent.payload as unknown as AgentExecutionIntentInsert["payload"],
    action_ref: intent.actionRef ?? null,
    failure_code: intent.failureCode ?? null,
    requires_ceo_approval: true,
    updated_at: intent.updatedAt,
  };
}

function mapRowToIntent(row: AgentExecutionIntentRow): AgentExecutionIntent {
  if (row.requires_ceo_approval !== true) {
    throw new AgentExecutionIntentRepositoryError("get");
  }
  const intent: AgentExecutionIntent = {
    intentId: row.intent_id,
    workspaceId: row.workspace_id,
    agentId: row.agent_id,
    skillId: row.skill_id,
    toolName: row.tool_name,
    autonomyLevel: row.autonomy_level,
    status: requireStatus(row.status),
    payload: row.payload as unknown as AgentExecutionIntentPayload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    requiresCeoApproval: true,
  };
  if (row.action_ref !== null && row.action_ref !== undefined) {
    intent.actionRef = row.action_ref;
  }
  if (row.failure_code !== null && row.failure_code !== undefined) {
    intent.failureCode = row.failure_code;
  }
  return intent;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Appends a pending intent and returns the stored intent. Scoped to workspace. */
export async function createAgentExecutionIntent(
  workspaceId: string,
  userId: string,
  intent: AgentExecutionIntent,
): Promise<AgentExecutionIntent> {
  const insert = mapIntentToInsert(workspaceId, userId, intent);
  const db = getSupabaseClient();

  if (!db) {
    assertLocalFallbackAvailable();
    localSeq += 1;
    const row: AgentExecutionIntentRow = {
      ...insert,
      id: `local-intent-${String(localSeq).padStart(6, "0")}`,
      created_at: intent.createdAt,
    };
    localIntents.push(cloneRow(row));
    return mapRowToIntent(cloneRow(row));
  }

  const { error } = await db.from("agent_execution_intents").insert(insert);
  if (error) {
    throw new AgentExecutionIntentRepositoryError("create");
  }
  return intent;
}

/** Returns a single intent by id within a workspace, or null. */
export async function getAgentExecutionIntent(
  workspaceId: string,
  intentId: string,
): Promise<AgentExecutionIntent | null> {
  const db = getSupabaseClient();

  if (!db) {
    assertLocalFallbackAvailable();
    const row = localIntents.find(
      (r) => r.workspace_id === workspaceId && r.intent_id === intentId,
    );
    return row ? mapRowToIntent(cloneRow(row)) : null;
  }

  const { data, error } = await db
    .from("agent_execution_intents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("intent_id", intentId)
    .limit(1);
  if (error) {
    throw new AgentExecutionIntentRepositoryError("get");
  }
  const row = (data ?? [])[0];
  return row ? mapRowToIntent(row) : null;
}

/** Returns all pending intents for a workspace, most-recent first. */
export async function listPendingAgentExecutionIntents(
  workspaceId: string,
): Promise<AgentExecutionIntent[]> {
  const db = getSupabaseClient();

  if (!db) {
    assertLocalFallbackAvailable();
    return localIntents
      .filter((r) => r.workspace_id === workspaceId && r.status === "pending")
      .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
      .map((row) => mapRowToIntent(cloneRow(row)));
  }

  const { data, error } = await db
    .from("agent_execution_intents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) {
    throw new AgentExecutionIntentRepositoryError("list");
  }
  return (data ?? []).map(mapRowToIntent);
}

export type ExecutionIntentTransitionPatch = {
  toStatus: AgentExecutionIntentStatus;
  updatedAt: string;
  actionRef?: string;
  failureCode?: string;
  // The status the CALLER validated its decision against. When set, the
  // transition only applies while the row is STILL in that exact status; a
  // mismatch (a concurrent writer advanced it) raises a concurrency error
  // instead of advancing from the newer state. Callers that claim from a
  // specific state (e.g. reject from `pending`) MUST set this so a stale
  // decision cannot overwrite an in-flight one. When omitted, the freshly read
  // status is used (back-compatible for callers without a cross-request race).
  expectedFromStatus?: AgentExecutionIntentStatus;
};

/**
 * Applies a validated status transition. Throws AgentExecutionIntentNotFoundError
 * if the intent is absent and AgentExecutionIntentTransitionError if the jump is
 * not in the legal-transition table.
 */
export async function transitionAgentExecutionIntent(
  workspaceId: string,
  intentId: string,
  patch: ExecutionIntentTransitionPatch,
): Promise<AgentExecutionIntent> {
  const db = getSupabaseClient();

  if (!db) {
    assertLocalFallbackAvailable();
    const row = localIntents.find(
      (r) => r.workspace_id === workspaceId && r.intent_id === intentId,
    );
    if (!row) throw new AgentExecutionIntentNotFoundError(intentId);

    const from = requireStatus(row.status);
    // Caller's expected `from` takes precedence: a mismatch means a concurrent
    // writer advanced the row, so a stale decision must not proceed.
    if (patch.expectedFromStatus !== undefined && from !== patch.expectedFromStatus) {
      throw new AgentExecutionIntentConcurrencyError(patch.expectedFromStatus, patch.toStatus);
    }
    if (!canTransitionExecutionIntent(from, patch.toStatus)) {
      throw new AgentExecutionIntentTransitionError(from, patch.toStatus);
    }

    row.status = patch.toStatus;
    row.updated_at = patch.updatedAt;
    if (patch.actionRef !== undefined) row.action_ref = patch.actionRef;
    if (patch.failureCode !== undefined) row.failure_code = patch.failureCode;
    return mapRowToIntent(cloneRow(row));
  }

  const current = await getAgentExecutionIntent(workspaceId, intentId);
  if (!current) throw new AgentExecutionIntentNotFoundError(intentId);
  // Guard on the status the CALLER validated against when provided, NOT the
  // fresh read: otherwise a concurrent writer could advance the row to another
  // legal predecessor of `toStatus` (e.g. pending -> executing) and a stale
  // decision (reject, validated on pending) would still apply from the newer
  // state. Falls back to the fresh read for callers without a cross-request race.
  const guardFrom = patch.expectedFromStatus ?? current.status;
  if (!canTransitionExecutionIntent(guardFrom, patch.toStatus)) {
    throw new AgentExecutionIntentTransitionError(guardFrom, patch.toStatus);
  }

  const update: Partial<AgentExecutionIntentInsert> = {
    status: patch.toStatus,
    updated_at: patch.updatedAt,
    ...(patch.actionRef !== undefined ? { action_ref: patch.actionRef } : {}),
    ...(patch.failureCode !== undefined ? { failure_code: patch.failureCode } : {}),
  };
  // Atomic guard: the UPDATE only applies while the row is STILL in the expected
  // `from` status. This closes the read-then-update TOCTOU where a concurrent
  // approve+reject both observe `pending`. `select()` returns the affected rows
  // so a zero-row result means we lost the race.
  const { data, error } = await db
    .from("agent_execution_intents")
    .update(update)
    .eq("workspace_id", workspaceId)
    .eq("intent_id", intentId)
    .eq("status", guardFrom)
    .select();
  if (error) {
    throw new AgentExecutionIntentRepositoryError("transition");
  }
  if (!data || data.length === 0) {
    throw new AgentExecutionIntentConcurrencyError(guardFrom, patch.toStatus);
  }

  return {
    ...current,
    status: patch.toStatus,
    updatedAt: patch.updatedAt,
    ...(patch.actionRef !== undefined ? { actionRef: patch.actionRef } : {}),
    ...(patch.failureCode !== undefined ? { failureCode: patch.failureCode } : {}),
  };
}

/** Reports which persistence backend the repository will use right now. */
export function getAgentExecutionIntentPersistenceMode(): VenturePersistenceMode {
  if (getSupabaseClient()) return "supabase";
  return isLocalPersistenceFallbackAllowed() ? "local" : "unavailable";
}

/** Test-only helper to clear the in-memory fallback store. */
export function __clearAgentExecutionIntentsForTests(): void {
  localIntents.length = 0;
  localSeq = 0;
}
