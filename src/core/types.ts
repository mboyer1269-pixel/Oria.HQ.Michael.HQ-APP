/**
 * Core Oria domain types.
 *
 * These types intentionally avoid workspace-specific proper nouns. All
 * workspace-specific data lives in workspace configs and seed files
 * (see `src/workspaces/...` in a later phase). The core stays generic so any
 * workspace can plug in.
 */

export type WorkspaceId = string;
export type AssistantProfileId = string;
export type AgentRuntimeId = string;
export type ToolId = string;
export type PermissionActionId = string;

/**
 * 0 = disabled/forbidden  1 = read-only/analysis  2 = internal draft
 * 3 = supervised reversible write  4 = external/shared requiring confirmation
 * 5 = financial, publish, client delivery, credential, or irreversible action
 *
 * Single canonical definition. src/features/hq/types.ts re-exports this.
 */
export type AutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * A "mode" is a venture/profession/context that a workspace operates in.
 * Examples a workspace might install: "real-estate", "financial-advisor",
 * "personal", "hq". The core knows the shape; the workspace owns the values.
 */
export type WorkspaceMode = {
  id: string;
  label: string;
  description?: string;
};

export type Workspace = {
  id: WorkspaceId;
  /** Url-safe identifier, e.g. "default-workspace". Stable across renames. */
  slug: string;
  /** Human-facing label, e.g. "Default Workspace". Free to change. */
  displayName: string;
  /** Supabase auth.users.id of the workspace owner. */
  ownerUserId: string;
  /** Installed venture modes for this workspace. */
  modes: WorkspaceMode[];
  /** Default assistant for the workspace. Routed to when no assistant is specified. */
  defaultAssistantId: AssistantProfileId;
};

export type OwnerUser = {
  /** Supabase auth.users.id when configured, or the local development owner id. */
  id: string;
  email?: string;
};

export type AssistantProfile = {
  id: AssistantProfileId;
  workspaceId: WorkspaceId;
  /** Display name shown to users, e.g. "Default Assistant". A workspace controls this string. */
  name: string;
  /** Optional persona/system-prompt seed. Loaded when the assistant is invoked. */
  persona?: string;
  /** Preferred model id when the runtime supports a choice. */
  defaultModelId?: string;
  /** Which AgentRuntime dispatches this assistant. */
  runtimeId: AgentRuntimeId;
  /** ToolRegistry ids this assistant is permitted to use. */
  allowedTools: ToolId[];
};

export type ActiveWorkspaceContext = {
  activeWorkspace: Workspace;
  activeMode: WorkspaceMode;
  activeAgentProfile: AssistantProfile;
  currentOwnerUser: OwnerUser;
};

/**
 * An AgentRuntime is the execution backend that turns an assistant + message
 * into a response. Today: a single in-process assistant runtime. Later:
 * workspace-specific runtime adapters land in later phases — for now this type
 * is metadata-only so call sites can already reference it.
 */
export type AgentRuntime = {
  id: AgentRuntimeId;
  label: string;
  /** When false, the runtime exists but is not configured (e.g. missing API key). */
  isConfigured: boolean;
};

export type ToolDefinition = {
  id: ToolId;
  label: string;
  description?: string;
};

export type ToolRegistry = Record<ToolId, ToolDefinition>;

export type PermissionRule = {
  id: string;
  action: PermissionActionId;
  /** Autonomy level required for this action (0–5 scale). */
  level: AutonomyLevel;
  requiresConfirmation: boolean;
  reason: string;
};

export type PermissionPolicy = {
  workspaceId: WorkspaceId;
  rules: PermissionRule[];
};

export type ActionQueueStatus =
  | "pending"
  | "approved"
  | "executed"
  | "rejected"
  | "failed";

/**
 * A unit of work an assistant wants to perform. Replaces the old record-only
 * action ledger model. In Phase 2 the assistant runtime will enqueue these and
 * the permission engine will decide whether to auto-execute or wait for approval.
 */
export type ActionQueueItem = {
  id: string;
  workspaceId: WorkspaceId;
  assistantId?: AssistantProfileId;
  action: PermissionActionId;
  status: ActionQueueStatus;
  payload: Record<string, unknown>;
  preview?: {
    summary: string;
    details?: Record<string, unknown>;
  };
  createdAt: string;
  resolvedAt?: string;
  /** User id of the approver/rejector, when applicable. */
  resolvedBy?: string;
  result?: Record<string, unknown>;
};

export type ActionApproval = {
  itemId: string;
  decision: "approved" | "rejected";
  by: string;
  reason?: string;
  at: string;
};

/**
 * A ContextBoundary records a crossing between workspaces — e.g. an assistant
 * in workspace A requesting a tool that touches workspace B's data. In Phase 6
 * a middleware wraps repository calls in `withContextBoundary` and logs each
 * crossing. Today there's a single workspace so crossings are trivial.
 */
export type ContextBoundary = {
  workspaceId: WorkspaceId;
  callerId: string;
  resource: string;
  operation: string;
  at: string;
};

export type MediaProjectStatus = "draft" | "generating" | "ready" | "failed";

export type MediaProject = {
  id: string;
  workspaceId: WorkspaceId;
  title: string;
  providerId: string;
  status: MediaProjectStatus;
  inputs: Record<string, unknown>;
  outputs?: {
    url?: string;
    thumbnailUrl?: string;
  };
  createdAt: string;
};

export type MediaProviderAdapter = {
  id: string;
  label: string;
  isConfigured: () => boolean;
};

// ---------------------------------------------------------------------------
// Mission domain model (Phase 1 proposal — no runtime wiring yet)
// See docs/MISSION_MODEL_PROPOSAL.md for rationale and safety rules.
// ---------------------------------------------------------------------------

export type MissionStatus =
  | "draft"
  | "queued"
  | "running"
  | "needs_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type MissionRiskLevel = "low" | "medium" | "high";

/** Alias of AutonomyLevel scoped to Mission domain. Same 0–5 scale. */
export type MissionAutonomyLevel = AutonomyLevel;

export type Mission = {
  id: string;
  workspaceId: WorkspaceId;
  modeId: string;
  title: string;
  objective: string;
  assignedAgentId: AssistantProfileId;
  autonomyLevel: MissionAutonomyLevel;
  status: MissionStatus;
  riskLevel: MissionRiskLevel;
  input: Record<string, unknown>;
  expectedOutput: string;
  requiresApproval: boolean;
  costBudgetCents?: number;
  result?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type MissionResult = {
  missionId: string;
  status: Extract<MissionStatus, "completed" | "failed" | "cancelled">;
  output: Record<string, unknown>;
  summary: string;
  error?: string;
  completedAt: string;
};

export type MissionApprovalRequirement = {
  missionId: string;
  required: boolean;
  reason: string;
  policyId?: string;
  evidenceRequired: string[];
  approvedBy?: string;
  approvedAt?: string;
};

// ---------------------------------------------------------------------------
// Execution Zone Model (PR1 -- Bounded Live Execution Layer)
//
// Maps the 0-5 AutonomyLevel scale to three operational zones:
//
//   green  -- Agent executes live autonomously. Sentinel observes.
//             Ledger mandatory. Human reviews post-action.
//             Levels 1-2 (read-only / internal-draft)
//
//   yellow -- Agent prepares the action and requests a fast GO.
//             Human approves before dispatch. Sentinel gates.
//             Levels 3-4 (supervised write / external)
//
//   red    -- Action is blocked. Never executed automatically.
//             Level 0 (forbidden) and level 5 (financial/irreversible)
//
// The zone is computed from the LOWER of (agent.autonomyLevel, skill.autonomyLevel).
// This ensures a high-autonomy agent cannot run a high-risk skill unchecked.
// ---------------------------------------------------------------------------

export type ExecutionZone = "green" | "yellow" | "red";

export type ExecutionZonePolicy = {
  zone: ExecutionZone;
  /** Agent can execute live without human approval. */
  allowedLive: boolean;
  /** Human approval required before dispatch. */
  requiresHumanApproval: boolean;
  /** Sentinel policy engine must gate the action. */
  requiresSentinel: boolean;
  /** Action ledger entry is mandatory. */
  requiresLedger: boolean;
};

/**
 * Resolve the ExecutionZone from an AutonomyLevel.
 * Use the effective level = min(agentLevel, skillLevel) at call sites.
 */
export function resolveExecutionZone(level: AutonomyLevel): ExecutionZone {
  if (level === 0 || level === 5) return "red";
  if (level <= 2) return "green";
  return "yellow";
}

/** Full policy for a given AutonomyLevel. */
export function getExecutionZonePolicy(level: AutonomyLevel): ExecutionZonePolicy {
  const zone = resolveExecutionZone(level);
  switch (zone) {
    case "green":
      return {
        zone: "green",
        allowedLive: true,
        requiresHumanApproval: false,
        requiresSentinel: true,
        requiresLedger: true,
      };
    case "yellow":
      return {
        zone: "yellow",
        allowedLive: false,
        requiresHumanApproval: true,
        requiresSentinel: true,
        requiresLedger: true,
      };
    case "red":
    default:
      return {
        zone: "red",
        allowedLive: false,
        requiresHumanApproval: false,
        requiresSentinel: false,
        requiresLedger: false,
      };
  }
}

// ===========================================================================
// Shared domain types (relocated from feature layers to fix dependency
// direction). These are consumed by both `src/server/*` and `src/features/*`.
// The original feature `types.ts` files now re-export from here for
// backward-compatibility, so existing feature/app imports keep resolving.
// Rule: the server layer imports these from `@/core/types`, never from a
// feature module. See ARCHITECTURE.md ("structural debt #1").
// ===========================================================================

// --- Model / routing ---------------------------------------------------------

export type ModelProvider = "anthropic" | "openai" | "google" | "openrouter";

export type ModelMode = "auto" | "economy" | "brute" | "manual";

export type ModelProfile = {
  id: string;
  label: string;
  provider: ModelProvider;
  defaultUse: string;
  costTier: "low" | "medium" | "high";
  strengths: string[];
};

// --- Assistant conversational domain -----------------------------------------

export type JorisIntent =
  | "chat"
  | "calendar.book"
  | "calendar.remind"
  | "brief.generate"
  | "board.consult"
  | "memory.capture"
  | "opportunity.score"
  | "task.create"
  | "mission.plan" // dry-run plan surface only — never executes
  | "mission.draft" // calendar.book proposal — pending user confirmation
  | "governance.audit"
  | "marketplace.listing.prepare" // prepare-only Marketplace fiche from stock
  | "inventory.market.brief"; // inventaire debrief + comps marché (AutoTrader)

// --- Calendar domain ---------------------------------------------------------

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
  workspaceId: string;
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

// --- Mission view-models -----------------------------------------------------

/** View-model flattening of MissionExecutorResult. */
export type MissionPlanResult = {
  allowed: boolean;
  missionId: string;
  blockReasons?: string[];
  stepCount?: number;
  estimatedAutonomyCost?: number;
};

export type MissionDraftPreview = {
  pendingDraftId: string;
  title: string;
  objective: string;
  skillId: "calendar.book";
  actionType: "calendar.book";
  scheduledAt?: {
    dateISO: string;
    startTime: string;
    endTime: string;
  };
  expiresAt: string;
};

export type GovernanceAuditExport = {
  filename: string;
  mimeType: "text/csv";
  content: string;
  totalDecisions: number;
  humanOnTheLoop: true;
  noExecutionAuthorized: true;
};

// --- Command result (assistant turn output) ----------------------------------

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
  missionDraftPreview?: MissionDraftPreview;
  auditExport?: GovernanceAuditExport;
  pendingDraftId?: string;
  missionId?: string;
  /** How `summary` was produced on the conversational path: a real LLM call ("llm") or the deterministic fallback ("fallback"). Absent on structured/rules-based intents. */
  generation?: "llm" | "fallback";
};

// --- CEO brief snapshot ------------------------------------------------------

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

// --- Agent domain (relocated from features/agents/types) ---------------------

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

// --- Skill domain (relocated from features/skills/types) ---------------------

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

// --- Contact domain (relocated from features/contact/types) ------------------

export type ContactLeadStatus = "new" | "contacted" | "qualified" | "closed" | "spam";

export type ContactLeadStorageMode = "local" | "supabase";

export type ContactNotificationStatus = "skipped" | "queued" | "failed";

export type ContactLead = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  message: string;
  source: string;
  status: ContactLeadStatus;
  createdAt: string;
  storageMode: ContactLeadStorageMode;
};

// --- Venture domain (relocated from features/ventures/types) -----------------

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
