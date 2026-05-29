// src/server/agents/work-order-autonomy-envelope-builder.ts

import {
  WorkOrderAutonomyLevel,
  WorkOrderAutonomousAction,
  WorkOrderApprovalRequiredAction,
  WorkOrderBlockedAction,
  WorkOrderEscalationTrigger,
  WorkOrderAutonomyEnvelope,
} from "./work-order-autonomy-envelope-contract";

export interface AutonomyEnvelopeBuilderInput {
  workOrderId: string;
  agentId: string;
  workOrderType?: "mission" | "venture";
  riskLevel?: "low" | "medium" | "high" | "critical";
  approvalGates?: string[];
  businessValueType?: string;
  requestedBudget?: number;
  createdAt?: string;
}

/**
 * Derives the baseline autonomy level based on the risk level.
 * Low risk defaults to autonomous_dry_run.
 * Medium risk defaults to delegated.
 * High/Critical risk defaults to supervised.
 */
export function deriveAutonomyLevel(input: AutonomyEnvelopeBuilderInput): WorkOrderAutonomyLevel {
  const risk = input.riskLevel || "low";
  if (risk === "high" || risk === "critical") {
    return "supervised";
  }
  if (risk === "medium") {
    return "delegated";
  }
  return "autonomous_dry_run";
}

/**
 * Derives the actions that require explicit approval.
 * These are the standard approval-required actions.
 */
export function deriveApprovalRequiredActions(_input: AutonomyEnvelopeBuilderInput): WorkOrderApprovalRequiredAction[] {
  return [
    "publish",
    "send_message",
    "contact_human",
    "spend_money",
    "buy_domain",
    "launch_ads",
    "deploy",
    "schedule_calendar_event",
    "modify_database",
    "connect_external_tool",
  ];
}

/**
 * Derives the strictly blocked actions that are never permitted.
 * These are the standard blocked actions.
 */
export function deriveBlockedActions(_input: AutonomyEnvelopeBuilderInput): WorkOrderBlockedAction[] {
  return [
    "runtime_dispatch",
    "live_execution",
    "bypass_approval",
    "modify_rls",
    "hardcode_secret",
    "delete_records",
    "transfer_money",
    "access_private_data_without_scope",
  ];
}

/**
 * Derives escalation triggers based on requested budget and risk level.
 */
export function deriveEscalationTriggers(input: AutonomyEnvelopeBuilderInput): WorkOrderEscalationTrigger[] {
  const triggers: WorkOrderEscalationTrigger[] = [];

  if (input.requestedBudget !== undefined) {
    triggers.push({
      condition: "budget_limit_reached",
      description: `Requested budget of ${input.requestedBudget} reached or exceeded.`,
      severity: "warning",
    });
  }

  if (input.riskLevel === "high" || input.riskLevel === "critical") {
    triggers.push({
      condition: "high_risk_operation",
      description: `Work Order has a ${input.riskLevel} risk level requiring closer monitoring.`,
      severity: "critical",
    });
  }

  return triggers;
}

/**
 * Creates a valid, pure Autonomy Envelope based on the provided input.
 * Does not mutate the input object.
 */
export function buildDefaultAutonomyEnvelope(input: AutonomyEnvelopeBuilderInput): WorkOrderAutonomyEnvelope {
  const envelopeId = `env_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const allowedAutonomousActions: WorkOrderAutonomousAction[] = [
    "research",
    "analyze",
    "score",
    "summarize",
    "draft",
    "compare",
    "estimate_roi",
    "prepare_options",
    "create_internal_plan",
    "generate_internal_asset",
  ];

  const envelope: WorkOrderAutonomyEnvelope = {
    id: envelopeId,
    workOrderId: input.workOrderId,
    agentId: input.agentId,
    autonomyLevel: deriveAutonomyLevel(input),
    allowedAutonomousActions,
    approvalRequiredActions: deriveApprovalRequiredActions(input),
    blockedActions: deriveBlockedActions(input),
    escalationTriggers: deriveEscalationTriggers(input),
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
    createdAt: input.createdAt || new Date().toISOString(),
  };

  if (input.requestedBudget !== undefined) {
    envelope.budgetLimit = input.requestedBudget;
  }
  if (input.riskLevel) {
    envelope.riskThreshold = input.riskLevel;
  }

  return envelope;
}
