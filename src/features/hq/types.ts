// Canonical domain types live in `src/core/types.ts`. Imported for local use
// and re-exported so existing feature/app imports continue to resolve. The
// server layer imports these directly from `@/core/types` (see ARCHITECTURE.md).
import type { AutonomyLevel } from "@/core/types";
export type { AutonomyLevel, PermissionRule } from "@/core/types";

// Shared domain types relocated to core — re-exported here for back-compat.
export type {
  ModelProvider,
  ModelMode,
  ModelProfile,
  JorisIntent,
  CalendarIntent,
  CalendarEventSource,
  CalendarStorageMode,
  CalendarEvent,
  ActionLedgerStatus,
  MissionPlanResult,
  MissionDraftPreview,
  GovernanceAuditExport,
  CommandResult,
  CeoBriefAgendaItem,
  CeoBriefLeadItem,
  CeoBriefSnapshot,
} from "@/core/types";

// ---------------------------------------------------------------------------
// HQ presentation types — UI-layer shapes that stay local to the feature.
// ---------------------------------------------------------------------------

export type VentureHat = "suivia" | "mcl" | "personal" | "hq";

export type BoardFigure = {
  id: string;
  name: string;
  domain: string;
  frameworks: string[];
  lexicon: string[];
  bias: string;
  bestFor: string;
  disclosure?: string;
};

export type HqModule = {
  id: string;
  title: string;
  subtitle: string;
  status: "ready" | "foundation" | "planned";
  autonomyLevel: AutonomyLevel;
};

// ---------------------------------------------------------------------------
// Agent Charter & Policy types (Lot C foundation)
// Used by: agentPolicy.ts, charters.ts, fleet.ts, agent-charter-panel.tsx,
//          agent-registry-panel.tsx
// ---------------------------------------------------------------------------

/** How an agent is permitted to execute a given action. */
export type CharterRuleMode =
  | "auto"              // no human in loop
  | "supervised"        // executes + logs; human can veto within window
  | "approval_required" // blocked until human approves
  | "forbidden";        // hard block — never allowed

/** Risk tier of an action, ordered low → high. */
export type AgentActionRisk =
  | "read"    // read-only, no side effects
  | "draft"   // internal artifact only, not published
  | "check"   // audit/validation, no writes
  | "write"   // persists data or state changes
  | "publish"; // external-facing or irreversible

/** A single rule in an agent's operating charter. */
export type CharterRule = {
  action: string;
  risk: AgentActionRisk;
  mode: CharterRuleMode;
  /** Evidence items that must be satisfied before the action executes. */
  evidenceRequired?: string[];
  /** Human-readable rationale for the chosen mode. */
  reason: string;
};

/** Full operating charter for one agent. */
export type AgentOperatingCharter = {
  agentId: string;
  version: string;
  effectiveDate: string;
  rules: CharterRule[];
};

// ---------------------------------------------------------------------------
// Hermes Fleet types (Lot C foundation)
// Used by: fleet.ts, agent-registry-panel.tsx
// ---------------------------------------------------------------------------

/** Approval mode for a Hermes fleet agent. */
export type AgentApprovalMode = "manual" | "supervised" | "autonomous";

/** Venture context an agent is scoped to. */
export type AgentVenture = "hq" | "suivia" | "mcl" | "personal" | "global";

/** Runtime status of a Hermes fleet agent (separate from AgentProfile status). */
export type AgentStatus = "active" | "idle" | "needs_review" | "planned";
