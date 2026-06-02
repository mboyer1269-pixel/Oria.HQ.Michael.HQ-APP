// src/server/ventures/prepared-action-repository.ts
//
// Prepared action repository — durable, auditable backing store for the Hermès
// CEO review queue (the prepared-work half of the iterative prep loop).
//
// Persistence model: dual-mode, mirroring the cash-signal-intake / venture
// repositories.
//   - When Supabase is configured, prepared actions are persisted to the
//     public.prepared_actions table (migration 0013) via the service-role admin
//     client. RLS blocks anon/authenticated; the service role bypasses it.
//   - Otherwise, in development/test, an in-memory store is used (the local
//     fallback, see src/lib/server-env.ts).
//   - In production WITHOUT Supabase and WITHOUT the local fallback, the
//     repository THROWS rather than silently dropping prepared work.
//
// Scope & safety:
//   - This is an APPEND-ONLY queue: insert + list only. No update, no delete.
//     Status transitions are modeled as new, superseding rows.
//   - Every read and write is scoped by workspace_id; there is no cross-workspace
//     path. Each row is also stamped with the creating owner's user id.
//   - The governance invariants (requires_ceo_approval / requires_manual_send /
//     no_execution_authorized = true) are enforced by DB CHECK and again in the
//     pure mapping, so the local path is held to the identical standard.
//   - It NEVER executes, sends, contacts, or dispatches anything.
//   - Supabase failures surface as a sanitized error that never leaks internals.

import type { PreparedAction } from "@/features/ventures/prepared-action";
import type { VenturePersistenceMode } from "@/features/ventures/venture-save-types";
import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import type { PreparedActionRow } from "@/server/db/types";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import {
  mapPreparedActionToInsert,
  mapRowToPreparedAction,
} from "./prepared-action-row-mapping";

const PRODUCTION_GUARD_MESSAGE =
  "Prepared action persistence is unavailable: Supabase is not configured and " +
  "local-fallback persistence is only available outside production.";

// In-memory store for local development/test (no Supabase). Holds full rows so
// the local and Supabase paths share the exact same mapping.
const localPreparedActions: PreparedActionRow[] = [];
let localSeq = 0;

type SupabaseAdminClient = NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>;

type PreparedActionRepositoryGlobals = typeof globalThis & {
  __preparedActionRepositoryClientFactory?: (() => SupabaseAdminClient | null) | null;
};

export class PreparedActionRepositoryError extends Error {
  constructor(operation: "list" | "create") {
    super(`Prepared action repository ${operation} failed.`);
    this.name = "PreparedActionRepositoryError";
  }
}

function getSupabaseClient(): SupabaseAdminClient | null {
  const globals = globalThis as PreparedActionRepositoryGlobals;
  if (globals.__preparedActionRepositoryClientFactory) {
    return globals.__preparedActionRepositoryClientFactory();
  }
  return createOptionalSupabaseAdminClient();
}

function assertLocalFallbackAvailable(): void {
  if (!isLocalPersistenceFallbackAllowed()) {
    throw new Error(PRODUCTION_GUARD_MESSAGE);
  }
}

function cloneRow(row: PreparedActionRow): PreparedActionRow {
  return structuredClone(row);
}

/** Most-recent-first ordering for the local fallback (created_at desc, id desc). */
function byCreatedAtDesc(a: PreparedActionRow, b: PreparedActionRow): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns all prepared actions for a workspace, most-recent first. Scoped
 * strictly to the given workspace_id.
 */
export async function listPreparedActionsForWorkspace(
  workspaceId: string,
): Promise<PreparedAction[]> {
  const db = getSupabaseClient();

  if (!db) {
    assertLocalFallbackAvailable();
    return localPreparedActions
      .filter((row) => row.workspace_id === workspaceId)
      .sort(byCreatedAtDesc)
      .map((row) => mapRowToPreparedAction(cloneRow(row)));
  }

  const { data, error } = await db
    .from("prepared_actions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) {
    throw new PreparedActionRepositoryError("list");
  }
  return (data ?? []).map(mapRowToPreparedAction);
}

/**
 * Appends a prepared action for a workspace and returns the stored action.
 * Append-only: there is no update or delete path. Scoped to workspace_id and
 * stamped with the creating owner's user id.
 */
export async function createPreparedAction(
  workspaceId: string,
  userId: string,
  action: PreparedAction,
): Promise<PreparedAction> {
  const insert = mapPreparedActionToInsert(workspaceId, userId, action);
  const db = getSupabaseClient();

  if (!db) {
    assertLocalFallbackAvailable();
    localSeq += 1;
    const row: PreparedActionRow = {
      ...insert,
      // The DB assigns these; the local fallback synthesizes deterministic
      // equivalents (no clock: created_at mirrors the prepared action's time).
      id: `local-pa-${String(localSeq).padStart(6, "0")}`,
      created_at: action.createdAt,
    };
    localPreparedActions.push(cloneRow(row));
    return mapRowToPreparedAction(cloneRow(row));
  }

  const { error } = await db.from("prepared_actions").insert(insert);
  if (error) {
    throw new PreparedActionRepositoryError("create");
  }
  return action;
}

/**
 * Reports which persistence backend the repository will use right now, using
 * the exact same resolution as the read/write paths. Never writes, never lies.
 */
export function getPreparedActionPersistenceMode(): VenturePersistenceMode {
  if (getSupabaseClient()) return "supabase";
  return isLocalPersistenceFallbackAllowed() ? "local" : "unavailable";
}

/** Test-only helper to clear the in-memory fallback store. */
export function __clearPreparedActionsForTests(): void {
  localPreparedActions.length = 0;
  localSeq = 0;
}
