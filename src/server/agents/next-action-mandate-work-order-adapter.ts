// src/server/agents/next-action-mandate-work-order-adapter.ts

/**
 * Pure adapter from Next Action Mandate to a local Work Order planning proposal.
 *
 * This adapter preserves entrepreneurial initiative while staying planning-only:
 * it can turn accepted, refuted, ignored, or counter-proposed mandates into the
 * next internal planning object, but it never authorizes runtime execution.
 */

import type { WorkOrderAutonomyEnvelope } from "./work-order-autonomy-envelope-contract";
import { buildDefaultAutonomyEnvelope } from "./work-order-autonomy-envelope-builder";
import {
  mandateRequiresCeoApproval,
  NextActionMandate,
  NextActionMandateStatus,
  validateNextActionMandate,
} from "./next-action-mandate-contract";

export type MandateWorkOrderPlanningStatus =
  | "draft_next_work"
  | "ceo_review"
  | "compliance_review"
  | "blocked";

export interface MandateWorkOrderPlan {
  planId: string;
  mandateId: string;
  previousActionId: string;
  workOrderId: string;
  agentId: string;
  recommendedAction: string;
  cashHypothesis: string;
  requiredEvidence: string[];
  planningStatus: MandateWorkOrderPlanningStatus;
  autonomyEnvelope: WorkOrderAutonomyEnvelope;
  requiresCeoApproval: boolean;
  counterProposalApplied: boolean;
  blockedReason?: string;
  createdAt: string;
  humanOnTheLoop: true;
  noExecutionAuthorized: true;
}

export interface BuildMandateWorkOrderPlanInput {
  mandate: NextActionMandate;
  workOrderId?: string;
  createdAt?: string;
}

function stableToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96) || "unknown";
}

function deriveWorkOrderId(mandate: NextActionMandate, override?: string): string {
  return override ?? mandate.workOrderId ?? `work_order_${stableToken(mandate.mandateId)}`;
}

function derivePlanId(mandate: NextActionMandate, workOrderId: string, createdAt: string): string {
  return [
    "mandate_plan",
    stableToken(mandate.mandateId),
    stableToken(workOrderId),
    stableToken(createdAt),
  ].join("_");
}

function derivePlanningStatus(
  mandate: NextActionMandate,
  mandateIsValid: boolean,
): MandateWorkOrderPlanningStatus {
  if (!mandateIsValid) return "blocked";

  if (mandate.status === NextActionMandateStatus.REFUTED) {
    return "ceo_review";
  }

  if (mandate.status === NextActionMandateStatus.IGNORED) {
    return "compliance_review";
  }

  if (mandate.status === NextActionMandateStatus.NEEDS_CEO_DECISION) {
    return "ceo_review";
  }

  return "draft_next_work";
}

function selectRecommendedAction(mandate: NextActionMandate): {
  recommendedAction: string;
  counterProposalApplied: boolean;
} {
  if (
    mandate.status === NextActionMandateStatus.COUNTER_PROPOSED &&
    mandate.counterProposal !== undefined
  ) {
    return {
      recommendedAction: mandate.counterProposal.recommendedAction,
      counterProposalApplied: true,
    };
  }

  return {
    recommendedAction: mandate.recommendedAction,
    counterProposalApplied: false,
  };
}

function deriveRequestedBudget(mandate: NextActionMandate): number | undefined {
  if (
    mandate.status === NextActionMandateStatus.COUNTER_PROPOSED &&
    mandate.counterProposal?.expectedCostCents !== undefined
  ) {
    return mandate.counterProposal.expectedCostCents;
  }

  return mandate.expectedCostCents;
}

function buildPlanningEnvelope(input: {
  mandate: NextActionMandate;
  workOrderId: string;
  planId: string;
  createdAt: string;
}): WorkOrderAutonomyEnvelope {
  const envelope = buildDefaultAutonomyEnvelope({
    workOrderId: input.workOrderId,
    agentId: input.mandate.agentId,
    workOrderType: input.mandate.ventureId === undefined ? "mission" : "venture",
    riskLevel: input.mandate.riskLevel,
    requestedBudget: deriveRequestedBudget(input.mandate),
    createdAt: input.createdAt,
  });

  return {
    ...envelope,
    id: `env_${input.planId}`,
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
    createdAt: input.createdAt,
  };
}

/**
 * Builds a local planning proposal from a Next Action Mandate.
 *
 * The result is deterministic when inputs are deterministic. It may integrate
 * the default autonomy envelope, but preserves noExecutionAuthorized and does
 * not dispatch runtime work, contact people, spend money, publish, deploy, or
 * modify databases.
 */
export function buildMandateWorkOrderPlan(
  input: BuildMandateWorkOrderPlanInput,
): MandateWorkOrderPlan {
  const createdAt = input.createdAt ?? input.mandate.createdAt;
  const workOrderId = deriveWorkOrderId(input.mandate, input.workOrderId);
  const planId = derivePlanId(input.mandate, workOrderId, createdAt);
  const mandateValidation = validateNextActionMandate(
    input.mandate as unknown as Record<string, unknown>,
  );
  const planningStatus = derivePlanningStatus(input.mandate, mandateValidation.valid);
  const { recommendedAction, counterProposalApplied } = selectRecommendedAction(input.mandate);
  const autonomyEnvelope = buildPlanningEnvelope({
    mandate: input.mandate,
    workOrderId,
    planId,
    createdAt,
  });

  const plan: MandateWorkOrderPlan = {
    planId,
    mandateId: input.mandate.mandateId,
    previousActionId: input.mandate.previousActionId,
    workOrderId,
    agentId: input.mandate.agentId,
    recommendedAction,
    cashHypothesis: input.mandate.cashHypothesis,
    requiredEvidence: [...input.mandate.requiredEvidence],
    planningStatus,
    autonomyEnvelope,
    requiresCeoApproval: mandateRequiresCeoApproval(input.mandate),
    counterProposalApplied,
    createdAt,
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
  };

  if (!mandateValidation.valid) {
    plan.blockedReason = mandateValidation.issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.code)
      .join(", ");
  }

  return plan;
}
