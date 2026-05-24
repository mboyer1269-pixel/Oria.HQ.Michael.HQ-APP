import type { AutonomyLevel } from "@/core/types";
import type { AgentRoleId } from "@/features/agents/types";
import type { LedgerEventType, SkillIOSpec, SkillProfile, SkillSideEffect } from "./types";

export type SkillGovernanceIssue = {
  skillId?: string;
  code: string;
  message: string;
};

export type SkillGovernanceResult = {
  valid: boolean;
  issues: SkillGovernanceIssue[];
};

export type SkillGovernanceOptions = {
  /** Agent roles considered valid executors. Defaults to the canonical role set. */
  knownRoles?: readonly AgentRoleId[];
};

const AUTONOMY_MIN = 0;
const AUTONOMY_MAX = 5;

const KNOWN_AGENT_ROLES: readonly AgentRoleId[] = [
  "orchestrator",
  "operator",
  "scout",
  "auditor",
  "memory",
  "money",
  "builder",
  "closer",
];

const KNOWN_SIDE_EFFECTS: readonly SkillSideEffect[] = [
  "none",
  "internal-draft",
  "reversible-write",
  "irreversible-external",
];

const KNOWN_LEDGER_EVENTS: readonly LedgerEventType[] = [
  "decision",
  "action",
  "result",
  "cost",
  "learning",
];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidAutonomyLevel(value: unknown): value is AutonomyLevel {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= AUTONOMY_MIN &&
    value <= AUTONOMY_MAX
  );
}

function pushIssue(
  issues: SkillGovernanceIssue[],
  skillId: string | undefined,
  code: string,
  message: string,
): void {
  issues.push({ skillId, code, message });
}

function validateIoSpec(
  issues: SkillGovernanceIssue[],
  skillId: string,
  direction: "input" | "output",
  spec: SkillIOSpec,
  index: number,
): void {
  const prefix = `${direction}[${index}]`;

  if (!isNonEmptyString(spec.name)) {
    pushIssue(issues, skillId, "IO_NAME_REQUIRED", `${prefix}: name is required`);
  }

  if (!isNonEmptyString(spec.type)) {
    pushIssue(issues, skillId, "IO_TYPE_REQUIRED", `${prefix}: type is required`);
  }
}

export function validateSkillProfile(
  skill: SkillProfile,
  options: SkillGovernanceOptions = {},
): SkillGovernanceIssue[] {
  const issues: SkillGovernanceIssue[] = [];
  const knownRoles = new Set<AgentRoleId>(options.knownRoles ?? KNOWN_AGENT_ROLES);

  if (!isNonEmptyString(skill.id)) {
    pushIssue(issues, skill.id, "ID_REQUIRED", "Skill id is required");
  }

  if (!isNonEmptyString(skill.label)) {
    pushIssue(issues, skill.id, "LABEL_REQUIRED", "Skill label is required");
  }

  if (!isNonEmptyString(skill.description)) {
    pushIssue(issues, skill.id, "DESCRIPTION_REQUIRED", "Skill description is required");
  }

  if (!isValidAutonomyLevel(skill.autonomyLevel)) {
    pushIssue(
      issues,
      skill.id,
      "AUTONOMY_OUT_OF_RANGE",
      `autonomyLevel must be an integer between ${AUTONOMY_MIN} and ${AUTONOMY_MAX}`,
    );
  }

  if (!Array.isArray(skill.assignedRoles) || skill.assignedRoles.length === 0) {
    pushIssue(issues, skill.id, "ASSIGNED_ROLES_REQUIRED", "At least one assigned role is required");
  } else {
    for (const role of skill.assignedRoles) {
      if (!knownRoles.has(role)) {
        pushIssue(issues, skill.id, "INVALID_ASSIGNED_ROLE", `Unknown assigned role: ${role}`);
      }
    }
  }

  if (!Array.isArray(skill.inputs) || skill.inputs.length === 0) {
    pushIssue(issues, skill.id, "INPUTS_REQUIRED", "At least one input spec is required");
  } else {
    skill.inputs.forEach((spec, index) => validateIoSpec(issues, skill.id, "input", spec, index));
  }

  if (!Array.isArray(skill.outputs) || skill.outputs.length === 0) {
    pushIssue(issues, skill.id, "OUTPUTS_REQUIRED", "At least one output spec is required");
  } else {
    skill.outputs.forEach((spec, index) => validateIoSpec(issues, skill.id, "output", spec, index));
  }

  if (!KNOWN_SIDE_EFFECTS.includes(skill.sideEffects)) {
    pushIssue(issues, skill.id, "INVALID_SIDE_EFFECT", `Unknown sideEffects value: ${skill.sideEffects}`);
  }

  if (typeof skill.canWriteDB !== "boolean") {
    pushIssue(issues, skill.id, "CAN_WRITE_DB_REQUIRED", "canWriteDB must be a boolean");
  }

  if (typeof skill.canTriggerExternal !== "boolean") {
    pushIssue(issues, skill.id, "CAN_TRIGGER_EXTERNAL_REQUIRED", "canTriggerExternal must be a boolean");
  }

  if (typeof skill.requiresHumanApproval !== "boolean") {
    pushIssue(
      issues,
      skill.id,
      "REQUIRES_HUMAN_APPROVAL_REQUIRED",
      "requiresHumanApproval must be a boolean",
    );
  }

  if (!Array.isArray(skill.logsRequired)) {
    pushIssue(issues, skill.id, "LOGS_REQUIRED_ARRAY", "logsRequired must be an array");
  } else {
    for (const eventType of skill.logsRequired) {
      if (!KNOWN_LEDGER_EVENTS.includes(eventType)) {
        pushIssue(issues, skill.id, "INVALID_LEDGER_EVENT", `Unknown ledger event type: ${eventType}`);
      }
    }
  }

  if (
    !Array.isArray(skill.testsRequired) ||
    skill.testsRequired.length === 0 ||
    !skill.testsRequired.some(isNonEmptyString)
  ) {
    pushIssue(
      issues,
      skill.id,
      "TESTS_REQUIRED",
      "At least one non-empty test criterion is required",
    );
  }

  if (skill.sideEffects === "irreversible-external" && !skill.requiresHumanApproval) {
    pushIssue(
      issues,
      skill.id,
      "EXTERNAL_REQUIRES_APPROVAL",
      "irreversible-external side effects require human approval",
    );
  }

  if (skill.canTriggerExternal && !skill.requiresHumanApproval) {
    pushIssue(
      issues,
      skill.id,
      "EXTERNAL_TRIGGER_REQUIRES_APPROVAL",
      "canTriggerExternal=true requires requiresHumanApproval=true",
    );
  }

  if (skill.canWriteDB && skill.logsRequired.length === 0) {
    pushIssue(
      issues,
      skill.id,
      "DB_WRITE_REQUIRES_LEDGER",
      "canWriteDB=true requires at least one logsRequired entry",
    );
  }

  return issues;
}

export function validateSkillsCatalog(
  catalog: SkillProfile[],
  options: SkillGovernanceOptions = {},
): SkillGovernanceResult {
  const issues: SkillGovernanceIssue[] = [];
  const seenIds = new Set<string>();

  for (const skill of catalog) {
    if (isNonEmptyString(skill.id)) {
      if (seenIds.has(skill.id)) {
        pushIssue(issues, skill.id, "DUPLICATE_ID", `Duplicate skill id: ${skill.id}`);
      } else {
        seenIds.add(skill.id);
      }
    }

    issues.push(...validateSkillProfile(skill, options));
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
