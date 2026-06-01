// src/server/ventures/venture-repository.ts

/**
 * Venture repository — durable backing store for Venture Engine cards.
 *
 * Persistence model (PR148): dual-mode, mirroring the repo's governance-decision
 * and arena-verdict repositories.
 *   - When Supabase is configured, ventures are persisted to the
 *     public.ventures table (migration 0009) via the service-role admin client.
 *     RLS blocks anon/authenticated; the service role bypasses it.
 *   - Otherwise, in development/test, an in-memory store is used (the local
 *     fallback, see src/lib/server-env.ts).
 *   - In production WITHOUT Supabase configured and WITHOUT the local fallback,
 *     the repository THROWS rather than silently dropping a venture — the
 *     missing persistence stays loud, not silent.
 *
 * Scope & safety:
 *   - Every read and write is scoped by workspace_id. There is no cross-workspace
 *     read or write path.
 *   - Ventures are PLANNING/PORTFOLIO artifacts; they authorize nothing. This is
 *     NOT the action ledger and it never executes, books, or dispatches anything.
 *   - Rows are validated on the way in and out (see venture-row-mapping.ts); a
 *     malformed row is rejected rather than silently accepted.
 *   - Supabase failures surface as a sanitized VentureRepositoryError that never
 *     leaks driver internals.
 *
 * This PR adds the foundation only. No UI, endpoint, or server action calls
 * these functions yet.
 */

import type { VentureCard } from "@/features/ventures/types";
import type { VenturePersistenceMode } from "@/features/ventures/venture-save-types";
import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import type { VentureRow } from "@/server/db/types";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import { mapRowToVentureCard, mapVentureCardToRow } from "./venture-row-mapping";

const PRODUCTION_GUARD_MESSAGE =
  "Venture persistence is unavailable: Supabase is not configured and " +
  "local-fallback persistence is only available outside production.";

// In-memory store for local development/test (no Supabase). Holds full rows so
// the local and Supabase paths share the exact same mapping.
const localVentures: VentureRow[] = [];

type SupabaseAdminClient = NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>;

type VentureRepositoryGlobals = typeof globalThis & {
  __ventureRepositoryClientFactory?: (() => SupabaseAdminClient | null) | null;
};

export class VentureRepositoryError extends Error {
  constructor(operation: "list" | "get" | "create" | "update") {
    super(`Venture repository ${operation} failed.`);
    this.name = "VentureRepositoryError";
  }
}

/**
 * Resolves the Supabase admin client, or null when Supabase is not configured.
 * A test-only global factory may override resolution.
 */
function getSupabaseClient(): SupabaseAdminClient | null {
  const globals = globalThis as VentureRepositoryGlobals;
  if (globals.__ventureRepositoryClientFactory) {
    return globals.__ventureRepositoryClientFactory();
  }
  return createOptionalSupabaseAdminClient();
}

/**
 * Throws the loud production guard when neither Supabase nor the local fallback
 * is available. Callers invoke this only on the no-client path.
 */
function assertLocalFallbackAvailable(): void {
  if (!isLocalPersistenceFallbackAllowed()) {
    throw new Error(PRODUCTION_GUARD_MESSAGE);
  }
}

function cloneRow(row: VentureRow): VentureRow {
  return structuredClone(row);
}

/** Most-recent-first ordering for the local fallback (updated_at desc, id desc). */
function byUpdatedAtDesc(a: VentureRow, b: VentureRow): number {
  if (a.updated_at !== b.updated_at) return a.updated_at < b.updated_at ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns all ventures for a workspace, most-recent first. Scoped strictly to
 * the given workspace_id.
 */
export async function listVenturesForWorkspace(workspaceId: string): Promise<VentureCard[]> {
  const db = getSupabaseClient();

  if (!db) {
    assertLocalFallbackAvailable();
    return localVentures
      .filter((row) => row.workspace_id === workspaceId)
      .sort(byUpdatedAtDesc)
      .map((row) => mapRowToVentureCard(cloneRow(row)));
  }

  const { data, error } = await db
    .from("ventures")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) {
    throw new VentureRepositoryError("list");
  }
  return (data ?? []).map(mapRowToVentureCard);
}

/**
 * Returns a single venture by id within a workspace, or null if absent. Scoped
 * strictly to the given workspace_id — a venture from another workspace is never
 * returned.
 */
export async function getVentureById(
  workspaceId: string,
  ventureId: string,
): Promise<VentureCard | null> {
  const db = getSupabaseClient();

  if (!db) {
    assertLocalFallbackAvailable();
    const row = localVentures.find(
      (r) => r.workspace_id === workspaceId && r.id === ventureId,
    );
    return row ? mapRowToVentureCard(cloneRow(row)) : null;
  }

  const { data, error } = await db
    .from("ventures")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", ventureId)
    .limit(1);
  if (error) {
    throw new VentureRepositoryError("get");
  }
  const rows = data ?? [];
  return rows.length > 0 ? mapRowToVentureCard(rows[0]) : null;
}

/**
 * Persists a new venture for a workspace and returns the stored card. The card's
 * own id and timestamps are used as-is. Scoped to the given workspace_id.
 */
export async function createVenture(
  workspaceId: string,
  venture: VentureCard,
): Promise<VentureCard> {
  const row = mapVentureCardToRow(workspaceId, venture);
  const db = getSupabaseClient();

  if (!db) {
    assertLocalFallbackAvailable();
    localVentures.push(cloneRow(row));
    return mapRowToVentureCard(cloneRow(row));
  }

  const { error } = await db.from("ventures").insert(row);
  if (error) {
    throw new VentureRepositoryError("create");
  }
  return mapRowToVentureCard(row);
}

/**
 * Updates an existing venture within a workspace and returns the stored card.
 * Scoped strictly to the given workspace_id; an unknown id in this workspace is
 * a failure (a venture from another workspace is never reachable).
 */
export async function updateVenture(
  workspaceId: string,
  venture: VentureCard,
): Promise<VentureCard> {
  const row = mapVentureCardToRow(workspaceId, venture);
  const db = getSupabaseClient();

  if (!db) {
    assertLocalFallbackAvailable();
    const index = localVentures.findIndex(
      (r) => r.workspace_id === workspaceId && r.id === row.id,
    );
    if (index === -1) {
      throw new VentureRepositoryError("update");
    }
    localVentures[index] = cloneRow(row);
    return mapRowToVentureCard(cloneRow(row));
  }

  const { error } = await db
    .from("ventures")
    .update(row)
    .eq("workspace_id", workspaceId)
    .eq("id", row.id);
  if (error) {
    throw new VentureRepositoryError("update");
  }
  return mapRowToVentureCard(row);
}

/**
 * Reports which persistence backend the repository will use right now, using the
 * exact same resolution as the read/write paths above. This never writes and
 * never lies: callers use it to label storage status honestly (mirrors the
 * action-ledger reader's `source`). Returns "unavailable" only in the
 * loud-production case where a write would throw.
 */
export function getVenturePersistenceMode(): VenturePersistenceMode {
  if (getSupabaseClient()) return "supabase";
  return isLocalPersistenceFallbackAllowed() ? "local" : "unavailable";
}

/** Test-only helper to clear the in-memory fallback store. */
export function __clearVenturesForTests(): void {
  localVentures.length = 0;
}
