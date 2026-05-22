// AutonomyLevel and PermissionRule are canonical in src/core/types.ts.
// Imported for local use and re-exported so existing feature imports continue to resolve.
import type { AutonomyLevel, PermissionRule } from "@/core/types";
export type { AutonomyLevel, PermissionRule };

export type VentureHat = "suivia" | "mcl" | "personal" | "hq";

export type ModelProvider = "anthropic" | "openai" | "google";

export type ModelMode = "auto" | "economy" | "brute" | "manual";

export type JorisIntent =
  | "chat"
  | "calendar.book"
  | "calendar.remind"
  | "brief.generate"
  | "board.consult"
  | "memory.capture"
  | "opportunity.score"
  | "task.create"
  | "mission.plan"; // dry-run plan surface only — never executes

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

export type ModelProfile = {
  id: string;
  label: string;
  provider: ModelProvider;
  defaultUse: string;
  costTier: "low" | "medium" | "high";
  strengths: string[];
};


export type CalendarIntent = {
  title: string;
  dateISO: string;
  startTime: string;
  endTime: string;
  remindersMinutes: number[];
  needsConfirmation: boolean;
  confidence: number;
  notes?: string;
};

export type CalendarEventSource = "api" | "internal" | "joris";

export type CalendarStorageMode = "local" | "supabase";

export type CalendarEvent = {
  id: string;
  userId: string;
  title: string;
  dateISO: string;
  startTime: string;
  endTime: string;
  source: CalendarEventSource;
  remindersMinutes: number[];
  createdAt: string;
  updatedAt: string;
  storageMode: CalendarStorageMode;
};

export type ActionLedgerStatus = "recorded" | "skipped" | "failed";

/** View-model flattening of MissionExecutorResult — no server imports needed here. */
export type MissionPlanResult = {
  allowed: boolean;
  missionId: string;
  blockReasons?: string[];
  stepCount?: number;
  estimatedAutonomyCost?: number;
};

export type CommandResult = {
  intent: JorisIntent;
  summary: string;
  modelId?: string;
  costMode?: ModelMode;
  workspaceId?: string;
  modeId?: string;
  assistantId?: string;
  calendarIntent?: CalendarIntent;
  calendarEvent?: CalendarEvent;
  ledgerStatus?: ActionLedgerStatus;
  storageMode?: CalendarStorageMode;
  requiresConfirmation?: boolean;
  missionPlanResult?: MissionPlanResult;
};

export type CeoBriefAgendaItem = {
  id: string;
  title: string;
  dateISO: string;
  startTime: string;
  endTime: string;
  source: CalendarEventSource;
};

export type CeoBriefLeadItem = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  status: string;
  createdAt: string;
};

export type CeoBriefSnapshot = {
  generatedAt: string;
  headline: string;
  focusLine: string;
  agenda: {
    upcomingCount: number;
    items: CeoBriefAgendaItem[];
  };
  leads: {
    newCount: number;
    items: CeoBriefLeadItem[];
  };
  documents: {
    totalCount: number;
    byHat: Record<string, number>;
    recentFilenames: string[];
  };
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

/** Full profile of an agent in the Hermes fleet. */
export type HermesAgent = {
  id: string;
  name: string;
  niche: string;
  objective: string;
  status: AgentStatus;
  approvalMode: AgentApprovalMode;
  ventures: AgentVenture[];
  allowedActions: string[];
  evidenceRequired: string[];
  weeklyHoursSaved: number;
  monthlyRevenuePotential: number;
  reviewCadence: string;
};

/** Aggregate summary of the Hermes agent fleet. */
export type HermesFleetSummary = {
  totalAgents: number;
  activeAgents: number;
  supervisedAgents: number;
  weeklyHoursSaved: number;
  monthlyRevenuePotential: number;
};
