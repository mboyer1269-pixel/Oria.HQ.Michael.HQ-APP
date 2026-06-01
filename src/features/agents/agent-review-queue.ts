import type { ObservedAgentOutcomeEvaluation } from "./observed-agent-outcome";
import type {
  AgentOutcomeReviewDecision,
  AgentOutcomeReviewNextAction,
  AgentOutcomeReviewRecommendation,
  AgentOutcomeReviewRiskFlag,
} from "./observed-agent-outcome-review";

// ---------------------------------------------------------------------------
// Agent review queue builder.
//
// Converts observed outcome evaluations and their governance recommendations
// into a prioritized list of queue items for a human reviewer. This builder
// is the entry point for a future review UI or DB queue, but this module
// performs no persistence, no I/O, no network calls, and no autonomy changes.
//
// Pure, deterministic, read-only. Humans stay on the loop — every item
// carries approvalRequired: true and noExecutionAuthorized: true.
// ---------------------------------------------------------------------------

export type AgentReviewPriority = "critical" | "high" | "medium" | "low";

export type AgentReviewQueueItemStatus = "pending_review" | "awaiting_observations";

export interface AgentReviewQueueItem {
  queueItemId: string;
  agentId: string;
  outcomeId: string;
  priority: AgentReviewPriority;
  status: AgentReviewQueueItemStatus;
  decision: AgentOutcomeReviewDecision;
  riskFlags: AgentOutcomeReviewRiskFlag[];
  nextAction: AgentOutcomeReviewNextAction;
  rationale: string[];
  executiveSummary: string;
  approvalRequired: true;
  humanOnTheLoop: true;
  noExecutionAuthorized: true;
  createdAt: string;
}

export interface BuildAgentReviewQueueInput {
  items: Array<{
    evaluation: ObservedAgentOutcomeEvaluation;
    recommendation: AgentOutcomeReviewRecommendation;
  }>;
  /** ISO timestamp for createdAt on each item. Must be provided by caller to keep the function pure/deterministic. */
  createdAt: string;
}

export interface AgentReviewQueue {
  totalItems: number;
  criticalItems: number;
  highItems: number;
  mediumItems: number;
  lowItems: number;
  items: AgentReviewQueueItem[];
  humanOnTheLoop: true;
  noExecutionAuthorized: true;
}

// ---------------------------------------------------------------------------
// Priority mapping
// ---------------------------------------------------------------------------

const CRITICAL_DECISIONS: ReadonlySet<AgentOutcomeReviewDecision> = new Set([
  "reduce_autonomy_recommendation",
  "block_autonomy_increase",
]);

const HIGH_RISK_FLAGS: ReadonlySet<AgentOutcomeReviewRiskFlag> = new Set([
  "invalid_observation",
  "agent_not_in_catalog",
  "failed_outcome",
  "low_quality_score",
]);

const CRITICAL_RISK_FLAGS: ReadonlySet<AgentOutcomeReviewRiskFlag> = new Set([
  "high_guardrail_violations",
  "high_or_critical_risk",
]);

const PRIORITY_ORDER: Record<AgentReviewPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function derivePriority(
  decision: AgentOutcomeReviewDecision,
  riskFlags: AgentOutcomeReviewRiskFlag[],
): AgentReviewPriority {
  if (
    CRITICAL_DECISIONS.has(decision) ||
    riskFlags.some((flag) => CRITICAL_RISK_FLAGS.has(flag))
  ) {
    return "critical";
  }
  if (riskFlags.some((flag) => HIGH_RISK_FLAGS.has(flag))) {
    return "high";
  }
  if (
    decision === "require_more_observations" ||
    decision === "improve_knowledge_pack"
  ) {
    return "medium";
  }
  if (decision === "eligible_for_controlled_expansion") {
    return "medium";
  }
  return "low";
}

function deriveStatus(decision: AgentOutcomeReviewDecision): AgentReviewQueueItemStatus {
  return decision === "require_more_observations"
    ? "awaiting_observations"
    : "pending_review";
}

function buildExecutiveSummary(
  decision: AgentOutcomeReviewDecision,
  riskFlags: AgentOutcomeReviewRiskFlag[],
  agentId: string,
): string {
  const flagSummary =
    riskFlags.length > 0 ? ` Risk flags: ${riskFlags.join(", ")}.` : "";

  switch (decision) {
    case "reduce_autonomy_recommendation":
      return `Agent ${agentId} has serious guardrail violations — human reviewer must consider reducing autonomy.${flagSummary}`;
    case "block_autonomy_increase":
      return `Agent ${agentId} is blocked from autonomy expansion until risk is resolved.${flagSummary}`;
    case "improve_knowledge_pack":
      return `Agent ${agentId} shows low quality; knowledge pack review is recommended before further evaluation.${flagSummary}`;
    case "require_more_observations":
      return `Agent ${agentId} needs more observed outcomes before an autonomy decision can be made.${flagSummary}`;
    case "eligible_for_controlled_expansion":
      return `Agent ${agentId} shows strong signals and may be eligible for a controlled expansion proposal — human approval required.${flagSummary}`;
    case "continue_monitoring":
      return `Agent ${agentId} is operating acceptably; continue monitoring before any change.${flagSummary}`;
  }
}

function buildQueueItem(
  evaluation: ObservedAgentOutcomeEvaluation,
  recommendation: AgentOutcomeReviewRecommendation,
  createdAt: string,
  index: number,
): AgentReviewQueueItem {
  const priority = derivePriority(recommendation.decision, recommendation.riskFlags);
  const status = deriveStatus(recommendation.decision);

  return {
    queueItemId: `review-${evaluation.agentId}-${evaluation.outcomeId}-${index}`,
    agentId: evaluation.agentId,
    outcomeId: evaluation.outcomeId,
    priority,
    status,
    decision: recommendation.decision,
    riskFlags: [...recommendation.riskFlags],
    nextAction: recommendation.nextAction,
    rationale: [...recommendation.rationale],
    executiveSummary: buildExecutiveSummary(
      recommendation.decision,
      recommendation.riskFlags,
      evaluation.agentId,
    ),
    approvalRequired: true,
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
    createdAt,
  };
}

/**
 * Builds a prioritized human-review queue from observed outcome evaluations
 * and their governance recommendations. The queue is sorted critical → high →
 * medium → low. Pure and deterministic — never mutates inputs, never executes,
 * persists, or calls out. Every item is advisory only.
 */
export function buildAgentReviewQueue(
  input: BuildAgentReviewQueueInput,
): AgentReviewQueue {
  const items = input.items
    .map(({ evaluation, recommendation }, index) =>
      buildQueueItem(evaluation, recommendation, input.createdAt, index),
    )
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  return {
    totalItems: items.length,
    criticalItems: items.filter((item) => item.priority === "critical").length,
    highItems: items.filter((item) => item.priority === "high").length,
    mediumItems: items.filter((item) => item.priority === "medium").length,
    lowItems: items.filter((item) => item.priority === "low").length,
    items,
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
  };
}
