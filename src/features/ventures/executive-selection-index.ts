// src/features/ventures/executive-selection-index.ts
//
// Pure TypeScript synthesis layer that combines VentureCashScore (PR189) and
// AgentOperatorScore (PR190) into structural allocation decisions.
//
// Replaces decorative leaderboards with actionable routing:
//   ventures → deserves_more_compute | maintain_allocation | should_be_paused |
//              needs_ceo_review | kill_candidate
//   agents   → deserves_more_work | maintain_allocation | needs_stronger_evidence |
//              should_be_paired | flag_for_review
//
// No badges, no cosmetic scores, no autonomous execution.
// Every decision is a proposal — humans stay on the loop at every step.
// Governance locks pinned to literal true throughout.

import type { VentureCashScore } from "./venture-cash-score";
import type { AgentOperatorScore } from "./auto-agent-operator-score";

// ---------------------------------------------------------------------------
// SECTION A — Allocation decision types
// ---------------------------------------------------------------------------

export type VentureAllocation =
  | "deserves_more_compute"  // cash_ready — scale up
  | "maintain_allocation"   // continue_candidate — steady
  | "should_be_paused"      // insufficient evidence — hold
  | "needs_ceo_review"      // pivot_candidate — human decides direction
  | "kill_candidate";       // CEO must decide — never auto-killed

export type AgentAllocation =
  | "deserves_more_work"        // high performer — give more missions
  | "maintain_allocation"       // capable — steady load
  | "needs_stronger_evidence"   // weak evidence quality — evidence required
  | "should_be_paired"          // developing with low revenue — assign a mentor agent
  | "flag_for_review";          // underperforming — human review required

export type VenturePriority =
  | "critical"   // cash_ready
  | "high"       // continue_candidate, score >= 60
  | "standard"   // continue_candidate, score < 60
  | "low"        // pivot_candidate
  | "paused";    // kill_candidate | insufficient_evidence

export type AgentTrustLevel =
  | "high"         // elite_operator | high_performer
  | "standard"     // capable_operator
  | "watch"        // developing_operator | insufficient_evidence
  | "needs_review"; // underperforming_operator

// ---------------------------------------------------------------------------
// SECTION B — Output types
// ---------------------------------------------------------------------------

export type VentureAllocationDecision = {
  ventureId: string;
  allocation: VentureAllocation;
  priority: VenturePriority;
  ceoDecisionRequired: boolean;
  reasons: string[];
  humanOnTheLoop: true;
  approvalRequired: true;
  noExecutionAuthorized: true;
};

export type AgentAllocationDecision = {
  agentId: string;
  allocation: AgentAllocation;
  trustLevel: AgentTrustLevel;
  reasons: string[];
  humanOnTheLoop: true;
  approvalRequired: true;
  noExecutionAuthorized: true;
};

export type ExecutiveSelectionIndex = {
  ventures: VentureAllocationDecision[];
  agents: AgentAllocationDecision[];
  topVentureIds: string[];  // sorted: critical first, then score descending
  topAgentIds: string[];    // sorted: high trust first, then score descending
  indexSummary: string;
  humanOnTheLoop: true;
  approvalRequired: true;
  noExecutionAuthorized: true;
};

// ---------------------------------------------------------------------------
// SECTION C — Priority / trust rank constants (lower = higher rank)
// ---------------------------------------------------------------------------

export const VENTURE_PRIORITY_RANK: Record<VenturePriority, number> = {
  critical: 0,
  high: 1,
  standard: 2,
  low: 3,
  paused: 4,
};

export const AGENT_TRUST_RANK: Record<AgentTrustLevel, number> = {
  high: 0,
  standard: 1,
  watch: 2,
  needs_review: 3,
};

// ---------------------------------------------------------------------------
// SECTION D — selectVentureAllocation
// ---------------------------------------------------------------------------

function venturePriorityFrom(
  survivalStatus: VentureCashScore["survivalStatus"],
  totalCashScore: number,
): VenturePriority {
  switch (survivalStatus) {
    case "cash_ready":
      return "critical";
    case "continue_candidate":
      return totalCashScore >= 60 ? "high" : "standard";
    case "pivot_candidate":
      return "low";
    case "kill_candidate":
    case "insufficient_evidence":
    default:
      return "paused";
  }
}

export function selectVentureAllocation(
  venture: VentureCashScore,
): VentureAllocationDecision {
  const { ventureId, survivalStatus, totalCashScore, shouldRequestCeoDecision } = venture;
  const reasons: string[] = [];
  let allocation: VentureAllocation;

  switch (survivalStatus) {
    case "cash_ready":
      allocation = "deserves_more_compute";
      reasons.push(
        `Venture is cash_ready (score ${totalCashScore}/100) — increase compute allocation.`,
      );
      break;
    case "continue_candidate":
      allocation = "maintain_allocation";
      reasons.push(
        `Venture is a continue_candidate (score ${totalCashScore}/100) — maintain current allocation.`,
      );
      break;
    case "pivot_candidate":
      allocation = "needs_ceo_review";
      reasons.push(
        `Venture is a pivot_candidate (score ${totalCashScore}/100) — CEO must choose direction before reallocation.`,
      );
      break;
    case "kill_candidate":
      allocation = "kill_candidate";
      reasons.push(
        `Venture is a kill_candidate (score ${totalCashScore}/100) — no further compute until CEO decides.`,
      );
      break;
    case "insufficient_evidence":
    default:
      allocation = "should_be_paused";
      reasons.push(
        `Venture has insufficient evidence (score ${totalCashScore}/100) — pause until stronger signals emerge.`,
      );
  }

  // Propagate an upstream CEO request even when the allocation itself doesn't mandate it.
  if (
    shouldRequestCeoDecision &&
    allocation !== "kill_candidate" &&
    allocation !== "needs_ceo_review"
  ) {
    reasons.push("CEO decision requested by venture cash score engine before scaling.");
  }

  return {
    ventureId,
    allocation,
    priority: venturePriorityFrom(survivalStatus, totalCashScore),
    ceoDecisionRequired:
      shouldRequestCeoDecision ||
      allocation === "kill_candidate" ||
      allocation === "needs_ceo_review",
    reasons,
    humanOnTheLoop: true,
    approvalRequired: true,
    noExecutionAuthorized: true,
  };
}

// ---------------------------------------------------------------------------
// SECTION E — selectAgentAllocation
// ---------------------------------------------------------------------------

function agentTrustFrom(
  status: AgentOperatorScore["operatorStatus"],
): AgentTrustLevel {
  switch (status) {
    case "elite_operator":
    case "high_performer":
      return "high";
    case "capable_operator":
      return "standard";
    case "developing_operator":
    case "insufficient_evidence":
      return "watch";
    case "underperforming_operator":
    default:
      return "needs_review";
  }
}

export function selectAgentAllocation(
  agent: AgentOperatorScore,
): AgentAllocationDecision {
  const {
    agentId,
    operatorStatus,
    totalOperatorScore,
    shouldAssignMoreWork,
    shouldRequireStrongerEvidence,
    shouldPairWithAgent,
    shouldFlagForReview,
  } = agent;

  const reasons: string[] = [];
  let allocation: AgentAllocation;

  // Priority: flag > pair > assign more > require evidence > maintain
  if (shouldFlagForReview) {
    allocation = "flag_for_review";
    reasons.push(
      `Agent is ${operatorStatus} (score ${totalOperatorScore}/100) — flagged for human review.`,
    );
  } else if (shouldPairWithAgent) {
    allocation = "should_be_paired";
    reasons.push(
      `Agent is ${operatorStatus} with low revenue impact — pair with a stronger economic operator.`,
    );
  } else if (shouldAssignMoreWork) {
    allocation = "deserves_more_work";
    reasons.push(
      `Agent is ${operatorStatus} (score ${totalOperatorScore}/100) — assign higher-value missions.`,
    );
  } else if (shouldRequireStrongerEvidence) {
    allocation = "needs_stronger_evidence";
    reasons.push(
      `Agent has weak evidence quality (score ${totalOperatorScore}/100) — evidence required before next mission.`,
    );
  } else {
    allocation = "maintain_allocation";
    reasons.push(
      `Agent is ${operatorStatus} (score ${totalOperatorScore}/100) — maintain current task load.`,
    );
  }

  return {
    agentId,
    allocation,
    trustLevel: agentTrustFrom(operatorStatus),
    reasons,
    humanOnTheLoop: true,
    approvalRequired: true,
    noExecutionAuthorized: true,
  };
}

// ---------------------------------------------------------------------------
// SECTION F — buildExecutiveSelectionIndex
// ---------------------------------------------------------------------------

export function buildExecutiveSelectionIndex(
  ventures: VentureCashScore[],
  agents: AgentOperatorScore[],
): ExecutiveSelectionIndex {
  const ventureDecisions = ventures.map(selectVentureAllocation);
  const agentDecisions = agents.map(selectAgentAllocation);

  // Sort ventures: highest priority first, then by cash score descending.
  const ventureScoreById = new Map(ventures.map((v) => [v.ventureId, v.totalCashScore]));
  const topVentureIds = [...ventureDecisions]
    .sort((a, b) => {
      const rankDiff = VENTURE_PRIORITY_RANK[a.priority] - VENTURE_PRIORITY_RANK[b.priority];
      if (rankDiff !== 0) return rankDiff;
      return (ventureScoreById.get(b.ventureId) ?? 0) - (ventureScoreById.get(a.ventureId) ?? 0);
    })
    .map((d) => d.ventureId);

  // Sort agents: highest trust first, then by operator score descending.
  const agentScoreById = new Map(agents.map((a) => [a.agentId, a.totalOperatorScore]));
  const topAgentIds = [...agentDecisions]
    .sort((a, b) => {
      const rankDiff = AGENT_TRUST_RANK[a.trustLevel] - AGENT_TRUST_RANK[b.trustLevel];
      if (rankDiff !== 0) return rankDiff;
      return (agentScoreById.get(b.agentId) ?? 0) - (agentScoreById.get(a.agentId) ?? 0);
    })
    .map((d) => d.agentId);

  // Build a plain-language summary.
  const cashReadyCount = ventureDecisions.filter(
    (d) => d.allocation === "deserves_more_compute",
  ).length;
  const killCandidateCount = ventureDecisions.filter(
    (d) => d.allocation === "kill_candidate",
  ).length;
  const highTrustCount = agentDecisions.filter((d) => d.trustLevel === "high").length;
  const flaggedCount = agentDecisions.filter(
    (d) => d.allocation === "flag_for_review",
  ).length;

  const summaryParts = [
    `${ventures.length} venture(s) and ${agents.length} agent(s) evaluated.`,
  ];
  if (cashReadyCount > 0) {
    summaryParts.push(`${cashReadyCount} venture(s) cash-ready — increase compute.`);
  }
  if (killCandidateCount > 0) {
    summaryParts.push(
      `${killCandidateCount} venture(s) as kill candidate — CEO decision required.`,
    );
  }
  if (highTrustCount > 0) {
    summaryParts.push(`${highTrustCount} high-trust agent(s) ready for more work.`);
  }
  if (flaggedCount > 0) {
    summaryParts.push(`${flaggedCount} agent(s) flagged for human review.`);
  }

  return {
    ventures: ventureDecisions,
    agents: agentDecisions,
    topVentureIds,
    topAgentIds,
    indexSummary: summaryParts.join(" "),
    humanOnTheLoop: true,
    approvalRequired: true,
    noExecutionAuthorized: true,
  };
}
