// src/server/joris/governance-decision-repository.ts

/**
 * Governance Decision repository — durable, auditable trace of rendered
 * governance decisions.
 *
 * Persistence model (PR136): dual-mode, mirroring the repo's arena-verdict
 * repository.
 *   - When Supabase is configured, decisions are persisted to the
 *     public.governance_decisions table (migration 0008) via the service-role
 *     admin client. RLS blocks anon/authenticated; the service role bypasses it.
 *   - Otherwise, in development/test, an in-memory append-only store is used
 *     (the local fallback, see src/lib/server-env.ts).
 *   - In production WITHOUT Supabase configured and WITHOUT the local fallback,
 *     the repository THROWS rather than silently dropping a decision — the
 *     missing persistence stays loud, not silent.
 *
 * Safety:
 *   - Records are PLANNING/AUDIT artifacts; they authorize nothing.
 *   - This is NOT the action ledger. It never records executed actions, and it
 *     never books, dispatches, or writes external state beyond this audit table.
 *   - Every stored record is validated; humanOnTheLoop and noExecutionAuthorized
 *     must hold (also enforced by DB CHECK constraints in migration 0008).
 *   - Supabase failures surface as a sanitized GovernanceDecisionRepositoryError
 *     that never leaks driver internals.
 */

import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import type {
  WorkOrderGovernanceDecisionRecord,
  WorkOrderGovernanceDecisionOutcome,
} from "@/server/agents/work-order-governance-decision-contract";
import { validateGovernanceDecisionRecord } from "@/server/agents/work-order-governance-decision-contract";
import type { GovernanceDecisionInsert, GovernanceDecisionRow } from "@/server/db/types";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";

const PRODUCTION_GUARD_MESSAGE =
  "Governance decision persistence is unavailable: Supabase is not configured " +
  "and local-fallback persistence is only available outside production.";

// In-memory append-only store for local development/test (no Supabase).
const localDecisions: WorkOrderGovernanceDecisionRecord[] = [];

type SupabaseAdminClient = NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>;

type GovernanceDecisionRepositoryGlobals = typeof globalThis & {
  __governanceDecisionRepositoryClientFactory?: (() => SupabaseAdminClient | null) | null;
};

export class GovernanceDecisionRepositoryError extends Error {
  constructor(operation: "record" | "list") {
    super(`Governance decision repository ${operation} failed.`);
    this.name = "GovernanceDecisionRepositoryError";
  }
}

/**
 * Resolves the Supabase admin client, or null when Supabase is not configured.
 * A test-only global factory may override resolution.
 */
function getSupabaseClient(): SupabaseAdminClient | null {
  const globals = globalThis as GovernanceDecisionRepositoryGlobals;
  if (globals.__governanceDecisionRepositoryClientFactory) {
    return globals.__governanceDecisionRepositoryClientFactory();
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

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function mapRecordToRow(record: WorkOrderGovernanceDecisionRecord): GovernanceDecisionInsert {
  return {
    id: record.id,
    workspace_id: record.workspaceId,
    work_order_id: record.workOrderId,
    bundle_id: record.bundleId,
    outcome: record.outcome,
    session_status: record.sessionStatus,
    review_id: record.reviewId ?? null,
    review_decision: record.reviewDecision ?? null,
    reviewer_id: record.reviewerId,
    reviewer_role: record.reviewerRole,
    human_on_the_loop: true,
    no_execution_authorized: true,
    decided_at: record.decidedAt,
    created_at: record.createdAt,
  };
}

function mapRowToRecord(row: GovernanceDecisionRow): WorkOrderGovernanceDecisionRecord {
  const record: WorkOrderGovernanceDecisionRecord = {
    id: row.id,
    workspaceId: row.workspace_id,
    workOrderId: row.work_order_id,
    bundleId: row.bundle_id,
    outcome: row.outcome as WorkOrderGovernanceDecisionOutcome,
    sessionStatus: row.session_status,
    reviewerId: row.reviewer_id,
    reviewerRole: row.reviewer_role,
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
  };
  if (row.review_id !== null) record.reviewId = row.review_id;
  if (row.review_decision !== null) record.reviewDecision = row.review_decision;
  return record;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persists a governance decision record. Validates the record first and refuses
 * to store an invalid one. Returns a defensive copy of the stored record.
 *
 * Throws GovernanceDecisionRepositoryError on a Supabase failure, and throws the
 * loud production guard when no persistence backend is available — a decision
 * must never be silently dropped.
 */
export async function recordGovernanceDecision(
  record: WorkOrderGovernanceDecisionRecord,
): Promise<WorkOrderGovernanceDecisionRecord> {
  const validation = validateGovernanceDecisionRecord(record);
  if (!validation.valid) {
    const codes = validation.issues
      .filter((i) => i.severity === "error")
      .map((i) => i.code)
      .join(", ");
    throw new Error(`Refusing to persist an invalid governance decision record: ${codes}`);
  }

  const db = getSupabaseClient();

  if (!db) {
    assertLocalFallbackAvailable();
    const stored: WorkOrderGovernanceDecisionRecord = { ...record };
    localDecisions.push(stored);
    return { ...stored };
  }

  const { error } = await db.from("governance_decisions").insert(mapRecordToRow(record));
  if (error) {
    throw new GovernanceDecisionRepositoryError("record");
  }
  return { ...record };
}

/** Options for the read paths. `limit` bounds the number of rows returned. */
export interface GovernanceDecisionReadOptions {
  /** Max rows to return, most-recent first. Omit for no bound. Values < 1 are ignored. */
  limit?: number;
}

/** Normalizes a limit option: a positive integer, or undefined for "no bound". */
function normalizeLimit(limit: number | undefined): number | undefined {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit < 1) return undefined;
  return Math.floor(limit);
}

/** Applies a bound to an already-most-recent-first array (local fallback). */
function applyLocalLimit<T>(rows: T[], limit: number | undefined): T[] {
  return limit === undefined ? rows : rows.slice(0, limit);
}

/**
 * Returns governance decisions for a workspace, most-recent first. Pass
 * `{ limit }` to bound the result — the store is durable and append-only, so
 * unbounded reads grow without limit; callers that only need recent history
 * (e.g. the continuity note) should always bound.
 */
export async function getGovernanceDecisionsForWorkspace(
  workspaceId: string,
  options: GovernanceDecisionReadOptions = {},
): Promise<WorkOrderGovernanceDecisionRecord[]> {
  const limit = normalizeLimit(options.limit);
  const db = getSupabaseClient();

  if (!db) {
    assertLocalFallbackAvailable();
    const rows = localDecisions
      .filter((r) => r.workspaceId === workspaceId)
      .map((r) => ({ ...r }))
      .reverse();
    return applyLocalLimit(rows, limit);
  }

  let query = db
    .from("governance_decisions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (limit !== undefined) query = query.limit(limit);

  const { data, error } = await query;
  if (error) {
    throw new GovernanceDecisionRepositoryError("list");
  }
  return (data ?? []).map(mapRowToRecord);
}

/**
 * Returns governance decisions for a specific work order in a workspace,
 * most-recent first. Pass `{ limit }` to bound the result.
 */
export async function getGovernanceDecisionsForWorkOrder(
  workspaceId: string,
  workOrderId: string,
  options: GovernanceDecisionReadOptions = {},
): Promise<WorkOrderGovernanceDecisionRecord[]> {
  const limit = normalizeLimit(options.limit);
  const db = getSupabaseClient();

  if (!db) {
    assertLocalFallbackAvailable();
    const rows = localDecisions
      .filter((r) => r.workspaceId === workspaceId && r.workOrderId === workOrderId)
      .map((r) => ({ ...r }))
      .reverse();
    return applyLocalLimit(rows, limit);
  }

  let query = db
    .from("governance_decisions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("work_order_id", workOrderId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (limit !== undefined) query = query.limit(limit);

  const { data, error } = await query;
  if (error) {
    throw new GovernanceDecisionRepositoryError("list");
  }
  return (data ?? []).map(mapRowToRecord);
}

/**
 * Returns the most recent governance decision for a work order, or null.
 * Bounds the read to a single row.
 */
export async function getLatestGovernanceDecision(
  workspaceId: string,
  workOrderId: string,
): Promise<WorkOrderGovernanceDecisionRecord | null> {
  const matches = await getGovernanceDecisionsForWorkOrder(workspaceId, workOrderId, { limit: 1 });
  return matches.length > 0 ? matches[0] : null;
}

/**
 * Test-only helper to clear the in-memory fallback store.
 */
export function __clearGovernanceDecisionsForTests(): void {
  localDecisions.length = 0;
}
