import type {
  ObservedAgentOutcomeEvaluation,
  ObservedAgentOutcomeEvaluationStatus,
} from "./observed-agent-outcome";

// ---------------------------------------------------------------------------
// Observed outcome review recommendations.
//
// Converts an observed outcome evaluation into a governance recommendation:
// should the agent keep operating as-is, gather more evidence, improve its
// knowledge pack, hold/reduce autonomy, or become eligible for a controlled
// expansion proposal — plus any risk flags that warrant human review.
//
// Pure, deterministic, read-only. No I/O, no DB, no Supabase, no network, no
// runtime execution. A recommendation is advice for a human reviewer; it never
// changes autonomy, approves an agent, or executes anything.
// ---------------------------------------------------------------------------

export type AgentOutcomeReviewDecision =
  | "continue_monitoring"
  | "require_more_observations"
  | "improve_knowledge_pack"
  | "block_autonomy_increase"
  | "eligible_for_controlled_expansion"
  | "reduce_autonomy_recommendation";

export type AgentOutcomeReviewRiskFlag =
  | "invalid_observation"
  | "agent_not_in_catalog"
  | "missing_scorecard"
  | "failed_outcome"
  | "high_guardrail_violations"
  | "high_or_critical_risk"
  | "low_quality_score"
  | "insufficient_reviewed_outputs"
  | "no_realized_value";

export type AgentOutcomeReviewNextAction =
  | "keep_monitoring"
  | "collect_more_observations"
  | "schedule_knowledge_pack_review"
  | "hold_autonomy_and_escalate"
  | "reduce_autonomy_and_escalate"
  | "prepare_controlled_expansion_proposal";

export interface AgentOutcomeReviewRecommendation {
  agentId: string;
  outcomeId: string;
  evaluationStatus: ObservedAgentOutcomeEvaluationStatus;
  decision: AgentOutcomeReviewDecision;
  riskFlags: AgentOutcomeReviewRiskFlag[];
  nextAction: AgentOutcomeReviewNextAction;
  rationale: string[];
  humanOnTheLoop: true;
  noExecutionAuthorized: true;
}

// Explicit governance thresholds. Kept simple and local on purpose.
const STRONG_QUALITY_SCORE = 70;
const LOW_QUALITY_SCORE = 40;
const MIN_REVIEWED_OUTPUTS = 5;
const SERIOUS_GUARDRAIL_VIOLATIONS = 2;

const NEXT_ACTION_BY_DECISION: Record<
  AgentOutcomeReviewDecision,
  AgentOutcomeReviewNextAction
> = {
  continue_monitoring: "keep_monitoring",
  require_more_observations: "collect_more_observations",
  improve_knowledge_pack: "schedule_knowledge_pack_review",
  block_autonomy_increase: "hold_autonomy_and_escalate",
  reduce_autonomy_recommendation: "reduce_autonomy_and_escalate",
  eligible_for_controlled_expansion: "prepare_controlled_expansion_proposal",
};

interface QualitySignals {
  guardrailViolations: number;
  qualityScore: number;
  reviewedOutputs: number;
  realizedProfitCents: number;
  highRisk: boolean;
  failed: boolean;
}

function decide(signals: QualitySignals): AgentOutcomeReviewDecision {
  if (signals.guardrailViolations >= SERIOUS_GUARDRAIL_VIOLATIONS) {
    return "reduce_autonomy_recommendation";
  }
  if (signals.guardrailViolations >= 1) {
    return "block_autonomy_increase";
  }
  if (signals.highRisk) {
    return "block_autonomy_increase";
  }
  if (signals.failed) {
    return "block_autonomy_increase";
  }
  if (signals.qualityScore < LOW_QUALITY_SCORE) {
    return "improve_knowledge_pack";
  }
  if (signals.reviewedOutputs < MIN_REVIEWED_OUTPUTS) {
    return "require_more_observations";
  }
  if (signals.realizedProfitCents <= 0) {
    return "require_more_observations";
  }
  if (
    signals.qualityScore >= STRONG_QUALITY_SCORE &&
    signals.guardrailViolations === 0 &&
    signals.reviewedOutputs >= MIN_REVIEWED_OUTPUTS &&
    !signals.highRisk &&
    !signals.failed &&
    signals.realizedProfitCents > 0
  ) {
    return "eligible_for_controlled_expansion";
  }
  return "continue_monitoring";
}

function finalize(
  evaluation: ObservedAgentOutcomeEvaluation,
  decision: AgentOutcomeReviewDecision,
  riskFlags: AgentOutcomeReviewRiskFlag[],
  rationale: string[],
): AgentOutcomeReviewRecommendation {
  return {
    agentId: evaluation.agentId,
    outcomeId: evaluation.outcomeId,
    evaluationStatus: evaluation.status,
    decision,
    riskFlags,
    nextAction: NEXT_ACTION_BY_DECISION[decision],
    rationale,
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
  };
}

/**
 * Builds a deterministic governance recommendation from an observed outcome
 * evaluation. Reads only the evaluation; never mutates it, never executes,
 * persists, or calls out. Recording a recommendation does not authorize any
 * autonomy change — a human stays on the loop.
 */
export function buildObservedAgentOutcomeReviewRecommendation(
  evaluation: ObservedAgentOutcomeEvaluation,
): AgentOutcomeReviewRecommendation {
  // Gating paths: quality cannot be assessed, so expansion is never possible.
  if (evaluation.status === "invalid") {
    return finalize(evaluation, "require_more_observations", ["invalid_observation"], [
      "Observation failed validation; capture a valid observation before reviewing autonomy.",
    ]);
  }

  if (evaluation.status === "agent_not_in_catalog") {
    return finalize(evaluation, "block_autonomy_increase", ["agent_not_in_catalog"], [
      "Agent is not in the governed catalog; autonomy changes are blocked.",
    ]);
  }

  const scorecard = evaluation.scorecard;
  if (!scorecard) {
    return finalize(evaluation, "require_more_observations", ["missing_scorecard"], [
      "No scorecard was produced; gather observations before reviewing autonomy.",
    ]);
  }

  const guardrailViolations = scorecard.guardrailViolations ?? 0;
  const qualityScore = scorecard.overallQualityScore;
  const reviewedOutputs = scorecard.reviewedOutputs ?? 0;
  const realizedProfitCents = scorecard.realizedProfitCents ?? 0;
  const highRisk =
    evaluation.riskLevel === "high" || evaluation.riskLevel === "critical";
  const failed = evaluation.outcomeStatus === "failed";

  const riskFlags: AgentOutcomeReviewRiskFlag[] = [];
  const rationale: string[] = [];

  if (failed) {
    riskFlags.push("failed_outcome");
    rationale.push("The observed run is marked failed.");
  }
  if (guardrailViolations > 0) {
    riskFlags.push("high_guardrail_violations");
    rationale.push(`${guardrailViolations} guardrail violation(s) observed.`);
  }
  if (highRisk) {
    riskFlags.push("high_or_critical_risk");
    rationale.push(`Observed risk level is ${evaluation.riskLevel}.`);
  }
  if (qualityScore < LOW_QUALITY_SCORE) {
    riskFlags.push("low_quality_score");
    rationale.push(`Quality score ${qualityScore} is below ${LOW_QUALITY_SCORE}.`);
  }
  if (reviewedOutputs < MIN_REVIEWED_OUTPUTS) {
    riskFlags.push("insufficient_reviewed_outputs");
    rationale.push(
      `Only ${reviewedOutputs} reviewed output(s); ${MIN_REVIEWED_OUTPUTS} needed.`,
    );
  }
  if (realizedProfitCents <= 0) {
    riskFlags.push("no_realized_value");
    rationale.push("No realized value observed yet.");
  }

  const decision = decide({
    guardrailViolations,
    qualityScore,
    reviewedOutputs,
    realizedProfitCents,
    highRisk,
    failed,
  });

  if (decision === "eligible_for_controlled_expansion") {
    rationale.push(
      "Strong quality, clean guardrails, sufficient reviewed outputs, and acceptable risk.",
    );
  } else if (decision === "continue_monitoring") {
    rationale.push("Signals are acceptable but not yet strong enough for expansion.");
  }

  return finalize(evaluation, decision, riskFlags, rationale);
}
