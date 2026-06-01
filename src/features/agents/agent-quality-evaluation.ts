import type { AgentAutonomyCockpitModel, AgentAutonomyCockpitRow } from "./agent-autonomy-cockpit";
import type { AgentKnowledgePackBlueprint, AgentKnowledgePackCatalog } from "./agent-knowledge-packs";

export type AgentQualityEvidenceMode = "blueprint_baseline" | "observed";

export type AgentQualityReadiness =
  | "ready_to_measure"
  | "needs_evidence"
  | "needs_knowledge_cleanup"
  | "blocked_until_unlock";

export type AgentQualityEvidenceGap =
  | "real_profit_observations"
  | "ceo_time_saved_observations"
  | "guardrail_observations"
  | "output_quality_observations"
  | "missing_skill_context";

export interface AgentQualityObservation {
  agentId: string;
  realizedProfitCents: number;
  ceoMinutesSaved: number;
  guardrailViolations: number;
  usefulOutputs: number;
  reviewedOutputs: number;
}

export interface AgentQualityDimension {
  label: string;
  score: number;
  reason: string;
}

export interface AgentQualityScorecard {
  agentId: string;
  agentName: string;
  role: AgentKnowledgePackBlueprint["role"];
  status: AgentKnowledgePackBlueprint["status"];
  overallQualityScore: number;
  readiness: AgentQualityReadiness;
  evidenceMode: AgentQualityEvidenceMode;
  dimensions: {
    profitSignal: AgentQualityDimension;
    ceoLoadReduction: AgentQualityDimension;
    guardrailCompliance: AgentQualityDimension;
    knowledgeReadiness: AgentQualityDimension;
    outputUsefulness: AgentQualityDimension;
  };
  realizedProfitCents: number | null;
  ceoMinutesSaved: number | null;
  guardrailViolations: number | null;
  usefulOutputs: number | null;
  reviewedOutputs: number | null;
  evidenceGaps: AgentQualityEvidenceGap[];
  humanOnTheLoop: true;
  noExecutionAuthorized: true;
}

export interface AgentQualityEvaluationSummary {
  totalScorecards: number;
  observedScorecards: number;
  baselineScorecards: number;
  averageQualityScore: number;
  totalObservedProfitCents: number | null;
  totalObservedCeoMinutesSaved: number | null;
  totalObservedGuardrailViolations: number | null;
  evidenceMode: AgentQualityEvidenceMode;
  noExecutionAuthorized: true;
}

export interface AgentQualityEvaluationModel {
  summary: AgentQualityEvaluationSummary;
  scorecards: AgentQualityScorecard[];
}

export interface BuildAgentQualityEvaluationInput {
  knowledgeCatalog: AgentKnowledgePackCatalog;
  autonomyCockpit: AgentAutonomyCockpitModel;
  observations?: AgentQualityObservation[];
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreObservedProfit(observation: AgentQualityObservation | undefined): AgentQualityDimension {
  if (!observation) {
    return {
      label: "Profit signal",
      score: 0,
      reason: "No realized profit observation is attached yet.",
    };
  }

  return {
    label: "Profit signal",
    score: clampScore(observation.realizedProfitCents / 1000),
    reason: `${observation.realizedProfitCents} cents observed profit contribution.`,
  };
}

function scoreCeoLoadReduction(observation: AgentQualityObservation | undefined): AgentQualityDimension {
  if (!observation) {
    return {
      label: "CEO load reduction",
      score: 0,
      reason: "No CEO time-saved observation is attached yet.",
    };
  }

  return {
    label: "CEO load reduction",
    score: clampScore((observation.ceoMinutesSaved / 120) * 100),
    reason: `${observation.ceoMinutesSaved} CEO minutes saved observed.`,
  };
}

function scoreGuardrails(
  pack: AgentKnowledgePackBlueprint,
  observation: AgentQualityObservation | undefined,
): AgentQualityDimension {
  if (observation) {
    return {
      label: "Guardrail compliance",
      score: clampScore(100 - observation.guardrailViolations * 30),
      reason: `${observation.guardrailViolations} observed guardrail violation(s).`,
    };
  }

  return {
    label: "Guardrail compliance",
    score: pack.guardrails.length > 0 ? 80 : 40,
    reason: "Blueprint guardrails are present, but runtime compliance has not been observed.",
  };
}

function scoreKnowledgeReadiness(
  pack: AgentKnowledgePackBlueprint,
  autonomyRow: AgentAutonomyCockpitRow | undefined,
): AgentQualityDimension {
  const missingCount = Math.max(pack.missingSkillIds.length, autonomyRow?.missingSkillIds.length ?? 0);
  const contextScore = Math.min(40, pack.requiredContext.length * 8);
  const skillScore = Math.min(40, pack.allowedSkillIds.length * 10);
  const sourceScore = Math.min(20, pack.trustedSources.length * 4);

  return {
    label: "Knowledge readiness",
    score: clampScore(contextScore + skillScore + sourceScore - missingCount * 25),
    reason: `${pack.requiredContext.length} context item(s), ${pack.allowedSkillIds.length} skill context(s), ${missingCount} missing skill(s).`,
  };
}

function scoreOutputUsefulness(observation: AgentQualityObservation | undefined): AgentQualityDimension {
  if (!observation) {
    return {
      label: "Output usefulness",
      score: 0,
      reason: "No reviewed output observation is attached yet.",
    };
  }

  const ratio = observation.reviewedOutputs > 0
    ? observation.usefulOutputs / observation.reviewedOutputs
    : 0;

  return {
    label: "Output usefulness",
    score: clampScore(ratio * 100),
    reason: `${observation.usefulOutputs}/${observation.reviewedOutputs} reviewed outputs were useful.`,
  };
}

function buildEvidenceGaps(
  pack: AgentKnowledgePackBlueprint,
  observation: AgentQualityObservation | undefined,
): AgentQualityEvidenceGap[] {
  const gaps: AgentQualityEvidenceGap[] = [];

  if (!observation) {
    gaps.push(
      "real_profit_observations",
      "ceo_time_saved_observations",
      "guardrail_observations",
      "output_quality_observations",
    );
  }

  if (pack.missingSkillIds.length > 0) {
    gaps.push("missing_skill_context");
  }

  return gaps;
}

function deriveReadiness(
  pack: AgentKnowledgePackBlueprint,
  observation: AgentQualityObservation | undefined,
): AgentQualityReadiness {
  if (pack.status === "locked") {
    return "blocked_until_unlock";
  }

  if (pack.missingSkillIds.length > 0) {
    return "needs_knowledge_cleanup";
  }

  if (!observation) {
    return "needs_evidence";
  }

  return "ready_to_measure";
}

function weightedOverall(scorecard: Pick<AgentQualityScorecard, "dimensions">): number {
  return clampScore(
    scorecard.dimensions.profitSignal.score * 0.25 +
      scorecard.dimensions.ceoLoadReduction.score * 0.25 +
      scorecard.dimensions.guardrailCompliance.score * 0.25 +
      scorecard.dimensions.knowledgeReadiness.score * 0.15 +
      scorecard.dimensions.outputUsefulness.score * 0.1,
  );
}

function buildScorecard(
  pack: AgentKnowledgePackBlueprint,
  autonomyRow: AgentAutonomyCockpitRow | undefined,
  observation: AgentQualityObservation | undefined,
): AgentQualityScorecard {
  const dimensions = {
    profitSignal: scoreObservedProfit(observation),
    ceoLoadReduction: scoreCeoLoadReduction(observation),
    guardrailCompliance: scoreGuardrails(pack, observation),
    knowledgeReadiness: scoreKnowledgeReadiness(pack, autonomyRow),
    outputUsefulness: scoreOutputUsefulness(observation),
  };

  const partial = { dimensions };

  return {
    agentId: pack.agentId,
    agentName: pack.agentName,
    role: pack.role,
    status: pack.status,
    overallQualityScore: weightedOverall(partial),
    readiness: deriveReadiness(pack, observation),
    evidenceMode: observation ? "observed" : "blueprint_baseline",
    dimensions,
    realizedProfitCents: observation?.realizedProfitCents ?? null,
    ceoMinutesSaved: observation?.ceoMinutesSaved ?? null,
    guardrailViolations: observation?.guardrailViolations ?? null,
    usefulOutputs: observation?.usefulOutputs ?? null,
    reviewedOutputs: observation?.reviewedOutputs ?? null,
    evidenceGaps: buildEvidenceGaps(pack, observation),
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
  };
}

export function buildAgentQualityEvaluation(
  input: BuildAgentQualityEvaluationInput,
): AgentQualityEvaluationModel {
  const observationsByAgentId = new Map(
    (input.observations ?? []).map((observation) => [observation.agentId, observation]),
  );
  const autonomyRowsByAgentId = new Map(
    input.autonomyCockpit.agents.map((row) => [row.id, row]),
  );
  const scorecards = input.knowledgeCatalog.packs.map((pack) =>
    buildScorecard(pack, autonomyRowsByAgentId.get(pack.agentId), observationsByAgentId.get(pack.agentId)),
  );
  const observedScorecards = scorecards.filter((scorecard) => scorecard.evidenceMode === "observed");
  const totalObservedProfitCents = observedScorecards.length > 0
    ? observedScorecards.reduce((sum, scorecard) => sum + (scorecard.realizedProfitCents ?? 0), 0)
    : null;
  const totalObservedCeoMinutesSaved = observedScorecards.length > 0
    ? observedScorecards.reduce((sum, scorecard) => sum + (scorecard.ceoMinutesSaved ?? 0), 0)
    : null;
  const totalObservedGuardrailViolations = observedScorecards.length > 0
    ? observedScorecards.reduce((sum, scorecard) => sum + (scorecard.guardrailViolations ?? 0), 0)
    : null;

  return {
    summary: {
      totalScorecards: scorecards.length,
      observedScorecards: observedScorecards.length,
      baselineScorecards: scorecards.length - observedScorecards.length,
      averageQualityScore: scorecards.length > 0
        ? clampScore(scorecards.reduce((sum, scorecard) => sum + scorecard.overallQualityScore, 0) / scorecards.length)
        : 0,
      totalObservedProfitCents,
      totalObservedCeoMinutesSaved,
      totalObservedGuardrailViolations,
      evidenceMode: observedScorecards.length > 0 ? "observed" : "blueprint_baseline",
      noExecutionAuthorized: true,
    },
    scorecards,
  };
}
