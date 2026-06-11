import type { AutonomyLevel } from "@/core/types";

export type AgentStatus =
  | "active"    // deployed, accepting tasks
  | "standby"   // configured, not yet deployed
  | "locked"    // requires unlock gate before activation
  | "planned";  // not yet built

/** Canonical agent roles. "closer" kept (agent frozen, not deleted). */
export type AgentRoleId =
  | "orchestrator"
  | "operator"
  | "scout"
  | "auditor"
  | "memory"
  | "money"
  | "builder"
  | "closer";

/** Venture context an agent is scoped to. */
export type AgentVenture = "hq" | "suivia" | "mcl" | "personal" | "global";

export type AgentProfile = {
  id: string;
  name: string;
  /** Origin story of the agent's name — shown on hover. Gives the HQ a soul. */
  lore?: string;
  role: AgentRoleId;
  tagline: string;
  description: string;
  status: AgentStatus;
  autonomyLevel: AutonomyLevel;
  /** Skills this agent can execute (must resolve in the Skills Catalog). */
  skillIds: string[];
  /** Hard constraints — things this agent must never do. */
  constraints: string[];
  /** Venture contexts where this agent operates. */
  ventures: AgentVenture[];
  /** Human review cadence. */
  reviewCadence: string;
};
