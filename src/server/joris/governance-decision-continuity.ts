// src/server/joris/governance-decision-continuity.ts

/**
 * Governance Decision continuity — the READ side of the governance audit trail.
 *
 * PR132 wired the write side: applying a CEO review records a Governance
 * Decision Record (see governance-decision-repository). Nothing in production
 * ever read those records back. This module closes that loop: it surfaces the
 * recent governance decision history for a workspace as a compact, read-only
 * continuity note, so when the CEO previews a new Governance Bundle Joris can
 * remind them of the decisions already rendered.
 *
 * Continuity is keyed at the WORKSPACE level, not per Work Order: Work Order ids
 * are minted per routing (`wo_..._${Date.now()}`), so a per-work-order match
 * would almost never hit across separate previews. Workspace-level history is
 * stable and is what the CEO actually wants to see.
 *
 * Safety:
 *   - Strictly read-only. No writes, no dispatch, no execution.
 *   - The decision records are PLANNING/AUDIT artifacts; they authorize nothing,
 *     and the note repeats that explicitly.
 *   - The formatter is pure. The fetch wrapper is best-effort: the underlying
 *     repository throws in production (no Supabase implementation yet), so a
 *     failure degrades to "no note" rather than breaking the preview.
 */

import type { WorkOrderGovernanceDecisionRecord } from "@/server/agents/work-order-governance-decision-contract";
import { getGovernanceDecisionsForWorkspace } from "@/server/joris/governance-decision-repository";

/** Default number of recent decisions surfaced in the continuity note. */
const DEFAULT_CONTINUITY_LIMIT = 3;

/** Human-readable French labels for each decided governance outcome. */
const OUTCOME_LABELS: Readonly<Record<string, string>> = {
  approved_to_plan: "approuvé pour planification",
  changes_requested: "modifications demandées",
  rejected: "rejeté",
  more_info_requested: "informations demandées",
  blocked_execution_request: "demande d'exécution bloquée",
};

function outcomeLabel(outcome: string): string {
  return OUTCOME_LABELS[outcome] ?? outcome;
}

/** Renders the date portion (YYYY-MM-DD) of an ISO 8601 timestamp. */
function isoDate(iso: string): string {
  return typeof iso === "string" && iso.length >= 10 ? iso.slice(0, 10) : iso;
}

// ---------------------------------------------------------------------------
// Public: formatGovernanceDecisionContinuityNote
// ---------------------------------------------------------------------------

/**
 * Formats a compact Markdown continuity note from recent governance decisions.
 *
 * Returns null when there is no prior decision (nothing to surface). The most
 * recent decision is highlighted; up to `limit` recent decisions are listed.
 * Records are expected most-recent-first (the repository's read order).
 *
 * This function is pure — it does not mutate its input and performs no I/O.
 */
export function formatGovernanceDecisionContinuityNote(
  decisions: readonly WorkOrderGovernanceDecisionRecord[],
  limit: number = DEFAULT_CONTINUITY_LIMIT,
): string | null {
  if (!Array.isArray(decisions) || decisions.length === 0) {
    return null;
  }

  const recent = decisions.slice(0, Math.max(1, limit));
  const total = decisions.length;
  const latest = recent[0];

  const lines: string[] = [
    `#### 📜 Continuité gouvernance (audit, lecture seule)`,
    `- ${total} décision(s) de gouvernance déjà enregistrée(s) dans ce workspace.`,
    `- Plus récente : **${outcomeLabel(latest.outcome)}** ` +
      `(Work Order \`${latest.workOrderId}\`, le ${isoDate(latest.decidedAt)}).`,
  ];

  if (recent.length > 1) {
    lines.push(`- Décisions récentes :`);
    for (const d of recent) {
      lines.push(`  - ${isoDate(d.decidedAt)} — ${outcomeLabel(d.outcome)} (\`${d.workOrderId}\`)`);
    }
  }

  lines.push(
    `🛑 *Rappel : ces décisions sont des artefacts de planification/audit — ` +
      `elles n'autorisent aucune exécution.*`,
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Public: buildGovernanceDecisionContinuityNote
// ---------------------------------------------------------------------------

/**
 * Best-effort continuity note for a workspace. Reads the recent governance
 * decisions and formats them. Returns null when there is no history OR when the
 * repository is unavailable (e.g. production without a Supabase implementation):
 * continuity is contextual sugar and must never break the read-only preview.
 *
 * This is the only effectful function in this module (an in-memory read in
 * development/test); it isolates the try/catch so callers stay clean.
 */
export async function buildGovernanceDecisionContinuityNote(input: {
  workspaceId: string;
  limit?: number;
}): Promise<string | null> {
  let decisions: WorkOrderGovernanceDecisionRecord[] = [];
  try {
    decisions = await getGovernanceDecisionsForWorkspace(input.workspaceId);
  } catch {
    // Repository unavailable (e.g. production guard) or a Supabase read error.
    // Continuity is contextual sugar; degrade to no note rather than break.
    return null;
  }
  return formatGovernanceDecisionContinuityNote(decisions, input.limit ?? DEFAULT_CONTINUITY_LIMIT);
}
