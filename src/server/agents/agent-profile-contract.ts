// src/server/agents/agent-profile-contract.ts

/**
 * Pure TypeScript contracts defining the shape of an Agent Profile within the
 * Orya HQ Agentic Holding OS. These contracts are deliberately minimal and
 * contain no runtime logic, I/O, or side‑effects.
 */

// ------- Enumerations & Basic Types -------
export enum AgentRole {
  OPERATOR = "operator",
  DIRECTOR = "director",
  BOOSTER = "booster",
  ANALYST = "analyst",
}

// duplicate export removed
export enum AgentStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  SUSPENDED = "suspended",
  RETIRED = "retired",
}

export enum AgentType {
  HUMAN = "human",
  AI = "ai",
  HYBRID = "hybrid",
}

export enum ApprovalGate {
  MONEY = "money",
  PUBLISHING = "publishing",
  OUTREACH = "outreach",
  DEPLOYMENT = "deployment",
  AUTH_RLS = "auth_rls",
  LIVE_RUNTIME = "live_runtime",
  SECRETS = "secrets",
  IRREVERSIBLE = "irreversible",
}

export type BusinessObjective = string;
export type ProfitTarget = number; // target profit in arbitrary units
export type AutonomyLevel = number; // 0‑100 scale
export type PromotionLevel = number; // integer rank
export type ReportingCadence = "hourly" | "daily" | "weekly" | "monthly";

export interface AgentSkill {
  /** Human readable name of the skill */
  name: string;
  /** Proficiency level, 0‑100 */
  level: number;
}

export interface BoosterReference {
  /** UUID of the Booster */
  boosterId: string;
  /** Type of booster (mirrors BoosterType) */
  type: string;
}

// ------- Core AgentProfile Contract -------
export interface AgentProfile {
  /** Unique identifier for the agent */
  id: string;
  /** Role within the holding OS */
  role: AgentRole;
  /** Current operational status */
  status: AgentStatus;
  /** Underlying technology type */
  type: AgentType;
  /** Business objective the agent pursues */
  businessObjective: BusinessObjective;
  /** Expected profit target */
  profitTarget: ProfitTarget;
  /** Autonomy level granted to the agent */
  autonomyLevel: AutonomyLevel;
  /** Current promotion tier */
  promotionLevel: PromotionLevel;
  /** Flag indicating eligibility for the original Orya candidate path */
  originalOryaCandidate: boolean;
  /** Set of approval gates that must be satisfied before irreversible actions */
  approvalGates: ApprovalGate[];
  /** Enumerated skills the agent possesses */
  skills: AgentSkill[];
  /** References to any Boosters applied to the agent */
  boosters: BoosterReference[];
  /** Whitelisted actions the agent may perform */
  allowedActions: string[];
  /** Blacklisted actions the agent may NOT perform */
  forbiddenActions: string[];
  /** Budget or tier limits for this profile (e.g., token budget) */
  budget: number;
  /** How often the agent must report status */
  reportingCadence: ReportingCadence;
}

// Export enums for external use


