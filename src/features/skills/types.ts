import type { AutonomyLevel } from "@/core/types";
import type { AgentRoleId } from "@/features/agents/types";

export type SkillCategory =
  | "money"
  | "sales"
  | "marketing"
  | "briefings"
  | "customer-ops"
  | "legal-admin"
  | "dev-code"
  | "automation"
  | "memory";

export type SkillStatus =
  | "active"    // wired and callable today
  | "partial"   // contract defined, not fully wired
  | "planned";  // not yet built

export type SkillProfile = {
  id: string;
  label: string;
  category: SkillCategory;
  description: string;
  status: SkillStatus;
  autonomyLevel: AutonomyLevel;
  /** Which agent roles can invoke this skill. */
  assignedRoles: AgentRoleId[];
  /** Hard output constraint — what this skill never produces. */
  outputConstraint?: string;
};
