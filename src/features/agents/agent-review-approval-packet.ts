import type {
  AgentOutcomeReviewDecision,
  AgentOutcomeReviewRiskFlag,
} from "./observed-agent-outcome-review";
import type { AgentReviewPriority, AgentReviewQueueItem } from "./agent-review-queue";

// ---------------------------------------------------------------------------
// Agent review approval packet.
//
// Converts an AgentReviewQueueItem into a structured packet that prepares a
// human decision. This packet is NOT an approval, NOT an execution trigger,
// and does NOT mutate agent autonomy. It exists so a future approval flow has
// a well-typed, auditable input contract rather than an ad-hoc payload.
//
// Pure, deterministic, read-only. No DB, no Supabase, no network, no runtime,
// no Action Ledger writes. Every packet carries approvalRequired: true and
// noExecutionAuthorized: true as literal fields — not flags.
// ---------------------------------------------------------------------------

export type AgentReviewApprovalPacketStatus =
  | "draft_for_human_review"
  | "ready_for_human_review"
  | "blocked_pending_more_evidence";

/** What the human reviewer is being asked to approve or reject. */
export type AgentReviewApprovalPacketDecision =
  | "approve_controlled_expansion_review"
  | "approve_continue_monitoring"
  | "approve_knowledge_pack_improvement_review"
  | "approve_more_observation_collection"
  | "reject_or_reduce_autonomy"
  | "block_autonomy_increase";

export type AgentReviewRiskSummaryLevel = "critical" | "high" | "elevated" | "moderate" | "low";

export type AgentReviewRequiredReview =
  | "ceo_review_required"
  | "operator_review_required"
  | "routine_review_required"
  | "more_evidence_required";

export interface AgentReviewApprovalRiskSummary {
  level: AgentReviewRiskSummaryLevel;
  riskFlagCount: number;
  riskFlags: AgentOutcomeReviewRiskFlag[];
  requiresHumanApproval: true;
  requiresLedgerBeforeExecution: true;
}

export interface AgentReviewApprovalRequirement {
  requiredReview: AgentReviewRequiredReview;
  approvalRequired: true;
  noAutoApproval: true;
  ledgerEntryRequiredBeforeExecution: true;
}

export interface AgentReviewApprovalPacket {
  packetId: string;
  queueItemId: string;
  agentId: string;
  outcomeId: string;
  priority: AgentReviewPriority;
  status: AgentReviewApprovalPacketStatus;
  /** The specific decision the human reviewer is being asked to make. */
  requestedDecision: AgentReviewApprovalPacketDecision;
  /** The underlying recommendation decision this packet was derived from. */
  sourceDecision: AgentOutcomeReviewDecision;
  sourceNextAction: string;
  riskSummary: AgentReviewApprovalRiskSummary;
  requiredReview: AgentReviewApprovalRequirement;
  rationale: string[];
  executiveSummary: string;
  /**
   * Explicit governance guardrails. These are not flags — they are named
   * constraints that must be present on every packet regardless of decision.
   */
  guardrails: string[];
  approvalRequired: true;
  humanOnTheLoop: true;
  noExecutionAuthorized: true;
  createdAt: string;
  expiresAt?: string;
}

export interface BuildAgentReviewApprovalPacketInput {
  queueItem: AgentReviewQueueItem;
  /** ISO timestamp. Caller-provided — builder never calls Date.now(). */
  createdAt: string;
  expiresAt?: string;
}

// ---------------------------------------------------------------------------
// Guardrails — static, copied onto every packet
// ---------------------------------------------------------------------------

const APPROVAL_PACKET_GUARDRAILS: readonly string[] = [
  "This packet does not constitute approval of any agent action.",
  "This packet does not authorize runtime execution.",
  "This packet does not mutate agent autonomy level.",
  "Any future approval must be written to the Action Ledger before execution begins.",
  "Human review is required before any decision derived from this packet may proceed.",
];

// ---------------------------------------------------------------------------
// Decision mapping
// ---------------------------------------------------------------------------

const DECISION_MAP: Record<AgentOutcomeReviewDecision, AgentReviewApprovalPacketDecision> = {
  eligible_for_controlled_expansion: "approve_controlled_expansion_review",
  continue_monitoring: "approve_continue_monitoring",
  improve_knowledge_pack: "approve_knowledge_pack_improvement_review",
  require_more_observations: "approve_more_observation_collection",
  reduce_autonomy_recommendation: "reject_or_reduce_autonomy",
  block_autonomy_increase: "block_autonomy_increase",
};

// ---------------------------------------------------------------------------
// Status derivation
// ---------------------------------------------------------------------------

function deriveStatus(
  priority: AgentReviewPriority,
  riskFlags: AgentOutcomeReviewRiskFlag[],
): AgentReviewApprovalPacketStatus {
  const hasInsufficientEvidence =
    riskFlags.includes("insufficient_reviewed_outputs") ||
    riskFlags.includes("invalid_observation") ||
    riskFlags.includes("missing_scorecard");

  if (hasInsufficientEvidence) {
    return "blocked_pending_more_evidence";
  }
  if (priority === "critical" || priority === "high") {
    return "ready_for_human_review";
  }
  return "draft_for_human_review";
}

// ---------------------------------------------------------------------------
// Risk summary
// ---------------------------------------------------------------------------

const CRITICAL_RISK_FLAGS: ReadonlySet<AgentOutcomeReviewRiskFlag> = new Set([
  "high_guardrail_violations",
  "high_or_critical_risk",
]);

const HIGH_RISK_FLAGS: ReadonlySet<AgentOutcomeReviewRiskFlag> = new Set([
  "failed_outcome",
  "low_quality_score",
  "agent_not_in_catalog",
]);

function deriveRiskLevel(
  priority: AgentReviewPriority,
  riskFlags: AgentOutcomeReviewRiskFlag[],
): AgentReviewRiskSummaryLevel {
  if (
    priority === "critical" ||
    riskFlags.some((f) => CRITICAL_RISK_FLAGS.has(f))
  ) {
    return "critical";
  }
  if (priority === "high") {
    return "high";
  }
  if (riskFlags.some((f) => HIGH_RISK_FLAGS.has(f))) {
    return "elevated";
  }
  if (priority === "medium") {
    return "moderate";
  }
  return "low";
}

function buildRiskSummary(
  priority: AgentReviewPriority,
  riskFlags: AgentOutcomeReviewRiskFlag[],
): AgentReviewApprovalRiskSummary {
  return {
    level: deriveRiskLevel(priority, riskFlags),
    riskFlagCount: riskFlags.length,
    riskFlags: [...riskFlags],
    requiresHumanApproval: true,
    requiresLedgerBeforeExecution: true,
  };
}

// ---------------------------------------------------------------------------
// Required review
// ---------------------------------------------------------------------------

function deriveRequiredReview(
  priority: AgentReviewPriority,
  riskFlags: AgentOutcomeReviewRiskFlag[],
): AgentReviewRequiredReview {
  if (
    riskFlags.includes("insufficient_reviewed_outputs") ||
    riskFlags.includes("missing_scorecard") ||
    riskFlags.includes("invalid_observation")
  ) {
    return "more_evidence_required";
  }
  if (priority === "critical" || priority === "high") {
    return "ceo_review_required";
  }
  if (priority === "medium") {
    return "operator_review_required";
  }
  return "routine_review_required";
}

function buildRequiredReview(
  priority: AgentReviewPriority,
  riskFlags: AgentOutcomeReviewRiskFlag[],
): AgentReviewApprovalRequirement {
  return {
    requiredReview: deriveRequiredReview(priority, riskFlags),
    approvalRequired: true,
    noAutoApproval: true,
    ledgerEntryRequiredBeforeExecution: true,
  };
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

/**
 * Converts an AgentReviewQueueItem into an AgentReviewApprovalPacket.
 *
 * The packet prepares a human decision. It does not approve, execute, persist,
 * or mutate anything. Deterministic, pure, no I/O. Caller must supply
 * `createdAt` — the builder never calls Date.now().
 */
export function buildAgentReviewApprovalPacket(
  input: BuildAgentReviewApprovalPacketInput,
): AgentReviewApprovalPacket {
  const { queueItem, createdAt, expiresAt } = input;

  const riskSummary = buildRiskSummary(queueItem.priority, queueItem.riskFlags);
  const requiredReview = buildRequiredReview(queueItem.priority, queueItem.riskFlags);
  const status = deriveStatus(queueItem.priority, queueItem.riskFlags);

  const packet: AgentReviewApprovalPacket = {
    packetId: `packet-${queueItem.queueItemId}`,
    queueItemId: queueItem.queueItemId,
    agentId: queueItem.agentId,
    outcomeId: queueItem.outcomeId,
    priority: queueItem.priority,
    status,
    requestedDecision: DECISION_MAP[queueItem.decision],
    sourceDecision: queueItem.decision,
    sourceNextAction: queueItem.nextAction,
    riskSummary,
    requiredReview,
    rationale: [...queueItem.rationale],
    executiveSummary: queueItem.executiveSummary,
    guardrails: [...APPROVAL_PACKET_GUARDRAILS],
    approvalRequired: true,
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
    createdAt,
  };

  if (expiresAt !== undefined) {
    packet.expiresAt = expiresAt;
  }

  return packet;
}
