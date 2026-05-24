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

// ---------------------------------------------------------------------------
// Injected dependencies (for testability)
// ---------------------------------------------------------------------------

type EvaluateFn = (
  candidate: ArenaCandidate,
  context?: ArenaEvaluationContext,
) => ArenaVerdict;

type StoreInstance = ReturnType<typeof createArenaVerdictStore>;

type ArenaEvaluationServiceDeps = {
  store?: StoreInstance;
  evaluateCandidate?: EvaluateFn;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Composes the ROI evaluation engine with the in-memory verdict store.
 *
 * - Pure server-side. No DB writes, no routes, no external calls, no effects.
 * - All dependencies are injected — callers supply their own store and
 *   evaluate function for isolation. Defaults are provided for production use.
 * - The service never recalculates scoring itself and never modifies verdicts.
 */
export function createArenaEvaluationService(deps: ArenaEvaluationServiceDeps = {}) {
  const store = deps.store ?? defaultArenaVerdictStore;
  const evaluate = deps.evaluateCandidate ?? defaultEvaluateCandidate;

  // ── evaluateAndStore ────────────────────────────────────────────────────

  /**
   * Evaluates a candidate and stores the resulting verdict.
   * Returns the StoredArenaVerdict record (includes storedAt / expiresAt).
   * All verdicts — including not-evaluable — are stored.
   */
  function evaluateAndStore(
    candidate: ArenaCandidate,
    context?: ArenaEvaluationContext,
  ): StoredArenaVerdict {
    const verdict = evaluate(candidate, context);
    return store.store(verdict);
  }

  // ── getVerdict ──────────────────────────────────────────────────────────

  /**
   * Returns the stored verdict for a candidateId, or null if absent / expired.
   */
  function getVerdict(candidateId: string): StoredArenaVerdict | null {
    return store.get(candidateId);
  }

  // ── listVerdicts ────────────────────────────────────────────────────────

  /**
   * Returns all non-expired stored verdicts, most recent first.
   */
  function listVerdicts(): StoredArenaVerdict[] {
    return store.list();
  }

  // ── clearVerdicts ───────────────────────────────────────────────────────

  /**
   * Clears all verdicts from the in-memory store.
   * Has no effect on any external system.
   */
  function clearVerdicts(): void {
    store.clear();
  }

  return { evaluateAndStore, getVerdict, listVerdicts, clearVerdicts };
}

// ---------------------------------------------------------------------------
// Default service (process-scoped singleton, server-only)
// ---------------------------------------------------------------------------

// Uses defaultArenaVerdictStore — ephemeral, cleared on restart.
// Tests must use createArenaEvaluationService() with an injected store.
export const defaultArenaEvaluationService = createArenaEvaluationService();
