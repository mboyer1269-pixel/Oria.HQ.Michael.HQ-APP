import { buildAgentQualityEvaluation } from "./agent-quality-evaluation";
import type {
  AgentQualityEvaluationModel,
  AgentQualityObservation,
  AgentQualityScorecard,
  BuildAgentQualityEvaluationInput,
} from "./agent-quality-evaluation";

// ---------------------------------------------------------------------------
// Local observed-outcome evaluation pipeline.
//
// Captures an observation of what an agent actually produced (read-only, never
// a runtime trigger), validates it, adapts it into the existing quality
// scorecard evaluation input, and runs the existing deterministic evaluator.
//
// Pure functions only — no I/O, no DB, no Supabase, no network, no env vars,
// no runtime action execution. Recording an outcome here never authorizes the
// agent to act; humans stay on the loop.
// ---------------------------------------------------------------------------

export type ObservedAgentOutcomeStatus =
  | "draft"
  | "simulated"
  | "completed"
  | "failed"
  | "blocked";

export type ObservedAgentOutcomeRiskLevel = "low" | "medium" | "high" | "critical";

const OBSERVED_OUTCOME_STATUSES: ReadonlySet<ObservedAgentOutcomeStatus> = new Set([
  "draft",
  "simulated",
  "completed",
  "failed",
  "blocked",
]);

const OBSERVED_OUTCOME_RISK_LEVELS: ReadonlySet<ObservedAgentOutcomeRiskLevel> = new Set([
  "low",
  "medium",
  "high",
  "critical",
]);

/** Statuses that represent a concluded run and therefore require evidence. */
const CONCLUDED_STATUSES: ReadonlySet<ObservedAgentOutcomeStatus> = new Set([
  "completed",
  "failed",
]);

/**
 * Numeric signals observed about a concluded run. Optional: a draft or
 * simulated outcome may carry none. Maps 1:1 onto the scorecard's
 * {@link AgentQualityObservation} metrics.
 */
export interface ObservedAgentOutcomeMetrics {
  realizedProfitCents: number;
  ceoMinutesSaved: number;
  guardrailViolations: number;
  usefulOutputs: number;
  reviewedOutputs: number;
}

/**
 * A locally recorded observation of what an agent produced. This is evidence
 * for evaluation, not an instruction to execute anything.
 */
export interface ObservedAgentOutcome {
  id: string;
  agentId: string;
  source: string;
  objective: string;
  expectedOutcome: string;
  /** Required once the run is concluded (completed/failed). */
  actualOutcome: string;
  status: ObservedAgentOutcomeStatus;
  riskLevel: ObservedAgentOutcomeRiskLevel;
  artifacts: string[];
  /** Required once the run is concluded (completed/failed). */
  evidence: string[];
  createdAt: string;
  missionId?: string;
  completedAt?: string;
  notes?: string;
  metrics?: ObservedAgentOutcomeMetrics;
}

export type ObservedAgentOutcomeValidationError =
  | "missing_id"
  | "missing_agent_id"
  | "missing_objective"
  | "missing_expected_outcome"
  | "missing_actual_outcome"
  | "missing_evidence"
  | "missing_created_at"
  | "invalid_created_at"
  | "invalid_status"
  | "invalid_risk_level";

export interface ObservedAgentOutcomeValidation {
  valid: boolean;
  errors: ObservedAgentOutcomeValidationError[];
}

/** Context preserved alongside the numeric observation for downstream review. */
export interface ObservedQualityEvaluationContext {
  source: string;
  objective: string;
  expectedOutcome: string;
  actualOutcome: string;
  artifacts: string[];
  evidence: string[];
  riskLevel: ObservedAgentOutcomeRiskLevel;
  status: ObservedAgentOutcomeStatus;
}

/** Adapter output: the scorecard observation plus preserved qualitative context. */
export interface ObservedQualityEvaluationInput {
  observation: AgentQualityObservation;
  context: ObservedQualityEvaluationContext;
}

export type ObservedAgentOutcomeEvaluationStatus =
  | "evaluated"
  | "invalid"
  | "agent_not_in_catalog";

/** Inputs the existing evaluator needs, minus the observations it derives here. */
export type EvaluateObservedAgentOutcomeContext = Omit<
  BuildAgentQualityEvaluationInput,
  "observations"
>;

export interface ObservedAgentOutcomeEvaluation {
  status: ObservedAgentOutcomeEvaluationStatus;
  outcomeId: string;
  agentId: string;
  validation: ObservedAgentOutcomeValidation;
  observation: AgentQualityObservation | null;
  scorecard: AgentQualityScorecard | null;
  evaluation: AgentQualityEvaluationModel | null;
  humanOnTheLoop: true;
  noExecutionAuthorized: true;
}

const ZERO_METRICS: ObservedAgentOutcomeMetrics = {
  realizedProfitCents: 0,
  ceoMinutesSaved: 0,
  guardrailViolations: 0,
  usefulOutputs: 0,
  reviewedOutputs: 0,
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isParseableTimestamp(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

/**
 * Validates an observed outcome without side effects. Returns a report rather
 * than throwing, matching the validation style used elsewhere in this feature.
 */
export function validateObservedAgentOutcome(
  outcome: ObservedAgentOutcome,
): ObservedAgentOutcomeValidation {
  const errors: ObservedAgentOutcomeValidationError[] = [];

  if (!isNonEmptyString(outcome.id)) {
    errors.push("missing_id");
  }
  if (!isNonEmptyString(outcome.agentId)) {
    errors.push("missing_agent_id");
  }
  if (!isNonEmptyString(outcome.objective)) {
    errors.push("missing_objective");
  }
  if (!isNonEmptyString(outcome.expectedOutcome)) {
    errors.push("missing_expected_outcome");
  }

  if (!OBSERVED_OUTCOME_STATUSES.has(outcome.status)) {
    errors.push("invalid_status");
  }
  if (!OBSERVED_OUTCOME_RISK_LEVELS.has(outcome.riskLevel)) {
    errors.push("invalid_risk_level");
  }

  if (!isNonEmptyString(outcome.createdAt)) {
    errors.push("missing_created_at");
  } else if (!isParseableTimestamp(outcome.createdAt)) {
    errors.push("invalid_created_at");
  }

  if (CONCLUDED_STATUSES.has(outcome.status)) {
    if (!isNonEmptyString(outcome.actualOutcome)) {
      errors.push("missing_actual_outcome");
    }
    if (!Array.isArray(outcome.evidence) || outcome.evidence.length === 0) {
      errors.push("missing_evidence");
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Pure adapter: converts an observed outcome into the scorecard evaluation
 * input. Does not call the DB, runtime, or network, does not mutate its input,
 * and produces deterministic output. Missing metrics map to zeros so an
 * un-instrumented outcome still evaluates deterministically.
 */
export function toQualityEvaluationInput(
  outcome: ObservedAgentOutcome,
): ObservedQualityEvaluationInput {
  const metrics = outcome.metrics ?? ZERO_METRICS;

  return {
    observation: {
      agentId: outcome.agentId,
      realizedProfitCents: metrics.realizedProfitCents,
      ceoMinutesSaved: metrics.ceoMinutesSaved,
      guardrailViolations: metrics.guardrailViolations,
      usefulOutputs: metrics.usefulOutputs,
      reviewedOutputs: metrics.reviewedOutputs,
    },
    context: {
      source: outcome.source,
      objective: outcome.objective,
      expectedOutcome: outcome.expectedOutcome,
      actualOutcome: outcome.actualOutcome,
      artifacts: [...outcome.artifacts],
      evidence: [...outcome.evidence],
      riskLevel: outcome.riskLevel,
      status: outcome.status,
    },
  };
}

/**
 * Local evaluation pipeline: validate → adapt → run the existing scorecard
 * evaluator → return a deterministic result. Never executes actions, writes,
 * reads a DB, or requires env vars. An invalid outcome short-circuits before
 * adaptation; an outcome whose agent is absent from the catalog returns
 * `agent_not_in_catalog`.
 */
export function evaluateObservedAgentOutcome(
  outcome: ObservedAgentOutcome,
  context: EvaluateObservedAgentOutcomeContext,
): ObservedAgentOutcomeEvaluation {
  const validation = validateObservedAgentOutcome(outcome);

  if (!validation.valid) {
    return {
      status: "invalid",
      outcomeId: outcome.id,
      agentId: outcome.agentId,
      validation,
      observation: null,
      scorecard: null,
      evaluation: null,
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
    };
  }

  const { observation } = toQualityEvaluationInput(outcome);
  const evaluation = buildAgentQualityEvaluation({
    knowledgeCatalog: context.knowledgeCatalog,
    autonomyCockpit: context.autonomyCockpit,
    observations: [observation],
  });
  const scorecard =
    evaluation.scorecards.find((card) => card.agentId === outcome.agentId) ?? null;

  return {
    status: scorecard ? "evaluated" : "agent_not_in_catalog",
    outcomeId: outcome.id,
    agentId: outcome.agentId,
    validation,
    observation,
    scorecard,
    evaluation,
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
  };
}
