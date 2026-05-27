import type { AgentProfile, AgentStatus } from "@/features/agents/types";
import type { SkillProfile, SkillSideEffect, SkillStatus } from "@/features/skills/types";
import type { ExecutionGuardRejectedCode } from "@/server/runtime/execution-guard";

export type AgentSnapshotCounts = Record<AgentStatus, number>;
export type SkillStatusCounts = Record<SkillStatus, number>;
export type SkillSideEffectCounts = Record<SkillSideEffect, number>;

export const OPERATOR_GUARDRAIL_CODES: ExecutionGuardRejectedCode[] = [
  "LIVE_MODE_NOT_SUPPORTED",
  "APPROVAL_SOURCE_NOT_TRUSTED",
  "EFFECTFUL_SKILL_REQUIRES_APPROVAL",
  "UNSUPPORTED_SKILL",
  "LEDGER_REQUIRED_FOR_EFFECT",
];

export function countAgentsByStatus(agents: AgentProfile[]): AgentSnapshotCounts {
  return agents.reduce<AgentSnapshotCounts>(
    (counts, agent) => {
      counts[agent.status] += 1;
      return counts;
    },
    {
      active: 0,
      standby: 0,
      planned: 0,
      locked: 0,
    },
  );
}

export function countSkillsByStatus(skills: SkillProfile[]): SkillStatusCounts {
  return skills.reduce<SkillStatusCounts>(
    (counts, skill) => {
      counts[skill.status] += 1;
      return counts;
    },
    {
      active: 0,
      partial: 0,
      planned: 0,
    },
  );
}

export function countSkillsBySideEffect(skills: SkillProfile[]): SkillSideEffectCounts {
  return skills.reduce<SkillSideEffectCounts>(
    (counts, skill) => {
      counts[skill.sideEffects] += 1;
      return counts;
    },
    {
      none: 0,
      "internal-draft": 0,
      "reversible-write": 0,
      "irreversible-external": 0,
    },
  );
}

export function calendarBookRequiresDecisionAndAction(skills: SkillProfile[]): boolean {
  const calendarBook = skills.find((skill) => skill.id === "calendar.book");
  return Boolean(
    calendarBook?.logsRequired.includes("decision") &&
      calendarBook.logsRequired.includes("action"),
  );
}
