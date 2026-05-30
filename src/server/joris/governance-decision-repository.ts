// src/server/joris/governance-decision-repository.ts

/**
 * Governance Decision repository — durable, auditable trace of rendered
 * governance decisions.
 *
 * Persistence model (PR131): this follows the repo's existing local-fallback
 * pattern (see src/lib/server-env.ts `isLocalPersistenceFallbackAllowed`). It
 * uses an in-memory append-only store in development/test. There is NO Supabase
 * table, migration, or RLS policy here — a Supabase-backed implementation is a
 * separate, explicitly-mandated step. In production (without the local
 * fallback) the repository throws rather than silently dropping a decision, so
 * the missing Supabase implementation is loud, not silent.
 *
 * Safety:
 *   - Records are PLANNING/AUDIT artifacts; they authorize nothing.
 *   - This is NOT the action ledger. It never records executed actions, and it
 *     never books, dispatches, or writes external state.
 *   - Every stored record is validated; humanOnTheLoop and noExecutionAuthorized
 *     must hold.
 *
 * Dormant: not imported by any production code yet (wired in a later PR).
 */

import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import type {
  WorkOrderGovernanceDecisionRecord,
} from "@/server/agents/work-order-governance-decision-contract";
import { validateGovernanceDecisionRecord } from "@/server/agents/work-order-governance-decision-contract";

const PRODUCTION_GUARD_MESSAGE =
  "Supabase-backed governance decision persistence is not yet configured; " +
  "local-fallback persistence is only available outside production.";

// In-memory append-only store for local development/test (no Supabase).
const localDecisions: WorkOrderGovernanceDecisionRecord[] = [];

function assertPersistenceAvailable(): void {
  if (!isLocalPersistenceFallbackAllowed()) {
    throw new Error(PRODUCTION_GUARD_MESSAGE);
  }
}

/**
 * Persists a governance decision record. Validates the record first and refuses
 * to store an invalid one. Returns a defensive copy of the stored record.
 *
 * Throws in production (no local fallback) because no Supabase implementation
 * exists yet — a decision must never be silently dropped.
 */
export function recordGovernanceDecision(
  record: WorkOrderGovernanceDecisionRecord,
): WorkOrderGovernanceDecisionRecord {
  const validation = validateGovernanceDecisionRecord(record);
  if (!validation.valid) {
    const codes = validation.issues
      .filter((i) => i.severity === "error")
      .map((i) => i.code)
      .join(", ");
    throw new Error(`Refusing to persist an invalid governance decision record: ${codes}`);
  }

  assertPersistenceAvailable();

  const stored: WorkOrderGovernanceDecisionRecord = { ...record };
  localDecisions.push(stored);
  return { ...stored };
}

/**
 * Returns all governance decisions for a workspace, most-recent first.
 */
export function getGovernanceDecisionsForWorkspace(
  workspaceId: string,
): WorkOrderGovernanceDecisionRecord[] {
  assertPersistenceAvailable();
  return localDecisions
    .filter((r) => r.workspaceId === workspaceId)
    .map((r) => ({ ...r }))
    .reverse();
}

/**
 * Returns all governance decisions for a specific work order in a workspace,
 * most-recent first.
 */
export function getGovernanceDecisionsForWorkOrder(
  workspaceId: string,
  workOrderId: string,
): WorkOrderGovernanceDecisionRecord[] {
  assertPersistenceAvailable();
  return localDecisions
    .filter((r) => r.workspaceId === workspaceId && r.workOrderId === workOrderId)
    .map((r) => ({ ...r }))
    .reverse();
}

/**
 * Returns the most recent governance decision for a work order, or null.
 */
export function getLatestGovernanceDecision(
  workspaceId: string,
  workOrderId: string,
): WorkOrderGovernanceDecisionRecord | null {
  const matches = getGovernanceDecisionsForWorkOrder(workspaceId, workOrderId);
  return matches.length > 0 ? matches[0] : null;
}

/**
 * Test-only helper to clear the in-memory fallback store.
 */
export function __clearGovernanceDecisionsForTests(): void {
  localDecisions.length = 0;
}
