import "server-only";
import type {
  ArenaCandidateAttribution,
  StoredArenaVerdict,
} from "@/server/arena/arena-verdict-store";
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

type SupabaseAdminClient = NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>;

type ArenaVerdictRepositoryGlobals = typeof globalThis & {
  __arenaVerdictRepositoryClientFactory?: (() => SupabaseAdminClient | null) | null;
};

export class ArenaVerdictRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArenaVerdictRepositoryError";
  }
}

function getSupabaseClient(): SupabaseAdminClient | null {
  const globals = globalThis as ArenaVerdictRepositoryGlobals;
  if (globals.__arenaVerdictRepositoryClientFactory) {
    return globals.__arenaVerdictRepositoryClientFactory();
  }
  return createOptionalSupabaseAdminClient();
}

function toRepositoryError(operation: "record" | "get" | "list"): ArenaVerdictRepositoryError {
  return new ArenaVerdictRepositoryError(`Arena verdict repository ${operation} failed.`);
}

// ---------------------------------------------------------------------------
// Verdict column payload (no schema change — attribution rides in the Json)
// ---------------------------------------------------------------------------
// The arena_verdicts table has a single `verdict Json` column. Records with
// candidate attribution are wrapped in a versioned envelope; legacy rows hold
// the raw verdict object. Both shapes are readable forever.

const VERDICT_ENVELOPE_VERSION = 2;

type VerdictEnvelope = {
  __v: typeof VERDICT_ENVELOPE_VERSION;
  verdict: ArenaVerdict;
  candidate?: ArenaCandidateAttribution;
};

/** Packs a stored record into the Json column payload. Pure — exported for tests. */
export function packVerdictPayload(record: StoredArenaVerdict): Json {
  if (!record.candidate) {
    return record.verdict as unknown as Json;
  }
  const envelope: VerdictEnvelope = {
    __v: VERDICT_ENVELOPE_VERSION,
    verdict: record.verdict,
    candidate: record.candidate,
  };
  return envelope as unknown as Json;
}

/** Unpacks the Json column payload, accepting both envelope and legacy raw shapes. Pure — exported for tests. */
export function unpackVerdictPayload(json: Json): {
  verdict: ArenaVerdict;
  candidate?: ArenaCandidateAttribution;
} {
  if (
    json !== null &&
    typeof json === "object" &&
    !Array.isArray(json) &&
    (json as Record<string, unknown>).__v === VERDICT_ENVELOPE_VERSION
  ) {
    const envelope = json as unknown as VerdictEnvelope;
    return { verdict: envelope.verdict, candidate: envelope.candidate };
  }
  return { verdict: json as unknown as ArenaVerdict };
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
    verdict: packVerdictPayload(record),
    stored_at: record.storedAt,
    expires_at: record.expiresAt ?? null,
  };
}

function mapRowToStored(row: ArenaVerdictRow): StoredArenaVerdict {
  const { verdict, candidate } = unpackVerdictPayload(row.verdict);
  return {
    candidateId: row.candidate_id,
    verdict,
    storedAt: row.stored_at,
    expiresAt: row.expires_at,
    ...(candidate ? { candidate } : {}),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function recordArenaVerdict(
  workspaceId: string,
  record: StoredArenaVerdict,
): Promise<void> {
  const db = getSupabaseClient();
  const id = makeId(workspaceId, record.candidateId);

  if (!db) {
    localStore.set(id, record);
    return;
  }

  const { error } = await db
    .from("arena_verdicts")
    .upsert(mapToRow(id, workspaceId, record), { onConflict: "workspace_id,candidate_id" });

  if (error) {
    throw toRepositoryError("record");
  }
}

export async function getArenaVerdictByCandidateId(
  workspaceId: string,
  candidateId: string,
): Promise<StoredArenaVerdict | null> {
  const db = getSupabaseClient();
  const id = makeId(workspaceId, candidateId);

  if (!db) {
    return localStore.get(id) ?? null;
  }

  const { data, error } = await db
    .from("arena_verdicts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("candidate_id", candidateId)
    .maybeSingle();

  if (error) {
    throw toRepositoryError("get");
  }

  return data ? mapRowToStored(data) : null;
}

export async function listArenaVerdicts(
  workspaceId: string,
): Promise<StoredArenaVerdict[]> {
  const db = getSupabaseClient();
  const prefix = `av_${workspaceId}_`;

  if (!db) {
    const results: StoredArenaVerdict[] = [];
    for (const [key, value] of localStore.entries()) {
      if (key.startsWith(prefix)) results.push(value);
    }
    return results;
  }

  const { data, error } = await db
    .from("arena_verdicts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("stored_at", { ascending: false });

  if (error) {
    throw toRepositoryError("list");
  }

  return (data ?? []).map(mapRowToStored);
}

export function clearLocalArenaVerdictStore(): void {
  localStore.clear();
}
