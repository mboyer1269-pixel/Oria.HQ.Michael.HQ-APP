import type { AgentProfile } from "./types";
import {
  evaluateSkillAutonomy,
  summarizeAgentAutonomyPolicy,
  type AgentAutonomyPolicy,
  type AgentAutonomyDecision,
  type AgentCapabilityRiskTier,
} from "./autonomy-policy";
import type { SkillProfile, SkillSideEffect, SkillStatus } from "@/features/skills/types";

export interface AgentSkillAutonomyItem {
  id: string;
  label: string;
  status: SkillStatus;
  sideEffects: SkillSideEffect;
  decision: AgentAutonomyDecision;
  riskTier: AgentCapabilityRiskTier | "unknown";
  reason: string;
}

export interface AgentBlockedCapabilityItem {
  id: string;
  label: string;
  description: string;
  blockedActions: string[];
}

export interface AgentAutonomyCockpitRow {
  id: string;
  name: string;
  status: AgentProfile["status"];
  role: AgentProfile["role"];
  autonomyLevel: AgentProfile["autonomyLevel"];
  autonomousSkills: AgentSkillAutonomyItem[];
  approvalRequiredSkills: AgentSkillAutonomyItem[];
  blockedSkills: AgentSkillAutonomyItem[];
  missingSkillIds: string[];
  modelProviderLockIn: false;
  noExecutionAuthorized: true;
}

export interface AgentAutonomyCockpitSummary {
  totalCapabilities: number;
  autonomousCapabilities: number;
  approvalRequiredCapabilities: number;
  blockedCapabilities: number;
  maxSafeAutonomyLevel: AgentProfile["autonomyLevel"];
  modelProviderLockIn: false;
  providerModeLabel: "Approved provider pool";
}

export interface AgentAutonomyCockpitModel {
  summary: AgentAutonomyCockpitSummary;
  agents: AgentAutonomyCockpitRow[];
  blockedCapabilities: AgentBlockedCapabilityItem[];
}

export interface BuildAgentAutonomyCockpitInput {
  agents: AgentProfile[];
  skills: SkillProfile[];
  policy: AgentAutonomyPolicy;
}

function toSkillItem(skill: SkillProfile, decision: ReturnType<typeof evaluateSkillAutonomy>): AgentSkillAutonomyItem {
  return {
    id: skill.id,
    label: skill.label,
    status: skill.status,
    sideEffects: skill.sideEffects,
    decision: decision.decision,
    riskTier: decision.riskTier,
    reason: decision.reason,
  };
}

function createAgentRow(
  agent: AgentProfile,
  skillsById: Map<string, SkillProfile>,
  policy: AgentAutonomyPolicy,
): AgentAutonomyCockpitRow {
  const autonomousSkills: AgentSkillAutonomyItem[] = [];
  const approvalRequiredSkills: AgentSkillAutonomyItem[] = [];
  const blockedSkills: AgentSkillAutonomyItem[] = [];
  const missingSkillIds: string[] = [];

  for (const skillId of agent.skillIds) {
    const skill = skillsById.get(skillId);
    if (!skill) {
      missingSkillIds.push(skillId);
      continue;
    }

    const decision = evaluateSkillAutonomy(policy, skill);
    const item = toSkillItem(skill, decision);

    if (decision.decision === "allowed_autonomous") {
      autonomousSkills.push(item);
    } else if (decision.decision === "blocked") {
      blockedSkills.push(item);
    } else {
      approvalRequiredSkills.push(item);
    }
  }

  return {
    id: agent.id,
    name: agent.name,
    status: agent.status,
    role: agent.role,
    autonomyLevel: agent.autonomyLevel,
    autonomousSkills,
    approvalRequiredSkills,
    blockedSkills,
    missingSkillIds,
    modelProviderLockIn: false,
    noExecutionAuthorized: true,
  };
}

export function buildAgentAutonomyCockpit(
  input: BuildAgentAutonomyCockpitInput,
): AgentAutonomyCockpitModel {
  const skillsById = new Map(input.skills.map((skill) => [skill.id, skill]));
  const policySummary = summarizeAgentAutonomyPolicy(input.policy);

  return {
    summary: {
      ...policySummary,
      providerModeLabel: "Approved provider pool",
    },
    agents: input.agents.map((agent) => createAgentRow(agent, skillsById, input.policy)),
    blockedCapabilities: input.policy.capabilities
      .filter((capability) => capability.decision === "blocked")
      .map((capability) => ({
        id: capability.id,
        label: capability.label,
        description: capability.description,
        blockedActions: [...capability.blockedActions],
      })),
  };
}
