export type VentureLifecycleStatus =
  | "discovered"
  | "candidate"
  | "scored"
  | "shortlisted"
  | "approved_for_validation"
  | "validating"
  | "operating"
  | "autonomous"
  | "scaling"
  | "paused"
  | "killed"
  | "archived";

export type VentureSource =
  | "human_created"
  | "agent_suggested"
  | "market_scan"
  | "imported"
  | "reworked_from_old_idea";

export type VentureScore = {
  revenuePotential: number;
  speedToFirstDollar: number;
  costToValidate: number;
  automationPotential: number;
  ownerInvolvementRequired: number;
  marketPain: number;
  differentiation: number;
  executionDifficulty: number;
  risk: number;
  grossMarginPotential: number;
  strategicFit: number;
  overallScore: number;
  recommendation: "go" | "test_small" | "hold" | "kill";
};

export type VentureAutonomyRiskTier = "safe" | "controlled" | "restricted" | "forbidden";

export type VentureAutonomyDomain =
  | "research"
  | "marketScanning"
  | "analysis"
  | "scoring"
  | "reporting"
  | "planning"
  | "contentDrafting"
  | "internalOps"
  | "externalComms"
  | "spending"
  | "publishing"
  | "dataMutation"
  | "legalCommitment";

export type VentureAutonomyRule = {
  domain: VentureAutonomyDomain;
  autonomyLevel: number;
  riskTier: VentureAutonomyRiskTier;
  requiresApproval: boolean;
  allowedActions: string[];
  blockedActions: string[];
  maxBudgetCents?: number;
};

export type VentureAutonomyProfile = {
  rules: VentureAutonomyRule[];
  notes?: string;
};

export type VentureKillCriteria = {
  id: string;
  metric: string;
  threshold: string;
  evaluationWindowDays: number;
  consequence: "pause" | "kill" | "rework" | "manual_review";
};

export type VentureValidationPlan = {
  windowDays: 7 | 30 | 60 | 90;
  hypothesis: string;
  successMetrics: string[];
  budgetCapCents: number;
  requiredEvidence: string[];
  killCriteria: VentureKillCriteria[];
};

export type VentureAgentAssignment = {
  agentId: string;
  role: string;
  status: "proposed" | "active" | "paused" | "removed";
  autonomyDomains: VentureAutonomyDomain[];
};

export type VentureDecision = {
  id: string;
  type:
    | "score"
    | "save_suggestion"
    | "promote"
    | "pause"
    | "kill"
    | "archive"
    | "scale"
    | "rework"
    | "increase_autonomy";
  summary: string;
  decidedBy: "ceo" | "system_recommendation";
  decidedAt: string;
  noExecutionAuthorized: true;
  humanOnTheLoop: true;
};

export type VentureCard = {
  id: string;
  name: string;
  description: string;
  source: VentureSource;
  status: VentureLifecycleStatus;
  targetCustomer: string;
  problem: string;
  offer: string;
  primaryChannel: string;
  score?: VentureScore;
  validationPlan?: VentureValidationPlan;
  autonomyProfile: VentureAutonomyProfile;
  assignedAgents: VentureAgentAssignment[];
  decisions: VentureDecision[];
  createdAt: string;
  updatedAt: string;
};
