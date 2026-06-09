import type { AgentProfile, AgentRoleId, AgentStatus, AgentVenture } from "./types";
import type { SkillCategory, SkillProfile } from "@/features/skills/types";

export type AgentKnowledgeSource =
  | "agent_registry"
  | "skills_catalog"
  | "autonomy_policy"
  | "workspace_memory"
  | "action_ledger_summaries";

export type AgentRequiredContextSource = "agent" | "skill" | "governance" | "business";

export interface AgentRequiredContextItem {
  label: string;
  detail: string;
  source: AgentRequiredContextSource;
}

export interface AgentKnowledgePackBlueprint {
  agentId: string;
  agentName: string;
  role: AgentRoleId;
  status: AgentStatus;
  purpose: string;
  operatingContexts: AgentVenture[];
  trustedSources: AgentKnowledgeSource[];
  requiredContext: AgentRequiredContextItem[];
  allowedSkillIds: string[];
  missingSkillIds: string[];
  skillCategories: SkillCategory[];
  successMetrics: string[];
  guardrails: string[];
  reviewCadence: string;
  humanOnTheLoop: true;
  noExecutionAuthorized: true;
  modelProviderLockIn: false;
}

export interface AgentKnowledgePackSummary {
  totalPacks: number;
  activePacks: number;
  standbyPacks: number;
  lockedPacks: number;
  plannedPacks: number;
  packsWithMissingSkills: number;
  noExecutionAuthorized: true;
  modelProviderLockIn: false;
}

export interface AgentKnowledgePackCatalog {
  summary: AgentKnowledgePackSummary;
  packs: AgentKnowledgePackBlueprint[];
}

export interface BuildAgentKnowledgePackCatalogInput {
  agents: AgentProfile[];
  skills: SkillProfile[];
}

const DEFAULT_TRUSTED_SOURCES: AgentKnowledgeSource[] = [
  "agent_registry",
  "skills_catalog",
  "autonomy_policy",
  "workspace_memory",
  "action_ledger_summaries",
];

const DEFAULT_GUARDRAILS = [
  "No live execution without explicit CEO approval.",
  "No spending, publishing, legal commitment, or external contact without approval.",
  "No secret access or credential mutation.",
  "No model-provider lock-in; use the approved provider pool.",
];

const ROLE_SUCCESS_METRICS: Record<AgentRoleId, string[]> = {
  orchestrator: [
    "ceo_decision_latency",
    "approval_gate_accuracy",
    "mission_plan_quality",
  ],
  operator: [
    "sop_reuse_rate",
    "workflow_cycle_time_reduction",
    "execution_readiness_score",
  ],
  scout: [
    "qualified_opportunities_found",
    "time_to_first_dollar_signal",
    "market_signal_quality",
  ],
  auditor: [
    "unsafe_action_catch_rate",
    "guardrail_gap_detection",
    "signoff_quality",
  ],
  memory: [
    "decision_recall_accuracy",
    "ledger_summary_quality",
    "knowledge_reuse_rate",
  ],
  money: [
    "runway_accuracy",
    "ai_cost_visibility",
    "roi_signal_quality",
  ],
  builder: [
    "mvp_scope_clarity",
    "prototype_readiness",
    "technical_risk_reduction",
  ],
  closer: [
    "conversion_copy_quality",
    "pipeline_followup_readiness",
    "approval_safe_outreach_quality",
  ],
};

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function buildSkillContext(skill: SkillProfile): AgentRequiredContextItem {
  const outputConstraint = skill.outputConstraint ? ` Constraint: ${skill.outputConstraint}` : "";

  return {
    label: skill.label,
    detail: `${skill.description}${outputConstraint}`,
    source: "skill",
  };
}

function buildRequiredContext(agent: AgentProfile, matchedSkills: SkillProfile[]): AgentRequiredContextItem[] {
  return [
    {
      label: "Rôle de l'agent",
      detail: agent.description,
      source: "agent",
    },
    {
      label: "Contextes d'opération",
      detail: agent.ventures.join(", "),
      source: "business",
    },
    {
      label: "Cadence de revue",
      detail: agent.reviewCadence,
      source: "governance",
    },
    ...matchedSkills.map(buildSkillContext),
  ];
}

function buildGuardrails(agent: AgentProfile): string[] {
  return unique([...agent.constraints, ...DEFAULT_GUARDRAILS]);
}

function buildSuccessMetrics(agent: AgentProfile): string[] {
  const baseMetrics = [
    "ceo_time_saved",
    "guardrail_compliance",
    "useful_output_rate",
  ];

  return unique([...ROLE_SUCCESS_METRICS[agent.role], ...baseMetrics]);
}

function buildKnowledgePack(
  agent: AgentProfile,
  skillsById: Map<string, SkillProfile>,
): AgentKnowledgePackBlueprint {
  const matchedSkills: SkillProfile[] = [];
  const missingSkillIds: string[] = [];

  for (const skillId of agent.skillIds) {
    const skill = skillsById.get(skillId);
    if (skill) {
      matchedSkills.push(skill);
    } else {
      missingSkillIds.push(skillId);
    }
  }

  return {
    agentId: agent.id,
    agentName: agent.name,
    role: agent.role,
    status: agent.status,
    purpose: agent.description,
    operatingContexts: [...agent.ventures],
    trustedSources: [...DEFAULT_TRUSTED_SOURCES],
    requiredContext: buildRequiredContext(agent, matchedSkills),
    allowedSkillIds: matchedSkills.map((skill) => skill.id),
    missingSkillIds,
    skillCategories: unique(matchedSkills.map((skill) => skill.category)),
    successMetrics: buildSuccessMetrics(agent),
    guardrails: buildGuardrails(agent),
    reviewCadence: agent.reviewCadence,
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
    modelProviderLockIn: false,
  };
}

export function buildAgentKnowledgePackCatalog(
  input: BuildAgentKnowledgePackCatalogInput,
): AgentKnowledgePackCatalog {
  const skillsById = new Map(input.skills.map((skill) => [skill.id, skill]));
  const packs = input.agents.map((agent) => buildKnowledgePack(agent, skillsById));

  return {
    summary: {
      totalPacks: packs.length,
      activePacks: packs.filter((pack) => pack.status === "active").length,
      standbyPacks: packs.filter((pack) => pack.status === "standby").length,
      lockedPacks: packs.filter((pack) => pack.status === "locked").length,
      plannedPacks: packs.filter((pack) => pack.status === "planned").length,
      packsWithMissingSkills: packs.filter((pack) => pack.missingSkillIds.length > 0).length,
      noExecutionAuthorized: true,
      modelProviderLockIn: false,
    },
    packs,
  };
}
