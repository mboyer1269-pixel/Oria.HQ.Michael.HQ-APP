/**
 * Execution Guard -- Sentinelle Policy Engine (PR3)
 *
 * Single gate between an agent action request and actual execution.
 * Every live action must pass through evaluateLiveExecution() or
 * canPrepareExecution() before any side effect can occur.
 *
 * Zone model (from PR1):
 *   green  (AutonomyLevel 1-2) -- live execution allowed, Sentinelle observes
 *   yellow (AutonomyLevel 3-4) -- action prepped, human approval required
 *   red    (AutonomyLevel 0,5) -- unconditionally blocked
 *
 * Backward compatibility:
 *   canPrepareExecution() with requestedMode "dry-run" or "read-only" retains
 *   the existing planning-mode behavior unchanged. All pre-PR3 call sites and
 *   tests continue to work without modification.
 *
 * Safety invariants (never relaxed):
 *   - clientApprovalConfirmed is always rejected.
 *   - Hard-blocked actions (per AgentExecutionLicense) are always blocked.
 *   - Level 0 and level 5 are always red zone (blocked).
 *   - Ledger required for every live green-zone action.
 *   - Sentinelle observes every live action.
 */

import type { AutonomyLevel, ExecutionZone, Mission } from "@/core/types";
import { getExecutionZonePolicy, resolveExecutionZone } from "@/core/types";
import { agentRegistry } from "@/features/agents/seed";
import type { AgentProfile } from "@/features/agents/types";
import type { LedgerEventType, SkillProfile, SkillSideEffect } from "@/features/skills/types";
import { skillsCatalog } from "@/features/skills/seed";
import { canExecuteAutonomously, type AutonomyDecisionReason } from "@/server/agents/autonomy-tier";
import { getAgentLicense } from "@/server/agents/agent-execution-license";

// ---------------------------------------------------------------------------
// Existing types (unchanged -- backward compatible)
// ---------------------------------------------------------------------------

export type ExecutionMode = "read-only" | "dry-run";

export type ExecutionAutonomyLevel = 1 | 2 | 3;

export type ExecutionRiskClass = "read-only" | "internal-draft" | "effectful" | "external" | "unknown";

export type ExecutionGuardRejectedCode =
  | "LIVE_MODE_NOT_SUPPORTED"       // kept for any external reference; no longer emitted by this guard
  | "AUTONOMY_LEVEL_TOO_HIGH"
  | "EFFECTFUL_SKILL_REQUIRES_APPROVAL"
  | "APPROVAL_SOURCE_NOT_TRUSTED"
  | "UNSUPPORTED_SKILL"
  | "LEDGER_REQUIRED_FOR_EFFECT"
  // PR3 additions
  | "HARD_BLOCKED_ACTION"
  | "YELLOW_ZONE_REQUIRES_APPROVAL"
  | "RED_ZONE_BLOCKED";

export type ExecutionDecisionReason =
  | AutonomyDecisionReason
  | "approval_source_not_trusted"
  | "runtime_min_not_met";

export type ExecutionDecision =
  | {
      allowed: true;
      mode: ExecutionMode;
      reasonCode: ExecutionDecisionReason;
      reason: string;
      dryRun: true;
    }
  | {
      /** PR3: green-zone live execution allowed. */
      allowed: true;
      mode: "live";
      zone: "green";
      reasonCode: ExecutionDecisionReason;
      reason: string;
      dryRun: false;
      requiresLedger: true;
      requiresSentinel: true;
    }
  | {
      allowed: false;
      reasonCode: ExecutionDecisionReason;
      reason: string;
      code: ExecutionGuardRejectedCode;
    };

export type ExecutionGuardInput = {
  skillId: string;
  /** Policy action evaluated by the autonomy licence gate. Defaults to skillId for legacy callers. */
  actionId?: string;
  agentId: string;
  requestedMode: ExecutionMode | "live";
  autonomyLevel: number;
  approvalConfirmed?: boolean;
  clientApprovalConfirmed?: boolean;
  mission?: Pick<Mission, "id" | "workspaceId" | "title" | "status" | "autonomyLevel" | "riskLevel" | "assignedAgentId">;
};

export type ExecutionPlanStep = {
  stepId: string;
  description: string;
  expectedOutcome: string;
  ledgerEventsIfLive: LedgerEventType[];
};

export type DryRunExecutionPlan = {
  allowed: boolean;
  dryRun: true;
  decision: ExecutionDecision;
  mode: ExecutionMode | "live";
  reason: string;
  risk: ExecutionRiskClass;
  summary: string;
  skill: {
    id: string;
    label: string;
    status: SkillProfile["status"];
    sideEffects: SkillSideEffect;
  };
  agent: {
    id: string;
    name: string;
    role: AgentProfile["role"];
    autonomyLevel: number;
  };
  mission?: {
    id: string;
    workspaceId: string;
    title: string;
    status: Mission["status"];
    autonomyLevel: number;
    riskLevel: Mission["riskLevel"];
  };
  steps: ExecutionPlanStep[];
  requiredLedgerEventsIfLive: LedgerEventType[];
};

export class ExecutionGuardError extends Error {
  constructor(
    message: string,
    public readonly code: ExecutionGuardRejectedCode,
    public readonly decision: ExecutionDecision,
  ) {
    super(message);
    this.name = "ExecutionGuardError";
  }
}

// ---------------------------------------------------------------------------
// PR3: Sentinelle outcome types
// ---------------------------------------------------------------------------

/** The three possible verdicts from the Sentinelle Policy Engine. */
export type SentinelleOutcome = "ALLOW" | "REQUIRE_APPROVAL" | "BLOCK";

/**
 * A Sentinelle decision is the authoritative verdict on whether a live action
 * can proceed. It is produced by evaluateLiveExecution() and must be checked
 * before any tool executor runs.
 */
export type SentinelleDecision = {
  outcome: SentinelleOutcome;
  zone: ExecutionZone;
  agentId: string;
  actionId: string;
  reasonCode: ExecutionDecisionReason;
  reason: string;
  /** Ledger entry is mandatory for ALLOW outcomes. */
  requiresLedger: boolean;
  /** Sentinelle observes all non-red live actions. */
  requiresSentinel: boolean;
  /** Human must explicitly approve before dispatch (yellow zone). */
  requiresHumanApproval: boolean;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveSkill(skillId: string): SkillProfile | undefined {
  return skillsCatalog.find((skill) => skill.id === skillId);
}

function resolveAgent(agentId: string): AgentProfile | undefined {
  return agentRegistry.find((agent) => agent.id === agentId);
}

function supportsExecution(skill: SkillProfile): boolean {
  return skill.assignedRoles.length > 0;
}

function ledgerEventsForRisk(risk: ExecutionRiskClass): LedgerEventType[] {
  switch (risk) {
    case "read-only":
      return ["decision"];
    case "internal-draft":
      return ["decision", "result"];
    case "effectful":
    case "external":
      return ["decision", "action", "result"];
    case "unknown":
    default:
      return ["decision"];
  }
}

function buildBlockedDecision(
  code: ExecutionGuardRejectedCode,
  reasonCode: ExecutionDecisionReason,
  reason: string,
): ExecutionDecision {
  return { allowed: false, code, reasonCode, reason };
}

function policyActionId(input: ExecutionGuardInput): string {
  return input.actionId ?? input.skillId;
}

function toPolicyAutonomyLevel(requestedLevel: number): AutonomyLevel | undefined {
  if (!Number.isInteger(requestedLevel) || requestedLevel < 0 || requestedLevel > 5) {
    return undefined;
  }

  return requestedLevel as AutonomyLevel;
}

function isHardBlockedByLicense(agentId: string, actionId: string): boolean {
  return getAgentLicense(agentId)?.hardBlocks.includes(actionId) === true;
}

/**
 * Compute the effective autonomy level for a live execution request.
 * Takes the LOWER of agent level, skill level, and requested level to ensure
 * a high-autonomy agent cannot run a high-risk skill unchecked.
 */
function effectiveAutonomyLevel(
  agentLevel: AutonomyLevel,
  skillLevel: AutonomyLevel,
  requestedLevel: number,
): AutonomyLevel {
  const clamped = Math.max(0, Math.min(5, Math.round(requestedLevel))) as AutonomyLevel;
  return Math.min(agentLevel, skillLevel, clamped) as AutonomyLevel;
}

// ---------------------------------------------------------------------------
// Existing public API (backward compatible)
// ---------------------------------------------------------------------------

export function classifyExecutionRisk(skill?: SkillProfile | null): ExecutionRiskClass {
  if (!skill) {
    return "unknown";
  }

  if (skill.canTriggerExternal || skill.sideEffects === "irreversible-external") {
    return "external";
  }

  if (skill.canWriteDB || skill.sideEffects === "reversible-write") {
    return "effectful";
  }

  if (skill.sideEffects === "internal-draft") {
    return "internal-draft";
  }

  if (skill.sideEffects === "none") {
    return "read-only";
  }

  return "unknown";
}

/**
 * Gate for planning-mode and live-mode execution requests.
 *
 * For "dry-run" and "read-only" modes: retains pre-PR3 behavior exactly.
 * For "live" mode: applies zone-based Sentinelle policy.
 *   - green zone  --> allowed: true, mode: "live", dryRun: false
 *   - yellow zone --> allowed: false, code: "YELLOW_ZONE_REQUIRES_APPROVAL"
 *   - red zone    --> allowed: false, code: "RED_ZONE_BLOCKED"
 *   - hard-blocked action --> allowed: false, code: "HARD_BLOCKED_ACTION"
 */
export function canPrepareExecution(input: ExecutionGuardInput): ExecutionDecision {
  // Safety invariant: never trust client-supplied approval state.
  if (input.approvalConfirmed !== undefined || input.clientApprovalConfirmed !== undefined) {
    return buildBlockedDecision(
      "APPROVAL_SOURCE_NOT_TRUSTED",
      "approval_source_not_trusted",
      "Client-supplied approval state is not trusted for controlled execution.",
    );
  }

  // ── Planning modes (dry-run / read-only) -- pre-PR3 behavior unchanged ──
  if (input.requestedMode !== "live") {
    if (!Number.isInteger(input.autonomyLevel) || input.autonomyLevel < 1 || input.autonomyLevel > 3) {
      return buildBlockedDecision(
        "AUTONOMY_LEVEL_TOO_HIGH",
        "requested_level_blocked",
        "Execution guard only allows autonomy levels 1 through 3.",
      );
    }

    const agent = resolveAgent(input.agentId);
    if (!agent) {
      return buildBlockedDecision("UNSUPPORTED_SKILL", "unauthorized_action", `Unknown agent: ${input.agentId}.`);
    }

    const skill = resolveSkill(input.skillId);
    if (!skill || !supportsExecution(skill) || !agent.skillIds.includes(skill.id)) {
      return buildBlockedDecision(
        "UNSUPPORTED_SKILL",
        "unauthorized_action",
        `Skill ${input.skillId} is not available to agent ${input.agentId}.`,
      );
    }

    if (input.mission && input.mission.assignedAgentId !== input.agentId) {
      return buildBlockedDecision(
        "UNSUPPORTED_SKILL",
        "unauthorized_action",
        `Mission ${input.mission.id} is assigned to ${input.mission.assignedAgentId}, not ${input.agentId}.`,
      );
    }

    const risk = classifyExecutionRisk(skill);
    if (risk === "effectful" || risk === "external") {
      return buildBlockedDecision(
        "EFFECTFUL_SKILL_REQUIRES_APPROVAL",
        "action_policy_requires_approval",
        `Skill ${skill.id} is ${risk} and requires approval in planning mode.`,
      );
    }

    return {
      allowed: true,
      mode: input.requestedMode,
      reasonCode: "allowed_by_policy",
      reason:
        risk === "internal-draft"
          ? `Skill ${skill.id} can be prepared as an internal draft in ${input.requestedMode} mode.`
          : `Skill ${skill.id} is read-only and can be prepared in ${input.requestedMode} mode.`,
      dryRun: true,
    };
  }

  // ── Live mode -- PR3 zone-based Sentinelle policy ───────────────────────

  const actionId = policyActionId(input);
  const autonomyDecision = canExecuteAutonomously(
    input.agentId,
    actionId,
    toPolicyAutonomyLevel(input.autonomyLevel),
  );

  if (autonomyDecision.tier === "blocked") {
    const code = isHardBlockedByLicense(input.agentId, actionId)
      ? "HARD_BLOCKED_ACTION"
      : "RED_ZONE_BLOCKED";

    return buildBlockedDecision(
      code,
      autonomyDecision.reasonCode,
      autonomyDecision.blockReason ?? `Action ${actionId} is blocked by autonomy policy.`,
    );
  }

  if (autonomyDecision.tier === "supervised") {
    return buildBlockedDecision(
      "YELLOW_ZONE_REQUIRES_APPROVAL",
      autonomyDecision.reasonCode,
      autonomyDecision.blockReason ?? `Action ${actionId} requires human approval before dispatch.`,
    );
  }

  const agent = resolveAgent(input.agentId);
  if (!agent) {
    return buildBlockedDecision("UNSUPPORTED_SKILL", "unauthorized_action", `Unknown agent: ${input.agentId}.`);
  }

  const skill = resolveSkill(input.skillId);
  if (!skill || !supportsExecution(skill) || !agent.skillIds.includes(skill.id)) {
    return buildBlockedDecision(
      "UNSUPPORTED_SKILL",
      "unauthorized_action",
      `Skill ${input.skillId} is not available to agent ${input.agentId}.`,
    );
  }

  if (input.mission && input.mission.assignedAgentId !== input.agentId) {
    return buildBlockedDecision(
      "UNSUPPORTED_SKILL",
      "unauthorized_action",
      `Mission ${input.mission.id} is assigned to ${input.mission.assignedAgentId}, not ${input.agentId}.`,
    );
  }

  // Effective level = min(agent, skill, requested) -- most conservative wins.
  const effLevel = effectiveAutonomyLevel(
    agent.autonomyLevel as AutonomyLevel,
    skill.autonomyLevel as AutonomyLevel,
    input.autonomyLevel,
  );
  const zone = resolveExecutionZone(effLevel);

  if (zone === "red") {
    return buildBlockedDecision(
      "RED_ZONE_BLOCKED",
      "runtime_min_not_met",
      `Effective autonomy level ${effLevel} is red zone -- action blocked unconditionally.`,
    );
  }

  if (zone === "yellow") {
    return buildBlockedDecision(
      "YELLOW_ZONE_REQUIRES_APPROVAL",
      "runtime_min_not_met",
      `Skill ${skill.id} is yellow zone (level ${effLevel}) -- human approval required before dispatch.`,
    );
  }

  // Green zone: live execution allowed.
  return {
    allowed: true,
    mode: "live",
    zone: "green",
    reasonCode: "allowed_by_policy",
    reason: `Skill ${skill.id} is green zone (level ${effLevel}) for agent ${agent.name}. Sentinelle observes. Ledger required.`,
    dryRun: false,
    requiresLedger: true,
    requiresSentinel: true,
  };
}

export function assertExecutionAllowed(input: ExecutionGuardInput): void {
  const decision = canPrepareExecution(input);

  if (!decision.allowed) {
    throw new ExecutionGuardError(decision.reason, decision.code, decision);
  }
}

// ---------------------------------------------------------------------------
// PR3 primary surface: evaluateLiveExecution()
// ---------------------------------------------------------------------------

/**
 * Primary Sentinelle gate for live execution requests.
 *
 * Call this before any tool executor runs. It returns a SentinelleDecision
 * with outcome ALLOW | REQUIRE_APPROVAL | BLOCK plus the full policy context.
 *
 * ALLOW     --> green zone; agent executes live, ledger entry mandatory.
 * REQUIRE_APPROVAL --> yellow zone; action is prepped, human says GO.
 * BLOCK     --> red zone or hard-blocked; action must not execute.
 */
export function evaluateLiveExecution(input: ExecutionGuardInput): SentinelleDecision {
  // Always force live mode for this function.
  const liveInput: ExecutionGuardInput = { ...input, requestedMode: "live" };
  const actionId = policyActionId(liveInput);
  const decision = canPrepareExecution(liveInput);

  if (decision.allowed) {
    const policy = getExecutionZonePolicy(
      effectiveAutonomyLevel(
        (resolveAgent(input.agentId)?.autonomyLevel ?? 1) as AutonomyLevel,
        (resolveSkill(input.skillId)?.autonomyLevel ?? 1) as AutonomyLevel,
        input.autonomyLevel,
      ),
    );
    return {
      outcome: "ALLOW",
      zone: "green",
      agentId: input.agentId,
      actionId,
      reasonCode: decision.reasonCode,
      reason: decision.reason,
      requiresLedger: policy.requiresLedger,
      requiresSentinel: policy.requiresSentinel,
      requiresHumanApproval: false,
    };
  }

  const code = decision.code;
  if (code === "YELLOW_ZONE_REQUIRES_APPROVAL") {
    return {
      outcome: "REQUIRE_APPROVAL",
      zone: "yellow",
      agentId: input.agentId,
      actionId,
      reasonCode: decision.reasonCode,
      reason: decision.reason,
      requiresLedger: true,
      requiresSentinel: true,
      requiresHumanApproval: true,
    };
  }

  return {
    outcome: "BLOCK",
    zone: "red",
    agentId: input.agentId,
    actionId,
    reasonCode: decision.reasonCode,
    reason: decision.reason,
    requiresLedger: false,
    requiresSentinel: false,
    requiresHumanApproval: false,
  };
}

// ---------------------------------------------------------------------------
// Dry-run plan builder (unchanged -- backward compatible)
// ---------------------------------------------------------------------------

export function buildDryRunExecutionPlan(input: ExecutionGuardInput): DryRunExecutionPlan {
  const decision = canPrepareExecution(input);
  const skill = resolveSkill(input.skillId);
  const agent = resolveAgent(input.agentId);
  const risk = classifyExecutionRisk(skill);
  const requiredLedgerEventsIfLive = ledgerEventsForRisk(risk);
  const mission = input.mission;

  const steps: ExecutionPlanStep[] = [
    {
      stepId: "guard.check",
      description: "Validate agent, skill, autonomy, approval source, and zone.",
      expectedOutcome: decision.allowed ? "Execution can proceed." : decision.reason,
      ledgerEventsIfLive: ["decision"],
    },
    {
      stepId: "execution.preview",
      description: decision.allowed
        ? `Prepare ${skill?.id ?? input.skillId} as a ${input.requestedMode} preview.`
        : `Block ${input.skillId} before any side effect can occur.`,
      expectedOutcome: decision.allowed
        ? "Preview only. No write, no external call, no persisted state."
        : "Rejected before execution preparation.",
      ledgerEventsIfLive: requiredLedgerEventsIfLive,
    },
  ];

  return {
    allowed: decision.allowed,
    dryRun: true,
    decision,
    mode: input.requestedMode,
    reason: decision.reason,
    risk,
    summary: decision.allowed
      ? `${skill?.label ?? input.skillId} prepared for ${input.requestedMode} execution by ${agent?.name ?? input.agentId}.`
      : `${input.skillId} rejected for controlled execution: ${decision.reason}`,
    skill: {
      id: skill?.id ?? input.skillId,
      label: skill?.label ?? input.skillId,
      status: skill?.status ?? "planned",
      sideEffects: skill?.sideEffects ?? "none",
    },
    agent: {
      id: agent?.id ?? input.agentId,
      name: agent?.name ?? input.agentId,
      role: agent?.role ?? "orchestrator",
      autonomyLevel: agent?.autonomyLevel ?? input.autonomyLevel,
    },
    ...(mission
      ? {
          mission: {
            id: mission.id,
            workspaceId: mission.workspaceId,
            title: mission.title,
            status: mission.status,
            autonomyLevel: mission.autonomyLevel,
            riskLevel: mission.riskLevel,
          },
        }
      : {}),
    steps,
    requiredLedgerEventsIfLive,
  };
}
