// src/server/joris/governance-audit-report.ts

/**
 * Governance Audit Report — ROI tier 1, PR A.
 *
 * Turns the durable governance decision trail (table governance_decisions,
 * PR135–138) into a presentable, read-only audit artifact: a structured report
 * plus a CSV export, scoped to a single workspace and an optional period.
 *
 * This module is intentionally PURE and self-contained:
 *   - It takes already-fetched decision records (the repository does the I/O).
 *   - No I/O, no writes, no dispatch, no execution, no mutation of inputs.
 *   - It authorizes nothing — a report is an audit/planning artifact, and it
 *     repeats the no-execution invariant.
 *
 * Wiring (a Joris command that fetches + emits a file) is a separate, later PR.
 * Keeping this layer pure makes it trivially testable and risk-free.
 */

import type {
  WorkOrderGovernanceDecisionRecord,
  WorkOrderGovernanceDecisionOutcome,
} from "@/server/agents/work-order-governance-decision-contract";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The five decided governance outcomes (mirrors the contract). */
const DECISION_OUTCOMES: readonly WorkOrderGovernanceDecisionOutcome[] = [
  "approved_to_plan",
  "changes_requested",
  "rejected",
  "more_info_requested",
  "blocked_execution_request",
];

export interface GovernanceAuditReportPeriod {
  /** Inclusive ISO 8601 lower bound on decidedAt. */
  start?: string;
  /** Inclusive ISO 8601 upper bound on decidedAt. */
  end?: string;
}

export interface GovernanceAuditReport {
  workspaceId: string;
  /** ISO 8601 timestamp the report was generated. */
  generatedAt: string;
  /** The period filter applied, if any. */
  period?: GovernanceAuditReportPeriod;
  /** Total decisions in the report (after any period filter). */
  totalDecisions: number;
  /** Count per outcome (every outcome present, zero-filled). */
  countsByOutcome: Record<WorkOrderGovernanceDecisionOutcome, number>;
  /** The decisions, most-recent first. */
  decisions: WorkOrderGovernanceDecisionRecord[];
  /** Always true — every decision is rendered on the loop. */
  humanOnTheLoop: true;
  /** Always true — an audit report authorizes no execution. */
  noExecutionAuthorized: true;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Most-recent-first comparator: decidedAt desc, then id desc for determinism. */
function byMostRecent(
  a: WorkOrderGovernanceDecisionRecord,
  b: WorkOrderGovernanceDecisionRecord,
): number {
  if (a.decidedAt !== b.decidedAt) return a.decidedAt < b.decidedAt ? 1 : -1;
  if (a.id !== b.id) return a.id < b.id ? 1 : -1;
  return 0;
}

function withinPeriod(decidedAt: string, period: GovernanceAuditReportPeriod): boolean {
  if (period.start !== undefined && decidedAt < period.start) return false;
  if (period.end !== undefined && decidedAt > period.end) return false;
  return true;
}

function emptyOutcomeCounts(): Record<WorkOrderGovernanceDecisionOutcome, number> {
  return {
    approved_to_plan: 0,
    changes_requested: 0,
    rejected: 0,
    more_info_requested: 0,
    blocked_execution_request: 0,
  };
}

// ---------------------------------------------------------------------------
// Public: buildGovernanceAuditReport
// ---------------------------------------------------------------------------

/**
 * Builds a workspace-scoped audit report from already-fetched decision records.
 *
 * Filters out records from other workspaces and (optionally) outside the period,
 * sorts most-recent first, and aggregates counts per outcome. Pure — it does not
 * mutate its input and performs no I/O.
 */
export function buildGovernanceAuditReport(input: {
  workspaceId: string;
  decisions: readonly WorkOrderGovernanceDecisionRecord[];
  generatedAt?: string;
  period?: GovernanceAuditReportPeriod;
}): GovernanceAuditReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const period = input.period;

  const filtered = (input.decisions ?? [])
    .filter((r) => r.workspaceId === input.workspaceId)
    .filter((r) => (period ? withinPeriod(r.decidedAt, period) : true))
    .map((r) => ({ ...r }))
    .sort(byMostRecent);

  const countsByOutcome = emptyOutcomeCounts();
  for (const r of filtered) {
    if (DECISION_OUTCOMES.includes(r.outcome)) {
      countsByOutcome[r.outcome] += 1;
    }
  }

  const report: GovernanceAuditReport = {
    workspaceId: input.workspaceId,
    generatedAt,
    totalDecisions: filtered.length,
    countsByOutcome,
    decisions: filtered,
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
  };
  if (period !== undefined) report.period = period;
  return report;
}

// ---------------------------------------------------------------------------
// Public: formatGovernanceAuditReportCsv
// ---------------------------------------------------------------------------

const CSV_COLUMNS: readonly (keyof WorkOrderGovernanceDecisionRecord | "")[] = [
  "id",
  "workspaceId",
  "workOrderId",
  "bundleId",
  "outcome",
  "sessionStatus",
  "reviewerId",
  "reviewerRole",
  "reviewId",
  "reviewDecision",
  "humanOnTheLoop",
  "noExecutionAuthorized",
  "decidedAt",
  "createdAt",
];

const CSV_HEADER = [
  "id",
  "workspace_id",
  "work_order_id",
  "bundle_id",
  "outcome",
  "session_status",
  "reviewer_id",
  "reviewer_role",
  "review_id",
  "review_decision",
  "human_on_the_loop",
  "no_execution_authorized",
  "decided_at",
  "created_at",
];

/** RFC 4180-style escaping: quote fields containing comma, quote, CR or LF. */
function csvEscape(value: unknown): string {
  if (value === undefined || value === null) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Renders the report's decisions as a CSV string (header + one row per
 * decision, most-recent first). Pure — no I/O. The caller writes the file.
 *
 * Columns are snake_case to match the governance_decisions table, so the export
 * lines up with a direct DB dump.
 */
export function formatGovernanceAuditReportCsv(report: GovernanceAuditReport): string {
  const lines: string[] = [CSV_HEADER.join(",")];
  for (const record of report.decisions) {
    const fields = record as unknown as Record<string, unknown>;
    const row = CSV_COLUMNS.map((col) => (col === "" ? "" : csvEscape(fields[col])));
    lines.push(row.join(","));
  }
  // Trailing newline so the file ends cleanly (POSIX-friendly).
  return lines.join("\n") + "\n";
}
