import type { AutonomyLevel } from "@/core/types";

export type AgentStatus =
  | "active"    // deployed, accepting tasks
  | "standby"   // configured, not yet deployed
  | "locked"    // requires unlock gate before activation
  | "planned";  // not yet built

export type AgentRoleId =
  | "orchestrator"
  | "scout"
  | "builder"
  | "closer"
  | "operator"
  | "auditor"
  | "money";

export type AgentProfile = {
  id: string;
  name: string;
  role: AgentRoleId;
  tagline: string;
  description: string;
  status: AgentStatus;
  autonomyLevel: AutonomyLevel;
  /** Skills this agent can execute (referenced in Skills Catalog, PR #31). */
  skillIds: string[];
  /** Hard constraints — things this agent must never do. */
  constraints: string[];
};
