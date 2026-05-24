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

/** Side-effect class of a skill, ordered least → most consequential. */
export type SkillSideEffect =
  | "none"                   // read-only, no writes
  | "internal-draft"         // produces an internal artifact, not published
  | "reversible-write"       // persists reversible state
  | "irreversible-external"; // external send / publish / transaction

/** Ledger event categories a skill may be required to emit. */
export type LedgerEventType = "decision" | "action" | "result" | "cost" | "learning";

/** A single typed input/output field of a skill. */
export type SkillIOSpec = {
  name: string;
  type: string;
  required: boolean;
  note?: string;
};

export type SkillProfile = {
  id: string;
  label: string;
  category: SkillCategory;
  description: string;
  status: SkillStatus;
  autonomyLevel: AutonomyLevel;
  /** Which agent roles can invoke this skill. */
  assignedRoles: AgentRoleId[];
  // --- Governance layer (PR2) — the permission surface, not the model's reasoning. ---
  /** Typed input contract. */
  inputs: SkillIOSpec[];
  /** Typed output contract. */
  outputs: SkillIOSpec[];
  /** Side-effect class. Drives the governance invariants. */
  sideEffects: SkillSideEffect;
  /** Does this skill persist data to a database? */
  canWriteDB: boolean;
  /** Does this skill trigger an external tool/system (email, n8n, API, publish)? */
  canTriggerExternal: boolean;
  /** Must a human approve before this skill executes? */
  requiresHumanApproval: boolean;
  /** Ledger event types this skill MUST emit when it runs. */
  logsRequired: LedgerEventType[];
  /** Minimum test criteria that must hold for this skill. */
  testsRequired: string[];
  /** Hard output constraint — what this skill never produces. */
  outputConstraint?: string;
};
