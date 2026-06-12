import type { ArenaCandidate, ArenaCandidateKind, ArenaVerdict } from "@/server/arena/roi-arena";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ArenaVerdictStoreOptions = {
  ttlMs?: number;
  now?: () => number;
  maxEntries?: number;
};

/**
 * Attribution snapshot of the candidate at evaluation time.
 * Identity fields only — financial figures already live in the verdict, and
 * snapshotting them twice would invite divergence.
 */
export type ArenaCandidateAttribution = {
  kind: ArenaCandidateKind;
  title?: string;
  agentId?: string;
  skillId?: string;
  missionId?: string;
};

export type StoredArenaVerdict = {
  verdict: ArenaVerdict;
  candidateId: string;
  storedAt: string;
  expiresAt: string | null;
  /** Absent on records stored before attribution existed. */
  candidate?: ArenaCandidateAttribution;
};

/** Extracts the attribution snapshot from a full candidate. */
export function snapshotCandidateAttribution(
  candidate: ArenaCandidate,
): ArenaCandidateAttribution {
  const snapshot: ArenaCandidateAttribution = { kind: candidate.kind };
  if (candidate.title) snapshot.title = candidate.title;
  if (candidate.agentId) snapshot.agentId = candidate.agentId;
  if (candidate.skillId) snapshot.skillId = candidate.skillId;
  if (candidate.missionId) snapshot.missionId = candidate.missionId;
  return snapshot;
}

// ---------------------------------------------------------------------------
// Internal record shape (adds a numeric timestamp for eviction ordering)
// ---------------------------------------------------------------------------

type InternalEntry = {
  stored: StoredArenaVerdict;
  storedAtMs: number;
  seq: number; // monotonic insertion counter for stable sort within same millisecond
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an isolated, in-memory verdict store.
 *
 * - No DB writes, no external calls, no singleton state.
 * - Each call returns an independent store, making tests composable.
 * - TTL and maxEntries are optional. Absent = unlimited / no expiry.
 * - maxEntries eviction: oldest entry by storedAt is removed first.
 */
export function createArenaVerdictStore(options: ArenaVerdictStoreOptions = {}) {
  const { ttlMs, now = Date.now, maxEntries } = options;

  // keyed by candidateId
  const entries = new Map<string, InternalEntry>();
  let seq = 0;

  // ── helpers ──────────────────────────────────────────────────────────────

  function isExpired(entry: InternalEntry): boolean {
    if (ttlMs === undefined) return false;
    return now() >= entry.storedAtMs + ttlMs;
  }

  function purgeExpired(): void {
    for (const [id, entry] of entries) {
      if (isExpired(entry)) entries.delete(id);
    }
  }

  function evictOldestIfNeeded(): void {
    if (maxEntries === undefined || entries.size < maxEntries) return;
    // find the entry with the smallest storedAtMs
    let oldestId: string | null = null;
    let oldestTs = Infinity;
    for (const [id, entry] of entries) {
      if (entry.storedAtMs < oldestTs) {
        oldestTs = entry.storedAtMs;
        oldestId = id;
      }
    }
    if (oldestId !== null) entries.delete(oldestId);
  }

  // ── public API ────────────────────────────────────────────────────────────

  function store(
    verdict: ArenaVerdict,
    candidate?: ArenaCandidateAttribution,
  ): StoredArenaVerdict {
    if (!verdict.candidateId || typeof verdict.candidateId !== "string") {
      throw new Error("store: verdict.candidateId must be a non-empty string.");
    }

    const nowMs = now();
    const storedAt = new Date(nowMs).toISOString();
    const expiresAt =
      ttlMs !== undefined ? new Date(nowMs + ttlMs).toISOString() : null;

    const stored: StoredArenaVerdict = {
      verdict: { ...verdict },
      candidateId: verdict.candidateId,
      storedAt,
      expiresAt,
      ...(candidate ? { candidate: { ...candidate } } : {}),
    };

    // Evict oldest before inserting a new candidateId (overwrite is fine).
    if (!entries.has(verdict.candidateId)) {
      evictOldestIfNeeded();
    }

    entries.set(verdict.candidateId, { stored, storedAtMs: nowMs, seq: seq++ });
    return stored;
  }

  function get(candidateId: string): StoredArenaVerdict | null {
    const entry = entries.get(candidateId);
    if (!entry) return null;
    if (isExpired(entry)) {
      entries.delete(candidateId);
      return null;
    }
    return entry.stored;
  }

  function list(): StoredArenaVerdict[] {
    purgeExpired();
    // Return in descending storedAt order (most recent first).
    return [...entries.values()]
      .sort((a, b) => b.storedAtMs - a.storedAtMs || b.seq - a.seq)
      .map((e) => e.stored);
  }

  function clear(): void {
    entries.clear();
  }

  function size(): number {
    purgeExpired();
    return entries.size;
  }

  return { store, get, list, clear, size };
}

// ---------------------------------------------------------------------------
// Module-level default store (process-scoped singleton, optional convenience)
// ---------------------------------------------------------------------------

// Exported for use by server-side callers that don't need isolation.
// Tests should use createArenaVerdictStore() directly.
export const defaultArenaVerdictStore = createArenaVerdictStore();
