// src/server/agents/work-order-governance-plan.ts

/**
 * Pure TypeScript contract and helpers for the Work Order Governance Plan.
 *
 * When a Governance Bundle reaches "approved_to_plan", planning is approved —
 * NOT execution. This module derives a self-contained, dry-run planning
 * representation from the approved Work Order and its Autonomy Envelope:
 *
 *   - every plan step is internal, no-execution work the agent may perform
 *     within the envelope (the "green zone");
 *   - approval-required and blocked actions are surfaced as boundaries, never
 *     as plan steps;
 *   - the plan authorizes nothing. approve_to_plan stays planning-only.
 *
 * This module is intentionally self-contained: it does NOT touch the missions
 * domain, build a runtime plan, or reference any execution path. All helpers
 * are pure — no I/O, no writes, no mutations, no side-effects.
 */

import type { WorkOrder, MissionWorkOrder, VentureWorkOrder } from "./work-order-contract";
import type { WorkOrderGovernanceBundle } from "./work-order-governance-bundle";
import { hasForbiddenGovernanceBundleFields } from "./work-order-governance-bundle";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Every governance plan step is internal, no-execution work. There is
 * deliberately only one kind: a plan never contains a step that requires
 * approval or that is blocked — those are surfaced as boundaries instead.
 */
export type WorkOrderGovernancePlanStepKind = "autonomous_internal";

export interface WorkOrderGovernancePlanStep {
  id: string;
  order: number;
  description: string;
  actor: string;
  kind: WorkOrderGovernancePlanStepKind;
}

export interface WorkOrderGovernancePlan {
  workOrderId: string;
  bundleId: string;
  agentId: string;
  autonomyLevel: string;
  objective: string;
  expectedOutput: string;
  /** Ordered internal, no-execution planning steps (green zone). */
  steps: WorkOrderGovernancePlanStep[];
  /** Actions that would require human approval before they could ever occur. */
  approvalRequiredActions: string[];
  /** Actions that are always blocked. */
  blockedActions: string[];
  /** Always true — the human stays on the loop for this plan. */
  humanOnTheLoop: true;
  /** Always true — a plan authorizes no execution. */
  noExecutionAuthorized: true;
}

// ---------------------------------------------------------------------------
// Validation result types
// ---------------------------------------------------------------------------

export type WorkOrderGovernancePlanIssueSeverity = "error" | "warning";

export interface WorkOrderGovernancePlanIssue {
  code: string;
  message: string;
  path?: string;
  severity: WorkOrderGovernancePlanIssueSeverity;
}

export interface WorkOrderGovernancePlanValidationResult {
  valid: boolean;
  issues: WorkOrderGovernancePlanIssue[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function planIssue(
  code: string,
  message: string,
  severity: WorkOrderGovernancePlanIssueSeverity = "error",
  path?: string,
): WorkOrderGovernancePlanIssue {
  const result: WorkOrderGovernancePlanIssue = { code, message, severity };
  if (path !== undefined) result.path = path;
  return result;
}

function deriveObjective(workOrder: WorkOrder): string {
  if (workOrder.type === "mission") {
    return (workOrder as MissionWorkOrder).objective;
  }
  return (workOrder as VentureWorkOrder).businessIdea;
}

// ---------------------------------------------------------------------------
// Public: isBundleApprovedToPlan
// ---------------------------------------------------------------------------

/**
 * Returns true if the bundle is approved for planning. Only an approved bundle
 * yields a meaningful governance plan.
 *
 * This function is pure — it does not mutate its input.
 */
export function isBundleApprovedToPlan(bundle: WorkOrderGovernanceBundle): boolean {
  return bundle.status === "approved_to_plan";
}

// ---------------------------------------------------------------------------
// Public: buildWorkOrderGovernancePlan
// ---------------------------------------------------------------------------

/**
 * Derives a dry-run governance plan from an approved Governance Bundle.
 *
 * Steps are built from the Work Order's concrete next action, the envelope's
 * allowed autonomous (internal) actions, and a final internal-deliverable step.
 * Approval-required and blocked actions are surfaced as boundaries, never as
 * steps. The plan is fully deterministic and authorizes nothing.
 *
 * This function is pure — it does not mutate its input.
 */
export function buildWorkOrderGovernancePlan(input: {
  bundle: WorkOrderGovernanceBundle;
}): WorkOrderGovernancePlan {
  const { bundle } = input;
  const workOrder = bundle.workOrder;
  const envelope = bundle.autonomyEnvelope;

  const objective = deriveObjective(workOrder);
  const expectedOutput = workOrder.expectedOutput?.description ?? "";
  const agentId = envelope.agentId;

  const steps: WorkOrderGovernancePlanStep[] = [];
  let order = 1;

  // 1) The concrete next action from the Work Order.
  if (workOrder.nextAction?.description) {
    steps.push({
      id: `step_${order}`,
      order,
      description: workOrder.nextAction.description,
      actor: workOrder.nextAction.actor ?? agentId,
      kind: "autonomous_internal",
    });
    order += 1;
  }

  // 2) One internal step per allowed autonomous action (green zone).
  for (const action of envelope.allowedAutonomousActions ?? []) {
    steps.push({
      id: `step_${order}`,
      order,
      description: `Travail interne autonome : ${action}`,
      actor: agentId,
      kind: "autonomous_internal",
    });
    order += 1;
  }

  // 3) A final internal-deliverable step.
  if (expectedOutput) {
    steps.push({
      id: `step_${order}`,
      order,
      description: `Préparer le livrable interne : ${expectedOutput}`,
      actor: agentId,
      kind: "autonomous_internal",
    });
    order += 1;
  }

  return {
    workOrderId: workOrder.id,
    bundleId: bundle.id,
    agentId,
    autonomyLevel: envelope.autonomyLevel,
    objective,
    expectedOutput,
    steps,
    approvalRequiredActions: [...(envelope.approvalRequiredActions ?? [])],
    blockedActions: [...(envelope.blockedActions ?? [])],
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
  };
}

// ---------------------------------------------------------------------------
// Public: validateWorkOrderGovernancePlan
// ---------------------------------------------------------------------------

/**
 * Validates a governance plan for structural correctness and safety invariants:
 * required identifiers, at least one step, every step is internal/no-execution,
 * the Human-on-the-Loop / no-execution flags hold, and there are no forbidden
 * live-execution fields anywhere in the plan.
 *
 * This function is pure — it does not mutate its input.
 */
export function validateWorkOrderGovernancePlan(
  plan: WorkOrderGovernancePlan,
): WorkOrderGovernancePlanValidationResult {
  const issues: WorkOrderGovernancePlanIssue[] = [];

  if (!plan.workOrderId) {
    issues.push(planIssue("missing_work_order_id", "Plan is missing workOrderId"));
  }
  if (!plan.bundleId) {
    issues.push(planIssue("missing_bundle_id", "Plan is missing bundleId"));
  }
  if (!plan.agentId) {
    issues.push(planIssue("missing_agent_id", "Plan is missing agentId"));
  }

  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    issues.push(planIssue("empty_plan", "Plan must contain at least one step", "error", "steps"));
  } else {
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      if (step.kind !== "autonomous_internal") {
        issues.push(planIssue(
          "non_internal_step",
          `Step ${i} has kind "${step.kind}" — plan steps must be internal, no-execution work only`,
          "error",
          `steps[${i}].kind`,
        ));
      }
      if (!step.description) {
        issues.push(planIssue("invalid_step", `Step ${i} is missing a description`, "error", `steps[${i}]`));
      }
    }
  }

  if (plan.humanOnTheLoop !== true) {
    issues.push(planIssue("human_on_the_loop_required", "Plan humanOnTheLoop must be true"));
  }
  if (plan.noExecutionAuthorized !== true) {
    issues.push(planIssue(
      "no_execution_authorized_required",
      "Plan noExecutionAuthorized must be true — a plan authorizes no execution",
    ));
  }

  if (hasForbiddenGovernanceBundleFields(plan)) {
    issues.push(planIssue(
      "forbidden_execution_field",
      "Plan contains forbidden live-execution fields",
    ));
  }

  return {
    valid: issues.filter((i) => i.severity === "error").length === 0,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Public: formatWorkOrderGovernancePlan
// ---------------------------------------------------------------------------

/**
 * Renders a governance plan as a human-readable Markdown card, emphasising that
 * planning is approved but execution is not.
 *
 * This function is pure — it does not mutate its input.
 */
export function formatWorkOrderGovernancePlan(plan: WorkOrderGovernancePlan): string {
  const lines: string[] = [
    `### 🗺️ Plan de planification (dry-run) — approuvé pour planification`,
    ``,
    `- **Work Order** : \`${plan.workOrderId}\``,
    `- **Agent** : \`${plan.agentId}\``,
    `- **Niveau d'autonomie** : ${plan.autonomyLevel}`,
    `- **Objectif** : ${plan.objective || "(non précisé)"}`,
    `- **Livrable attendu** : ${plan.expectedOutput || "(non précisé)"}`,
    ``,
    `#### ✅ Étapes internes planifiées (zone verte, sans exécution)`,
    ...plan.steps.map((s) => `${s.order}. 🟢 ${s.description} — \`${s.actor}\``),
  ];

  if (plan.approvalRequiredActions.length > 0) {
    lines.push(
      ``,
      `#### 🟡 Actions nécessitant une approbation humaine (non incluses dans le plan)`,
      ...plan.approvalRequiredActions.map((a) => `- 🟡 ${a}`),
    );
  }

  if (plan.blockedActions.length > 0) {
    lines.push(
      ``,
      `#### 🔴 Actions bloquées`,
      ...plan.blockedActions.map((a) => `- 🔴 ${a}`),
    );
  }

  lines.push(
    ``,
    `---`,
    `💡 *Human-on-the-Loop : ce plan est une planification interne uniquement. ` +
      `approve_to_plan = planification uniquement, jamais une autorisation d'exécution.*`,
    `🛑 *Aucune action exécutée — aucune exécution live, aucun déploiement, aucune dépense, aucune action externe.*`,
  );

  return lines.join("\n");
}
