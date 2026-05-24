import "server-only";
import type { StoredArenaVerdict } from "@/server/arena/arena-verdict-store";
import type { ArenaVerdict } from "@/server/arena/roi-arena";
import type { ArenaVerdictRow, ArenaVerdictInsert, Json } from "@/server/db/types";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";

// ---------------------------------------------------------------------------
// Local in-memory fallback (test env / no Supabase config)
// ---------------------------------------------------------------------------

const localStore = new Map<string, StoredArenaVerdict>();

function makeId(workspaceId: string, candidateId: string): string {
  return `av_${workspaceId}_${candidateId}`;
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function mapToRow(
  id: string,
  workspaceId: string,
  record: StoredArenaVerdict,
): ArenaVerdictInsert {
  return {
    id,
    workspace_id: workspaceId,
    candidate_id: record.candidateId,
    verdict: record.verdict as unknown as Json,
    stored_at: record.storedAt,
    expires_at: record.expiresAt ?? null,
  };
}

function mapRowToStored(row: ArenaVerdictRow): StoredArenaVerdict {
  return {
    candidateId: row.candidate_id,
    verdict: row.verdict as unknown as ArenaVerdict,
    storedAt: row.stored_at,
    expiresAt: row.expires_at,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function recordArenaVerdict(
  workspaceId: string,
  record: StoredArenaVerdict,
): Promise<void> {
  const db = createOptionalSupabaseAdminClient();
  const id = makeId(workspaceId, record.candidateId);

  if (!db) {
    localStore.set(id, record);
    return;
  }

  await db
    .from("arena_verdicts")
    .upsert(mapToRow(id, workspaceId, record), { onConflict: "id" });
}

export async function getArenaVerdictByCandidateId(
  workspaceId: string,
  candidateId: string,
): Promise<StoredArenaVerdict | null> {
  const db = createOptionalSupabaseAdminClient();
  const id = makeId(workspaceId, candidateId);

  if (!db) {
    return localStore.get(id) ?? null;
  }

  const { data } = await db
    .from("arena_verdicts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  return data ? mapRowToStored(data) : null;
}

export async function listArenaVerdicts(
  workspaceId: string,
): Promise<StoredArenaVerdict[]> {
  const db = createOptionalSupabaseAdminClient();
  const prefix = `av_${workspaceId}_`;

  if (!db) {
    const results: StoredArenaVerdict[] = [];
    for (const [key, value] of localStore.entries()) {
      if (key.startsWith(prefix)) results.push(value);
    }
    return results;
  }

  const { data } = await db
    .from("arena_verdicts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("stored_at", { ascending: false });

  return (data ?? []).map(mapRowToStored);
}

export function clearLocalArenaVerdictStore(): void {
  localStore.clear();
}
