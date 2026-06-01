import { buildAgentAutonomyCockpit } from "./agent-autonomy-cockpit";
import { buildAgentKnowledgePackCatalog } from "./agent-knowledge-packs";
import {
  buildAgentReviewApprovalEvent,
  type AgentReviewApprovalEvent,
} from "./agent-review-approval-event";
import {
  buildAgentReviewApprovalPacket,
  type AgentReviewApprovalPacket,
} from "./agent-review-approval-packet";
import {
  buildAgentQualityEvaluation,
  type AgentQualityEvaluationModel,
} from "./agent-quality-evaluation";
import {
  buildAgentReviewQueue,
  type AgentReviewQueue,
  type AgentReviewQueueItem,
} from "./agent-review-queue";
import { buildObservedAgentOutcomeReviewRecommendation } from "./observed-agent-outcome-review";
import type { ObservedAgentOutcomeEvaluation } from "./observed-agent-outcome";

// ---------------------------------------------------------------------------
// Cockpit review signal — the single source of truth for the live review
// queue shown on the cockpit and the agents page.
//
// It runs the existing governance chain (autonomy → knowledge packs → quality
// scorecards → outcome recommendation → review queue) and adds a compact
// "attention" summary for cockpit surfaces. Pure, deterministic, read-only:
// no DB, no Supabase, no network, no runtime execution. The caller supplies
// `createdAt` so the builders stay free of Date.now().
// ---------------------------------------------------------------------------

/** Inputs needed to run the governance chain (agents + skills + policy). */
type AutonomyChainInput = Parameters<typeof buildAgentAutonomyCockpit>[0];

export interface CockpitReviewAttention {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  /** True when at least one item is critical or high — i.e. needs the human now. */
  needsAttention: boolean;
  /** Highest-priority items first (queue is already sorted critical → low). */
  topItems: AgentReviewQueueItem[];
}

export interface CockpitApprovalPreviewItem {
  queueItem: AgentReviewQueueItem;
  packet: AgentReviewApprovalPacket;
  approvalEventPreview: AgentReviewApprovalEvent;
  previewStatus: "read_only_preview";
  futureLedgerRequired: true;
  runtimeBlocked: true;
}

export interface CockpitApprovalPreview {
  totalPreviewed: number;
  items: CockpitApprovalPreviewItem[];
  approvalRequired: true;
  humanOnTheLoop: true;
  noAutoApproval: true;
  approvalEventOnly: true;
  ledgerRequiredBeforeExecution: true;
  noRuntimeExecutionAuthorized: true;
}

export interface CockpitReviewSignal {
  reviewQueue: AgentReviewQueue;
  attention: CockpitReviewAttention;
  approvalPreview: CockpitApprovalPreview;
}

export interface ReviewQueueFromQualityInput {
  qualityEvaluation: AgentQualityEvaluationModel;
  /** ISO timestamp. Caller-provided — keeps the pure builders deterministic. */
  createdAt: string;
}

/**
 * Maps quality scorecards to deterministic evaluation stubs, derives a
 * governance recommendation for each, and builds the prioritized review queue.
 * This is the exact derivation the agents page used inline, extracted so the
 * cockpit and the agents page share one implementation and cannot drift.
 */
export function reviewQueueFromQualityEvaluation(
  input: ReviewQueueFromQualityInput,
): AgentReviewQueue {
  const { qualityEvaluation, createdAt } = input;

  const items = qualityEvaluation.scorecards.map((scorecard) => {
    const evaluation: ObservedAgentOutcomeEvaluation = {
      status: "evaluated",
      outcomeId: `scorecard-${scorecard.agentId}`,
      agentId: scorecard.agentId,
      outcomeStatus: "completed",
      riskLevel: "low",
      validation: { valid: true, errors: [] },
      observation: {
        agentId: scorecard.agentId,
        realizedProfitCents: scorecard.realizedProfitCents ?? 0,
        ceoMinutesSaved: scorecard.ceoMinutesSaved ?? 0,
        guardrailViolations: scorecard.guardrailViolations ?? 0,
        usefulOutputs: scorecard.usefulOutputs ?? 0,
        reviewedOutputs: scorecard.reviewedOutputs ?? 0,
      },
      scorecard,
      evaluation: qualityEvaluation,
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
    };
    const recommendation = buildObservedAgentOutcomeReviewRecommendation(evaluation);
    return { evaluation, recommendation };
  });

  return buildAgentReviewQueue({ items, createdAt });
}

function summarizeAttention(queue: AgentReviewQueue): CockpitReviewAttention {
  return {
    total: queue.totalItems,
    critical: queue.criticalItems,
    high: queue.highItems,
    medium: queue.mediumItems,
    low: queue.lowItems,
    needsAttention: queue.criticalItems + queue.highItems > 0,
    topItems: queue.items.slice(0, 3),
  };
}

export interface BuildCockpitApprovalPreviewInput {
  reviewQueue: AgentReviewQueue;
  /** ISO timestamp. Caller-provided — keeps the pure builders deterministic. */
  createdAt: string;
  /** ISO timestamp. Caller-provided; approved event previews require expiry. */
  approvalEventExpiresAt: string;
}

export function buildCockpitApprovalPreview(
  input: BuildCockpitApprovalPreviewInput,
): CockpitApprovalPreview {
  const items = input.reviewQueue.items.slice(0, 2).map((queueItem) => {
    const packet = buildAgentReviewApprovalPacket({
      queueItem,
      createdAt: input.createdAt,
      expiresAt: input.approvalEventExpiresAt,
    });
    const approvalEventPreview = buildAgentReviewApprovalEvent({
      packet,
      reviewerId: "preview-ceo",
      reviewerRole: "ceo",
      decision: "approved",
      decisionRationale: [
        "Read-only human decision preview; no ledger write or runtime execution is authorized.",
      ],
      createdAt: input.createdAt,
      expiresAt: input.approvalEventExpiresAt,
      constraints: [
        {
          id: "preview-only",
          description: "Preview only; future execution requires a separate ledgered action.",
        },
      ],
    });

    return {
      queueItem,
      packet,
      approvalEventPreview,
      previewStatus: "read_only_preview" as const,
      futureLedgerRequired: true as const,
      runtimeBlocked: true as const,
    };
  });

  return {
    totalPreviewed: items.length,
    items,
    approvalRequired: true,
    humanOnTheLoop: true,
    noAutoApproval: true,
    approvalEventOnly: true,
    ledgerRequiredBeforeExecution: true,
    noRuntimeExecutionAuthorized: true,
  };
}

export interface BuildCockpitReviewSignalInput extends AutonomyChainInput {
  /** ISO timestamp. Caller-provided — keeps the pure builders deterministic. */
  createdAt: string;
  /** ISO timestamp. Caller-provided; approved event previews require expiry. */
  approvalEventExpiresAt: string;
}

/**
 * Runs the full governance chain from agents + skills + policy and returns the
 * review queue plus an attention summary for the cockpit. Deterministic given
 * identical inputs; performs no I/O.
 */
export function buildCockpitReviewSignal(
  input: BuildCockpitReviewSignalInput,
): CockpitReviewSignal {
  const { agents, skills, policy, createdAt, approvalEventExpiresAt } = input;

  const autonomyCockpit = buildAgentAutonomyCockpit({ agents, skills, policy });
  const knowledgeCatalog = buildAgentKnowledgePackCatalog({ agents, skills });
  const qualityEvaluation = buildAgentQualityEvaluation({
    knowledgeCatalog,
    autonomyCockpit,
  });

  const reviewQueue = reviewQueueFromQualityEvaluation({ qualityEvaluation, createdAt });
  const approvalPreview = buildCockpitApprovalPreview({
    reviewQueue,
    createdAt,
    approvalEventExpiresAt,
  });

  return { reviewQueue, attention: summarizeAttention(reviewQueue), approvalPreview };
}
