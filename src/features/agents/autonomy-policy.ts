import type { AutonomyLevel } from "@/core/types";
import type { SkillProfile } from "@/features/skills/types";

export type AgentCapabilityId =
  | "reasoning"
  | "knowledgeCuration"
  | "research"
  | "analysis"
  | "planning"
  | "drafting"
  | "agentBlueprinting"
  | "performanceReview"
  | "internalAutomation"
  | "reversibleDataWrite"
  | "externalCommunication"
  | "publishing"
  | "spending"
  | "legalCommitment"
  | "runtimeExecution"
  | "secretsAccess";

export type AgentCapabilityRiskTier = "safe" | "controlled" | "restricted" | "forbidden";

export type AgentAutonomyDecision =
  | "allowed_autonomous"
  | "requires_approval"
  | "blocked"
  | "unknown_capability";

export type AgentCapabilityApprovalGate =
  | "human_review"
  | "external_comms"
  | "publishing"
  | "money"
  | "data_write"
  | "legal"
  | "runtime"
  | "secrets";

export interface AgentModelProviderPolicy {
  selectionMode: "approved_provider_pool";
  providerLockIn: false;
  approvalRequiredForNewProvider: true;
  gatedBy: "capability_risk";
  notes: string;
}

export interface AgentCapabilityPolicyRule {
  id: AgentCapabilityId;
  label: string;
  description: string;
  riskTier: AgentCapabilityRiskTier;
  decision: Exclude<AgentAutonomyDecision, "unknown_capability">;
  maxAutonomyLevel: AutonomyLevel;
  requiresHumanApproval: boolean;
  approvalGates: AgentCapabilityApprovalGate[];
  blockedActions: string[];
}

export interface AgentAutonomyPolicy {
  id: string;
  version: 1;
  modelProviderPolicy: AgentModelProviderPolicy;
  capabilities: AgentCapabilityPolicyRule[];
  humanOnTheLoop: true;
  noExecutionAuthorized: true;
}

export interface AgentCapabilityRequest {
  capability: AgentCapabilityId | string;
  requestedAutonomyLevel?: AutonomyLevel;
  modelProviderId?: string;
}

export interface AgentCapabilityEvaluation {
  capability: string;
  decision: AgentAutonomyDecision;
  riskTier: AgentCapabilityRiskTier | "unknown";
  maxAutonomyLevel: AutonomyLevel;
  requiresHumanApproval: boolean;
  reason: string;
  approvalGates: AgentCapabilityApprovalGate[];
  blockedActions: string[];
  modelProviderId?: string;
  modelProviderLockIn: false;
  humanOnTheLoop: true;
  noExecutionAuthorized: true;
}

export type SkillAutonomyInput = Pick<
  SkillProfile,
  | "id"
  | "label"
  | "sideEffects"
  | "canWriteDB"
  | "canTriggerExternal"
  | "requiresHumanApproval"
  | "autonomyLevel"
>;

export interface AgentAutonomyPolicySummary {
  totalCapabilities: number;
  autonomousCapabilities: number;
  approvalRequiredCapabilities: number;
  blockedCapabilities: number;
  maxSafeAutonomyLevel: AutonomyLevel;
  modelProviderLockIn: false;
}

const MODEL_PROVIDER_POLICY: AgentModelProviderPolicy = {
  selectionMode: "approved_provider_pool",
  providerLockIn: false,
  approvalRequiredForNewProvider: true,
  gatedBy: "capability_risk",
  notes:
    "Model choice stays flexible inside an approved provider pool; autonomy is gated by capability risk, not by one LLM vendor.",
};

const DEFAULT_CAPABILITIES: AgentCapabilityPolicyRule[] = [
  {
    id: "reasoning",
    label: "Reasoning",
    description: "Break down goals, compare options, and recommend next steps.",
    riskTier: "safe",
    decision: "allowed_autonomous",
    maxAutonomyLevel: 5,
    requiresHumanApproval: false,
    approvalGates: [],
    blockedActions: ["execute_without_policy"],
  },
  {
    id: "knowledgeCuration",
    label: "Knowledge curation",
    description: "Organize approved knowledge, notes, and reusable context.",
    riskTier: "safe",
    decision: "allowed_autonomous",
    maxAutonomyLevel: 5,
    requiresHumanApproval: false,
    approvalGates: [],
    blockedActions: ["access_private_data_without_scope", "modify_source_of_truth_without_approval"],
  },
  {
    id: "research",
    label: "Research",
    description: "Gather and summarize public or approved internal information.",
    riskTier: "safe",
    decision: "allowed_autonomous",
    maxAutonomyLevel: 5,
    requiresHumanApproval: false,
    approvalGates: [],
    blockedActions: ["contact_people", "spend_money"],
  },
  {
    id: "analysis",
    label: "Analysis",
    description: "Analyze inputs, risks, scores, and expected business impact.",
    riskTier: "safe",
    decision: "allowed_autonomous",
    maxAutonomyLevel: 5,
    requiresHumanApproval: false,
    approvalGates: [],
    blockedActions: ["change_records", "make_commitments"],
  },
  {
    id: "planning",
    label: "Planning",
    description: "Draft internal plans, validation steps, and operating checklists.",
    riskTier: "safe",
    decision: "allowed_autonomous",
    maxAutonomyLevel: 5,
    requiresHumanApproval: false,
    approvalGates: [],
    blockedActions: ["execute_plan_without_approval"],
  },
  {
    id: "drafting",
    label: "Drafting",
    description: "Prepare internal drafts, messages, copy, and assets for review.",
    riskTier: "safe",
    decision: "allowed_autonomous",
    maxAutonomyLevel: 4,
    requiresHumanApproval: false,
    approvalGates: [],
    blockedActions: ["publish_publicly", "send_message"],
  },
  {
    id: "agentBlueprinting",
    label: "Agent blueprinting",
    description: "Recommend agent roles, skills, knowledge, and safety boundaries.",
    riskTier: "safe",
    decision: "allowed_autonomous",
    maxAutonomyLevel: 5,
    requiresHumanApproval: false,
    approvalGates: [],
    blockedActions: ["create_runtime_agent", "dispatch_agent"],
  },
  {
    id: "performanceReview",
    label: "Performance review",
    description: "Review outputs against profit, time, quality, and safety metrics.",
    riskTier: "safe",
    decision: "allowed_autonomous",
    maxAutonomyLevel: 5,
    requiresHumanApproval: false,
    approvalGates: [],
    blockedActions: ["self_promote_autonomy", "hide_failed_results"],
  },
  {
    id: "internalAutomation",
    label: "Internal automation",
    description: "Prepare or run reversible internal workflow steps inside approved tools.",
    riskTier: "controlled",
    decision: "requires_approval",
    maxAutonomyLevel: 3,
    requiresHumanApproval: true,
    approvalGates: ["human_review"],
    blockedActions: ["external_side_effect", "delete_records"],
  },
  {
    id: "reversibleDataWrite",
    label: "Reversible data write",
    description: "Persist reversible internal records or state changes.",
    riskTier: "controlled",
    decision: "requires_approval",
    maxAutonomyLevel: 3,
    requiresHumanApproval: true,
    approvalGates: ["data_write"],
    blockedActions: ["delete_records", "change_schema"],
  },
  {
    id: "externalCommunication",
    label: "External communication",
    description: "Prepare or send messages to people outside the workspace.",
    riskTier: "restricted",
    decision: "requires_approval",
    maxAutonomyLevel: 2,
    requiresHumanApproval: true,
    approvalGates: ["external_comms"],
    blockedActions: ["send_without_approval", "misrepresent_identity"],
  },
  {
    id: "publishing",
    label: "Publishing",
    description: "Publish content, pages, campaigns, or public updates.",
    riskTier: "restricted",
    decision: "requires_approval",
    maxAutonomyLevel: 2,
    requiresHumanApproval: true,
    approvalGates: ["publishing"],
    blockedActions: ["publish_without_approval", "make_unverified_claims"],
  },
  {
    id: "spending",
    label: "Spending",
    description: "Spend money, buy tools, launch ads, or commit budget.",
    riskTier: "forbidden",
    decision: "blocked",
    maxAutonomyLevel: 0,
    requiresHumanApproval: true,
    approvalGates: ["money"],
    blockedActions: ["spend_money", "buy_tools", "launch_ads", "transfer_money"],
  },
  {
    id: "legalCommitment",
    label: "Legal commitment",
    description: "Sign, accept, promise, or legally bind the workspace.",
    riskTier: "forbidden",
    decision: "blocked",
    maxAutonomyLevel: 0,
    requiresHumanApproval: true,
    approvalGates: ["legal"],
    blockedActions: ["sign_contract", "make_legal_commitment", "make_financial_promise"],
  },
  {
    id: "runtimeExecution",
    label: "Runtime execution",
    description: "Create, dispatch, or operate live agents outside a planning envelope.",
    riskTier: "forbidden",
    decision: "blocked",
    maxAutonomyLevel: 0,
    requiresHumanApproval: true,
    approvalGates: ["runtime"],
    blockedActions: ["live_execution", "runtime_dispatch", "bypass_approval"],
  },
  {
    id: "secretsAccess",
    label: "Secrets access",
    description: "Read, write, reveal, or mutate credentials and secret material.",
    riskTier: "forbidden",
    decision: "blocked",
    maxAutonomyLevel: 0,
    requiresHumanApproval: true,
    approvalGates: ["secrets"],
    blockedActions: ["read_secret", "write_secret", "hardcode_secret", "exfiltrate_secret"],
  },
];

function cloneCapability(rule: AgentCapabilityPolicyRule): AgentCapabilityPolicyRule {
  return {
    ...rule,
    approvalGates: [...rule.approvalGates],
    blockedActions: [...rule.blockedActions],
  };
}

function findCapability(
  policy: AgentAutonomyPolicy,
  capability: string,
): AgentCapabilityPolicyRule | undefined {
  return policy.capabilities.find((rule) => rule.id === capability);
}

function createEvaluation(
  request: AgentCapabilityRequest,
  rule: AgentCapabilityPolicyRule,
  decision: AgentAutonomyDecision,
  reason: string,
): AgentCapabilityEvaluation {
  return {
    capability: request.capability,
    decision,
    riskTier: rule.riskTier,
    maxAutonomyLevel: rule.maxAutonomyLevel,
    requiresHumanApproval: rule.requiresHumanApproval || decision !== "allowed_autonomous",
    reason,
    approvalGates: [...rule.approvalGates],
    blockedActions: [...rule.blockedActions],
    modelProviderId: request.modelProviderId,
    modelProviderLockIn: false,
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
  };
}

export function getDefaultAgentAutonomyPolicy(): AgentAutonomyPolicy {
  return {
    id: "hq-agent-autonomy-policy-v1",
    version: 1,
    modelProviderPolicy: { ...MODEL_PROVIDER_POLICY },
    capabilities: DEFAULT_CAPABILITIES.map(cloneCapability),
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
  };
}

export function evaluateAgentCapabilityRequest(
  policy: AgentAutonomyPolicy,
  request: AgentCapabilityRequest,
): AgentCapabilityEvaluation {
  const rule = findCapability(policy, request.capability);

  if (!rule) {
    return {
      capability: request.capability,
      decision: "unknown_capability",
      riskTier: "unknown",
      maxAutonomyLevel: 0,
      requiresHumanApproval: true,
      reason: `"${request.capability}" is not in the approved capability registry.`,
      approvalGates: ["human_review"],
      blockedActions: ["unknown_action"],
      modelProviderId: request.modelProviderId,
      modelProviderLockIn: false,
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
    };
  }

  if (
    request.requestedAutonomyLevel !== undefined &&
    request.requestedAutonomyLevel > rule.maxAutonomyLevel &&
    rule.decision !== "blocked"
  ) {
    return createEvaluation(
      request,
      rule,
      "requires_approval",
      `"${rule.label}" requested autonomy level ${request.requestedAutonomyLevel}, above the allowed maximum ${rule.maxAutonomyLevel}.`,
    );
  }

  if (rule.decision === "allowed_autonomous") {
    return createEvaluation(
      request,
      rule,
      rule.decision,
      `"${rule.label}" is an internal low-risk capability and may run autonomously inside the approved provider pool.`,
    );
  }

  if (rule.decision === "requires_approval") {
    return createEvaluation(
      request,
      rule,
      rule.decision,
      `"${rule.label}" has side effects or external risk and requires human approval before execution.`,
    );
  }

  return createEvaluation(
    request,
    rule,
    rule.decision,
    `"${rule.label}" crosses a hard boundary and is blocked by default.`,
  );
}

function inferSkillCapability(skill: SkillAutonomyInput): AgentCapabilityId {
  if (skill.canTriggerExternal || skill.sideEffects === "irreversible-external") {
    return "externalCommunication";
  }

  if (skill.canWriteDB || skill.sideEffects === "reversible-write") {
    return "reversibleDataWrite";
  }

  if (skill.sideEffects === "internal-draft") {
    return "drafting";
  }

  return "analysis";
}

export function evaluateSkillAutonomy(
  policy: AgentAutonomyPolicy,
  skill: SkillAutonomyInput,
): AgentCapabilityEvaluation {
  const capability = inferSkillCapability(skill);
  const result = evaluateAgentCapabilityRequest(policy, {
    capability,
    requestedAutonomyLevel: skill.autonomyLevel,
  });

  if (skill.requiresHumanApproval && result.decision === "allowed_autonomous") {
    return {
      ...result,
      decision: "requires_approval",
      requiresHumanApproval: true,
      approvalGates: ["human_review"],
      reason: `"${skill.label}" declares human approval, so it cannot run autonomously even though its capability is low risk.`,
    };
  }

  if (skill.canTriggerExternal || skill.sideEffects === "irreversible-external") {
    return {
      ...result,
      decision: "requires_approval",
      requiresHumanApproval: true,
      approvalGates: Array.from(new Set([...result.approvalGates, "external_comms"])),
      reason: `"${skill.label}" can trigger external side effects and requires human approval.`,
    };
  }

  return result;
}

export function summarizeAgentAutonomyPolicy(
  policy: AgentAutonomyPolicy,
): AgentAutonomyPolicySummary {
  const autonomous = policy.capabilities.filter(
    (rule) => rule.decision === "allowed_autonomous",
  );
  const approvalRequired = policy.capabilities.filter(
    (rule) => rule.decision === "requires_approval",
  );
  const blocked = policy.capabilities.filter((rule) => rule.decision === "blocked");
  const safeAutonomyLevels = autonomous.map((rule) => rule.maxAutonomyLevel);
  const maxSafeAutonomyLevel = safeAutonomyLevels.length > 0
    ? Math.max(...safeAutonomyLevels) as AutonomyLevel
    : 0;

  return {
    totalCapabilities: policy.capabilities.length,
    autonomousCapabilities: autonomous.length,
    approvalRequiredCapabilities: approvalRequired.length,
    blockedCapabilities: blocked.length,
    maxSafeAutonomyLevel,
    modelProviderLockIn: policy.modelProviderPolicy.providerLockIn,
  };
}
