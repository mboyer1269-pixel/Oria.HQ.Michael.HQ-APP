/**
 * AgentOutcome -- ROI measurement contract for agent skill executions.
 *
 * An AgentOutcome is written AFTER an agent action completes and evaluated
 * by the CEO over time. It answers: "did this agent action produce revenue,
 * convert a lead, or generate noise?"
 *
 * Aligned with OpenTelemetry session-level evaluation: each row is a
 * session-level trace of a single agent skill execution and its business result.
 *
 * This is READ/WRITE by the CEO. It is NEVER used to authorize execution.
 */

export type AgentOutcomeStatus =
  | "pending"       // not yet evaluated by CEO
  | "converted"     // led to a conversion or new client
  | "revenue"       // directly attributed revenue
  | "published"     // content published, measuring later
  | "no_show"       // prepared but never used
  | "ignored"       // CEO reviewed and discarded
  | "failed";       // action errored or produced unusable output

export type AgentOutcome = {
  id: string;
  workspaceId: string;
  createdByUserId: string;

  // Trace fields
  agentId: string;
  skillId: string;
  ventureId?: string;
  actionRef?: string;   // ledger entry id, if applicable

  // Timeline
  proposedAt: string;   // ISO8601 -- when the agent proposed the action
  executedAt?: string;  // ISO8601 -- when it was executed/dispatched

  // Outcome (filled by CEO)
  outcome: AgentOutcomeStatus;
  revenueCad: number;   // attributed revenue in CAD, 0 if none
  notes?: string;

  // Safety invariant
  noExecutionAuthorized: true;

  createdAt: string;
};

/** Input to create a new AgentOutcome record. */
export type CreateAgentOutcomeInput = {
  workspaceId: string;
  createdByUserId: string;
  agentId: string;
  skillId: string;
  ventureId?: string;
  actionRef?: string;
  proposedAt: string;
  executedAt?: string;
  outcome?: AgentOutcomeStatus;   // defaults to "pending"
  revenueCad?: number;            // defaults to 0
  notes?: string;
};

/** Input to update an outcome (CEO evaluates the result). */
export type UpdateAgentOutcomeInput = {
  id: string;
  outcome: AgentOutcomeStatus;
  revenueCad?: number;
  notes?: string;
  executedAt?: string;
};

/**
 * Simple ROI summary across all outcomes for a workspace.
 * Used in the CEO briefing and agent leaderboard.
 */
export type AgentRoiSummary = {
  workspaceId: string;
  agentId: string;
  skillId: string;
  totalActions: number;
  convertedCount: number;
  revenueCount: number;
  publishedCount: number;
  ignoredCount: number;
  failedCount: number;
  totalRevenueCad: number;
  conversionRate: number;   // convertedCount / totalActions
  generatedAt: string;
};

/** Compute a ROI summary from a list of outcomes. Pure function. */
export function computeAgentRoiSummary(
  workspaceId: string,
  agentId: string,
  skillId: string,
  outcomes: AgentOutcome[],
): AgentRoiSummary {
  const filtered = outcomes.filter(
    (o) => o.agentId === agentId && o.skillId === skillId,
  );
  const total = filtered.length;
  const converted = filtered.filter((o) => o.outcome === "converted").length;
  const revenue = filtered.filter((o) => o.outcome === "revenue").length;
  const published = filtered.filter((o) => o.outcome === "published").length;
  const ignored = filtered.filter((o) => o.outcome === "ignored").length;
  const failed = filtered.filter((o) => o.outcome === "failed").length;
  const totalRev = filtered.reduce((sum, o) => sum + o.revenueCad, 0);

  return {
    workspaceId,
    agentId,
    skillId,
    totalActions: total,
    convertedCount: converted,
    revenueCount: revenue,
    publishedCount: published,
    ignoredCount: ignored,
    failedCount: failed,
    totalRevenueCad: totalRev,
    conversionRate: total === 0 ? 0 : (converted + revenue) / total,
    generatedAt: new Date().toISOString(),
  };
}
