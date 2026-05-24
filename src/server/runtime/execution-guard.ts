import type { Mission } from "@/core/types";
import { agentRegistry } from "@/features/agents/seed";
import type { AgentProfile } from "@/features/agents/types";
import type { LedgerEventType, SkillProfile, SkillSideEffect } from "@/features/skills/types";
import { skillsCatalog } from "@/features/skills/seed";

export type ExecutionMode = "read-only" | "dry-run";

export type ExecutionAutonomyLevel = 1 | 2 | 3;

export type ExecutionRiskClass = "read-only" | "internal-draft" | "effectful" | "external" | "unknown";

export type ExecutionGuardRejectedCode =
  | "LIVE_MODE_NOT_SUPPORTED"
  | "AUTONOMY_LEVEL_TOO_HIGH"
  | "EFFECTFUL_SKILL_REQUIRES_APPROVAL"
  | "APPROVAL_SOURCE_NOT_TRUSTED"
  | "UNSUPPORTED_SKILL"
  | "LEDGER_REQUIRED_FOR_EFFECT";

export type ExecutionDecision =
  | {
      allowed: true;
      mode: ExecutionMode;
      reason: string;
      dryRun: true;
    }
  | {
      allowed: false;
      reason: string;
      code: ExecutionGuardRejectedCode;
    };

export type ExecutionGuardInput = {
  skillId: string;
  agentId: string;
  requestedMode: ExecutionMode | "live";
  autonomyLevel: number;
  /** Trusted approval is not used in PR6, but can be supplied by server-side code later. */
  approvalConfirmed?: boolean;
  /** Any client-supplied approval state is rejected outright. */
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

function buildBlockedDecision(code: ExecutionGuardRejectedCode, reason: string): ExecutionDecision {
  return { allowed: false, code, reason };
}

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

export function canPrepareExecution(input: ExecutionGuardInput): ExecutionDecision {
  if (input.approvalConfirmed !== undefined || input.clientApprovalConfirmed !== undefined) {
    return buildBlockedDecision(
      "APPROVAL_SOURCE_NOT_TRUSTED",
      "Client-supplied approval state is not trusted for controlled execution.",
    );
  }

  if (input.requestedMode === "live") {
    return buildBlockedDecision(
      "LIVE_MODE_NOT_SUPPORTED",
      "Live execution is not available in PR6.",
    );
  }

  if (!Number.isInteger(input.autonomyLevel) || input.autonomyLevel < 1 || input.autonomyLevel > 3) {
    return buildBlockedDecision(
      "AUTONOMY_LEVEL_TOO_HIGH",
      "Execution guard only allows autonomy levels 1 through 3.",
    );
  }

  const agent = resolveAgent(input.agentId);
  if (!agent) {
    return buildBlockedDecision(
      "UNSUPPORTED_SKILL",
      `Unknown agent: ${input.agentId}.`,
    );
  }

  const skill = resolveSkill(input.skillId);
  if (!skill || !supportsExecution(skill) || !agent.skillIds.includes(skill.id)) {
    return buildBlockedDecision(
      "UNSUPPORTED_SKILL",
      `Skill ${input.skillId} is not available to agent ${input.agentId}.`,
    );
  }

  if (input.mission && input.mission.assignedAgentId !== input.agentId) {
    return buildBlockedDecision(
      "UNSUPPORTED_SKILL",
      `Mission ${input.mission.id} is assigned to ${input.mission.assignedAgentId}, not ${input.agentId}.`,
    );
  }

  const risk = classifyExecutionRisk(skill);
  if (risk === "effectful" || risk === "external") {
    return buildBlockedDecision(
      "EFFECTFUL_SKILL_REQUIRES_APPROVAL",
      `Skill ${skill.id} is ${risk} and is rejected in read-only/dry-run PR6.`,
    );
  }

  return {
    allowed: true,
    mode: input.requestedMode,
    reason: risk === "internal-draft"
      ? `Skill ${skill.id} can be prepared as an internal draft in ${input.requestedMode} mode.`
      : `Skill ${skill.id} is read-only and can be prepared in ${input.requestedMode} mode.`,
    dryRun: true,
  };
}

export function assertExecutionAllowed(input: ExecutionGuardInput): void {
  const decision = canPrepareExecution(input);

  if (!decision.allowed) {
    throw new ExecutionGuardError(decision.reason, decision.code, decision);
  }
}

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
      description: "Validate agent, skill, autonomy, and approval source.",
      expectedOutcome: decision.allowed ? "Execution can proceed in dry-run only." : decision.reason,
      ledgerEventsIfLive: ["decision"],
    },
    {
      stepId: "execution.preview",
      description: decision.allowed
        ? `Prepare ${skill?.id ?? input.skillId} as a ${input.requestedMode} preview.`
        : `Block ${input.skillId} before any side effect can occur.`,
      expectedOutcome: decision.allowed
        ? "Ephemeral preview only. No write, no external call, no persisted state."
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
