// src/server/ventures/agent-score-snapshot-repository.ts
//
// Agent score snapshot repository — durable, append-only history of agent
// operator scores (the performance-curve layer).
//
// Dual-mode, mirroring the cash-signal-intake / prepared-action repositories:
//   - Supabase service-role client when configured (table from migration 0014).
//   - In-memory local fallback in development/test.
//   - In production WITHOUT Supabase and WITHOUT local fallback: THROWS.
//
// Append-only (insert + list), workspace-scoped, owner-stamped. Derived metric
// only: it executes nothing and authorizes nothing.

import type { AgentScoreSnapshot } from "@/features/ventures/agent-score-snapshot";
import type { VenturePersistenceMode } from "@/features/ventures/venture-save-types";
import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import type { AgentScoreSnapshotRow } from "@/server/db/types";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import { mapRowToSnapshot, mapSnapshotToInsert } from "./agent-score-snapshot-row-mapping";

const PRODUCTION_GUARD_MESSAGE =
  "Agent score snapshot persistence is unavailable: Supabase is not configured and " +
  "local-fallback persistence is only available outside production.";

const localSnapshots: AgentScoreSnapshotRow[] = [];
let localSeq = 0;

type SupabaseAdminClient = NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>;

type AgentScoreSnapshotRepositoryGlobals = typeof globalThis & {
  __agentScoreSnapshotRepositoryClientFactory?: (() => SupabaseAdminClient | null) | null;
};

export class AgentScoreSnapshotRepositoryError extends Error {
  constructor(operation: "list" | "create") {
    super(`Agent score snapshot repository ${operation} failed.`);
    this.name = "AgentScoreSnapshotRepositoryError";
  }
}

function getSupabaseClient(): SupabaseAdminClient | null {
  const globals = globalThis as AgentScoreSnapshotRepositoryGlobals;
  if (globals.__agentScoreSnapshotRepositoryClientFactory) {
    return globals.__agentScoreSnapshotRepositoryClientFactory();
  }
  return createOptionalSupabaseAdminClient();
}

function assertLocalFallbackAvailable(): void {
  if (!isLocalPersistenceFallbackAllowed()) {
    throw new Error(PRODUCTION_GUARD_MESSAGE);
  }
}

function cloneRow(row: AgentScoreSnapshotRow): AgentScoreSnapshotRow {
  return structuredClone(row);
}

/** Most-recent-first ordering for the local fallback (created_at desc, id desc). */
function byCreatedAtDesc(a: AgentScoreSnapshotRow, b: AgentScoreSnapshotRow): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** All score snapshots for a workspace, most-recent first. */
export async function listAgentScoreSnapshotsForWorkspace(
  workspaceId: string,
): Promise<AgentScoreSnapshot[]> {
  const db = getSupabaseClient();

  if (!db) {
    assertLocalFallbackAvailable();
    return localSnapshots
      .filter((row) => row.workspace_id === workspaceId)
      .sort(byCreatedAtDesc)
      .map((row) => mapRowToSnapshot(cloneRow(row)));
  }

  const { data, error } = await db
    .from("agent_score_snapshots")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) {
    throw new AgentScoreSnapshotRepositoryError("list");
  }
  return (data ?? []).map(mapRowToSnapshot);
}

/** Score snapshots for one agent in a workspace, most-recent first. */
export async function listAgentScoreSnapshotsForAgent(
  workspaceId: string,
  agentId: string,
): Promise<AgentScoreSnapshot[]> {
  const db = getSupabaseClient();

  if (!db) {
    assertLocalFallbackAvailable();
    return localSnapshots
      .filter((row) => row.workspace_id === workspaceId && row.agent_id === agentId)
      .sort(byCreatedAtDesc)
      .map((row) => mapRowToSnapshot(cloneRow(row)));
  }

  const { data, error } = await db
    .from("agent_score_snapshots")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("agent_id", agentId)
    .order("scored_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) {
    throw new AgentScoreSnapshotRepositoryError("list");
  }
  return (data ?? []).map(mapRowToSnapshot);
}

/** Appends a score snapshot. Append-only; scoped + owner-stamped. */
export async function createAgentScoreSnapshot(
  workspaceId: string,
  userId: string,
  snapshot: AgentScoreSnapshot,
): Promise<AgentScoreSnapshot> {
  const insert = mapSnapshotToInsert(workspaceId, userId, snapshot);
  const db = getSupabaseClient();

  if (!db) {
    assertLocalFallbackAvailable();
    localSeq += 1;
    const row: AgentScoreSnapshotRow = {
      ...insert,
      id: `local-ass-${String(localSeq).padStart(6, "0")}`,
      created_at: snapshot.scoredAt,
    };
    localSnapshots.push(cloneRow(row));
    return mapRowToSnapshot(cloneRow(row));
  }

  const { error } = await db.from("agent_score_snapshots").insert(insert);
  if (error) {
    throw new AgentScoreSnapshotRepositoryError("create");
  }
  return snapshot;
}

/** Reports the active persistence backend, using the same resolution as I/O. */
export function getAgentScoreSnapshotPersistenceMode(): VenturePersistenceMode {
  if (getSupabaseClient()) return "supabase";
  return isLocalPersistenceFallbackAllowed() ? "local" : "unavailable";
}

/** Test-only helper to clear the in-memory fallback store. */
export function __clearAgentScoreSnapshotsForTests(): void {
  localSnapshots.length = 0;
  localSeq = 0;
}
