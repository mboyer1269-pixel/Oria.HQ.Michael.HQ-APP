// src/server/ventures/cash-signal-intake-repository.ts
//
// Cash signal intake repository — durable, auditable backing store for captured
// cash signals (the proof half of the vertical cash loop).
//
// Persistence model: dual-mode, mirroring the venture / governance-decision
// repositories.
//   - When Supabase is configured, intakes are persisted to the
//     public.cash_signal_intakes table (migration 0012) via the service-role
//     admin client. RLS blocks anon/authenticated; the service role bypasses it.
//   - Otherwise, in development/test, an in-memory store is used (the local
//     fallback, see src/lib/server-env.ts).
//   - In production WITHOUT Supabase and WITHOUT the local fallback, the
//     repository THROWS rather than silently dropping a captured proof.
//
// Scope & safety:
//   - This is an APPEND-ONLY log: insert + list only. No update, no delete.
//   - Every read and write is scoped by workspace_id; there is no cross-workspace
//     path. Each row is also stamped with the capturing owner's user id.
//   - The accounting invariant (a positive amount requires a verified financial
//     signal) is enforced by the DB CHECK and again in the pure mapping, so the
//     local path is held to the identical standard.
//   - It NEVER executes, sends, charges, contacts, or dispatches anything.
//   - Supabase failures surface as a sanitized error that never leaks internals.

import type { CashSignalIntake } from "@/features/ventures/cash-signal-intake";
import type { VenturePersistenceMode } from "@/features/ventures/venture-save-types";
import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import type { CashSignalIntakeRow } from "@/server/db/types";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import { mapIntakeToInsert, mapRowToIntake } from "./cash-signal-intake-row-mapping";

const PRODUCTION_GUARD_MESSAGE =
  "Cash signal intake persistence is unavailable: Supabase is not configured and " +
  "local-fallback persistence is only available outside production.";

// In-memory store for local development/test (no Supabase). Holds full rows so
// the local and Supabase paths share the exact same mapping.
const localIntakes: CashSignalIntakeRow[] = [];
let localSeq = 0;

type SupabaseAdminClient = NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>;

type CashSignalIntakeRepositoryGlobals = typeof globalThis & {
  __cashSignalIntakeRepositoryClientFactory?: (() => SupabaseAdminClient | null) | null;
};

export class CashSignalIntakeRepositoryError extends Error {
  constructor(operation: "list" | "create") {
    super(`Cash signal intake repository ${operation} failed.`);
    this.name = "CashSignalIntakeRepositoryError";
  }
}

function getSupabaseClient(): SupabaseAdminClient | null {
  const globals = globalThis as CashSignalIntakeRepositoryGlobals;
  if (globals.__cashSignalIntakeRepositoryClientFactory) {
    return globals.__cashSignalIntakeRepositoryClientFactory();
  }
  return createOptionalSupabaseAdminClient();
}

function assertLocalFallbackAvailable(): void {
  if (!isLocalPersistenceFallbackAllowed()) {
    throw new Error(PRODUCTION_GUARD_MESSAGE);
  }
}

function cloneRow(row: CashSignalIntakeRow): CashSignalIntakeRow {
  return structuredClone(row);
}

/** Most-recent-first ordering for the local fallback (created_at desc, id desc). */
function byCreatedAtDesc(a: CashSignalIntakeRow, b: CashSignalIntakeRow): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns all captured cash signals for a workspace, most-recent first. Scoped
 * strictly to the given workspace_id.
 */
export async function listCashSignalIntakesForWorkspace(
  workspaceId: string,
): Promise<CashSignalIntake[]> {
  const db = getSupabaseClient();

  if (!db) {
    assertLocalFallbackAvailable();
    return localIntakes
      .filter((row) => row.workspace_id === workspaceId)
      .sort(byCreatedAtDesc)
      .map((row) => mapRowToIntake(cloneRow(row)));
  }

  const { data, error } = await db
    .from("cash_signal_intakes")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) {
    throw new CashSignalIntakeRepositoryError("list");
  }
  return (data ?? []).map(mapRowToIntake);
}

/**
 * Appends a captured cash signal for a workspace and returns the stored intake.
 * Append-only: there is no update or delete path. Scoped to workspace_id and
 * stamped with the capturing owner's user id.
 */
export async function createCashSignalIntake(
  workspaceId: string,
  userId: string,
  intake: CashSignalIntake,
): Promise<CashSignalIntake> {
  const insert = mapIntakeToInsert(workspaceId, userId, intake);
  const db = getSupabaseClient();

  if (!db) {
    assertLocalFallbackAvailable();
    localSeq += 1;
    const row: CashSignalIntakeRow = {
      ...insert,
      // The DB assigns these; the local fallback synthesizes deterministic
      // equivalents (no clock: created_at mirrors the capture time).
      id: `local-csi-${String(localSeq).padStart(6, "0")}`,
      created_at: insert.captured_at,
    };
    localIntakes.push(cloneRow(row));
    return mapRowToIntake(cloneRow(row));
  }

  const { error } = await db.from("cash_signal_intakes").insert(insert);
  if (error) {
    throw new CashSignalIntakeRepositoryError("create");
  }
  return intake;
}

/**
 * Reports which persistence backend the repository will use right now, using
 * the exact same resolution as the read/write paths. Never writes, never lies.
 */
export function getCashSignalIntakePersistenceMode(): VenturePersistenceMode {
  if (getSupabaseClient()) return "supabase";
  return isLocalPersistenceFallbackAllowed() ? "local" : "unavailable";
}

/** Test-only helper to clear the in-memory fallback store. */
export function __clearCashSignalIntakesForTests(): void {
  localIntakes.length = 0;
  localSeq = 0;
}
