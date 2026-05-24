import {
  evaluateCandidate as defaultEvaluateCandidate,
} from "@/server/arena/roi-arena";
import type {
  ArenaCandidate,
  ArenaEvaluationContext,
  ArenaVerdict,
} from "@/server/arena/roi-arena";
import {
  createArenaVerdictStore,
  defaultArenaVerdictStore,
} from "@/server/arena/arena-verdict-store";
import type { StoredArenaVerdict } from "@/server/arena/arena-verdict-store";
import * as defaultRepository from "@/server/arena/arena-verdict-repository";

// ---------------------------------------------------------------------------
// Injected dependencies (for testability)
// ---------------------------------------------------------------------------

type EvaluateFn = (
  candidate: ArenaCandidate,
  context?: ArenaEvaluationContext,
) => ArenaVerdict;

type StoreInstance = ReturnType<typeof createArenaVerdictStore>;

type RepositoryDep = {
  recordArenaVerdict(workspaceId: string, record: StoredArenaVerdict): Promise<void>;
  getArenaVerdictByCandidateId(workspaceId: string, candidateId: string): Promise<StoredArenaVerdict | null>;
  listArenaVerdicts(workspaceId: string): Promise<StoredArenaVerdict[]>;
};

type ArenaEvaluationServiceDeps = {
  store?: StoreInstance;
  evaluateCandidate?: EvaluateFn;
  repository?: RepositoryDep | null;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Composes the ROI evaluation engine with the in-memory verdict store and
 * optional persistent repository.
 *
 * - Pure server-side. No routes, no external calls, no direct effects.
 * - All dependencies are injected — callers supply their own store, evaluate
 *   function, and repository for isolation. Defaults are provided for production.
 * - Methods are async to support the repository path.
 */
export function createArenaEvaluationService(deps: ArenaEvaluationServiceDeps = {}) {
  const store = deps.store ?? defaultArenaVerdictStore;
  const evaluate = deps.evaluateCandidate ?? defaultEvaluateCandidate;
  const repo = "repository" in deps ? deps.repository : defaultRepository;

  // ── evaluateAndStore ────────────────────────────────────────────────────

  /**
   * Evaluates a candidate, caches the verdict in memory, and persists to the
   * repository (if one is configured) using candidate.workspaceId.
   * All verdicts — including not-evaluable — are stored.
   */
  async function evaluateAndStore(
    candidate: ArenaCandidate,
    context?: ArenaEvaluationContext,
  ): Promise<StoredArenaVerdict> {
    const verdict = evaluate(candidate, context);
    const record = store.store(verdict);
    if (repo) {
      await repo.recordArenaVerdict(candidate.workspaceId, record);
    }
    return record;
  }

  // ── getVerdict ──────────────────────────────────────────────────────────

  /**
   * Returns the verdict for a candidateId.
   * When workspaceId is provided and a repository is configured, reads from
   * the repository (workspace-scoped). Otherwise reads from the in-memory store.
   */
  async function getVerdict(
    candidateId: string,
    workspaceId?: string,
  ): Promise<StoredArenaVerdict | null> {
    if (repo && workspaceId) {
      return repo.getArenaVerdictByCandidateId(workspaceId, candidateId);
    }
    return store.get(candidateId);
  }

  // ── listVerdicts ────────────────────────────────────────────────────────

  /**
   * Returns all non-expired verdicts.
   * When workspaceId is provided and a repository is configured, reads from
   * the repository (workspace-scoped). Otherwise reads from the in-memory store.
   */
  async function listVerdicts(workspaceId?: string): Promise<StoredArenaVerdict[]> {
    if (repo && workspaceId) {
      return repo.listArenaVerdicts(workspaceId);
    }
    return store.list();
  }

  // ── clearVerdicts ───────────────────────────────────────────────────────

  /**
   * Clears all verdicts from the in-memory store.
   * Has no effect on any external persistence layer.
   */
  function clearVerdicts(): void {
    store.clear();
  }

  return { evaluateAndStore, getVerdict, listVerdicts, clearVerdicts };
}

// ---------------------------------------------------------------------------
// Default service (process-scoped singleton, server-only)
// ---------------------------------------------------------------------------

// Uses defaultArenaVerdictStore for memory caching and defaultRepository for
// persistence. In test env (no Supabase), repository uses its local fallback.
// Tests must use createArenaEvaluationService() with explicit injected deps.
export const defaultArenaEvaluationService = createArenaEvaluationService();
