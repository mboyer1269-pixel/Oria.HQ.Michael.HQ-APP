// src/server/agents/work-order-autonomy-envelope-contract.ts

/**
 * Pure TypeScript contracts and validation helpers for Work Order Autonomy
 * Envelopes within the Oria HQ Agentic Holding OS.
 *
 * An Autonomy Envelope defines the operating boundaries for an agent
 * assigned to a Work Order. It answers:
 *   - What can the agent do without asking Michael?
 *   - What requires human approval?
 *   - What is completely blocked?
 *   - When must the agent escalate?
 *   - What budget/risk/time constraints apply?
 *
 * The Human-on-the-Loop principle is preserved: agents operate within
 * a controlled safety envelope so Michael is not a bottleneck, but
 * dangerous actions always require explicit approval or are blocked.
 *
 * All helpers are pure: no I/O, no writes, no mutations, no side-effects.
 */

// ---------------------------------------------------------------------------
// Autonomy Levels
// ---------------------------------------------------------------------------

/**
 * supervised    — agent must check with Michael for every non-trivial step.
 * delegated    — agent may execute allowed autonomous actions freely;
 *                approval-required actions still need Michael.
 * autonomous_dry_run — agent may plan and draft freely within the envelope
 *                      but nothing leaves the system (no publish, no send,
 *                      no deploy, no spend).
 */
export type WorkOrderAutonomyLevel =
  | "supervised"
  | "delegated"
  | "autonomous_dry_run";

// ---------------------------------------------------------------------------
// Action Categories
// ---------------------------------------------------------------------------

/**
 * Internal actions an agent may perform autonomously.
 * These never touch external systems, never spend money, never publish.
 */
export type WorkOrderAutonomousAction =
  | "research"
  | "analyze"
  | "score"
  | "summarize"
  | "draft"
  | "compare"
  | "estimate_roi"
  | "prepare_options"
  | "create_internal_plan"
  | "generate_internal_asset";

/**
 * Actions that require explicit human approval before execution.
 * These touch external systems, spend money, or publish content.
 */
export type WorkOrderApprovalRequiredAction =
  | "publish"
  | "send_message"
  | "contact_human"
  | "spend_money"
  | "buy_domain"
  | "launch_ads"
  | "deploy"
  | "schedule_calendar_event"
  | "modify_database"
  | "connect_external_tool";

/**
 * Actions that are always blocked, regardless of autonomy level.
 * These represent fundamental safety boundaries.
 */
export type WorkOrderBlockedAction =
  | "runtime_dispatch"
  | "live_execution"
  | "bypass_approval"
  | "modify_rls"
  | "hardcode_secret"
  | "delete_records"
  | "transfer_money"
  | "access_private_data_without_scope";

// ---------------------------------------------------------------------------
// Escalation Triggers
// ---------------------------------------------------------------------------

export interface WorkOrderEscalationTrigger {
  /** What condition triggers escalation */
  condition: string;
  /** Human-readable description */
  description: string;
  /** Severity of the escalation */
  severity: "warning" | "critical";
}

// ---------------------------------------------------------------------------
// Autonomy Envelope Contract
// ---------------------------------------------------------------------------

export interface WorkOrderAutonomyEnvelope {
  /** Unique identifier for this envelope */
  id: string;
  /** The Work Order this envelope governs */
  workOrderId: string;
  /** The agent operating under this envelope */
  agentId: string;
  /** The level of autonomy granted */
  autonomyLevel: WorkOrderAutonomyLevel;
  /** Actions the agent may perform without approval */
  allowedAutonomousActions: WorkOrderAutonomousAction[];
  /** Actions that require human approval */
  approvalRequiredActions: WorkOrderApprovalRequiredAction[];
  /** Actions that are always blocked */
  blockedActions: WorkOrderBlockedAction[];
  /** Conditions that trigger escalation to the human */
  escalationTriggers: WorkOrderEscalationTrigger[];
  /**
   * Must always be true. Envelopes only operate under human oversight.
   */
  humanOnTheLoop: true;
  /**
   * Must always be true. Envelopes define planning boundaries,
   * not runtime execution authorization.
   */
  noExecutionAuthorized: true;
  /** ISO 8601 timestamp of when the envelope was created */
  createdAt: string;

  // -- Optional structured fields --

  /** Maximum budget the agent may propose (not spend) in the envelope */
  budgetLimit?: number;
  /** Maximum time the agent may operate before escalating */
  timeLimitMinutes?: number;
  /** Risk threshold above which the agent must escalate */
  riskThreshold?: "low" | "medium" | "high" | "critical";
  /** Maximum cost per individual tool invocation */
  maxToolCost?: number;
  /** Human-readable notes about the envelope */
  notes?: string;
  /** Expiry for the envelope validity */
  expiresAt?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Validation Result Types
// ---------------------------------------------------------------------------

export type WorkOrderAutonomyValidationSeverity = "error" | "warning";

export interface WorkOrderAutonomyIssue {
  code: string;
  message: string;
  path?: string;
  severity: WorkOrderAutonomyValidationSeverity;
}

export interface WorkOrderAutonomyResult {
  valid: boolean;
  issues: WorkOrderAutonomyIssue[];
}

// ---------------------------------------------------------------------------
// Autonomy Evaluation Types
// ---------------------------------------------------------------------------

export type WorkOrderAutonomyDecision =
  | "allowed_autonomous"
  | "requires_approval"
  | "blocked"
  | "escalation_required"
  | "requires_clarification";

export interface WorkOrderAutonomyEvaluation {
  /** The action that was evaluated */
  action: string;
  /** The decision rendered */
  decision: WorkOrderAutonomyDecision;
  /** Human-readable reason for the decision */
  reason: string;
  /** Whether human-on-the-loop is preserved */
  humanOnTheLoop: true;
  /** Whether execution is authorized (always false) */
  noExecutionAuthorized: true;
}

// ---------------------------------------------------------------------------
// Static Action Sets
// ---------------------------------------------------------------------------

const VALID_AUTONOMY_LEVELS: ReadonlySet<string> = new Set([
  "supervised",
  "delegated",
  "autonomous_dry_run",
]);

const VALID_AUTONOMOUS_ACTIONS: ReadonlySet<string> = new Set([
  "research",
  "analyze",
  "score",
  "summarize",
  "draft",
  "compare",
  "estimate_roi",
  "prepare_options",
  "create_internal_plan",
  "generate_internal_asset",
]);

const VALID_APPROVAL_REQUIRED_ACTIONS: ReadonlySet<string> = new Set([
  "publish",
  "send_message",
  "contact_human",
  "spend_money",
  "buy_domain",
  "launch_ads",
  "deploy",
  "schedule_calendar_event",
  "modify_database",
  "connect_external_tool",
]);

const VALID_BLOCKED_ACTIONS: ReadonlySet<string> = new Set([
  "runtime_dispatch",
  "live_execution",
  "bypass_approval",
  "modify_rls",
  "hardcode_secret",
  "delete_records",
  "transfer_money",
  "access_private_data_without_scope",
]);

// ---------------------------------------------------------------------------
// Forbidden live-execution field names (shared pattern)
// ---------------------------------------------------------------------------

const LIVE_EXECUTION_FIELDS = [
  "executeNow",
  "liveMode",
  "runtimeDispatch",
  "externalWrite",
  "publishNow",
  "sendNow",
  "deployNow",
] as const;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function autonomyIssue(
  code: string,
  message: string,
  severity: WorkOrderAutonomyValidationSeverity = "error",
  path?: string,
): WorkOrderAutonomyIssue {
  const result: WorkOrderAutonomyIssue = { code, message, severity };
  if (path !== undefined) result.path = path;
  return result;
}

// ---------------------------------------------------------------------------
// Public: forbidden field deep scan
// ---------------------------------------------------------------------------

/**
 * Returns true if the input contains any field that implies live/runtime
 * execution. Scans recursively through nested objects and arrays.
 *
 * This function is pure — it does not mutate the input.
 */
export function hasForbiddenAutonomyFields(
  input: unknown,
): boolean {
  if (!input || typeof input !== "object") return false;

  if (Array.isArray(input)) {
    return input.some(hasForbiddenAutonomyFields);
  }

  for (const [key, value] of Object.entries(input)) {
    if ((LIVE_EXECUTION_FIELDS as readonly string[]).includes(key)) {
      return true;
    }
    if (hasForbiddenAutonomyFields(value)) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Public: main envelope validation
// ---------------------------------------------------------------------------

/**
 * Validates a Work Order Autonomy Envelope against the full contract rules.
 * Returns a structured validation result with issue codes.
 *
 * This function is pure — it does not mutate the input.
 */
export function validateWorkOrderAutonomyEnvelope(
  envelope: Record<string, unknown>,
): WorkOrderAutonomyResult {
  const issues: WorkOrderAutonomyIssue[] = [];

  // ---- Required identity fields ----

  if (!envelope.id) {
    issues.push(autonomyIssue("missing_id", "Envelope is missing id"));
  }

  if (!envelope.workOrderId) {
    issues.push(autonomyIssue("missing_work_order_id", "Envelope is missing workOrderId"));
  }

  if (!envelope.agentId) {
    issues.push(autonomyIssue("missing_agent_id", "Envelope is missing agentId"));
  }

  // ---- Autonomy level ----

  const level = envelope.autonomyLevel as string | undefined;
  if (!level) {
    issues.push(autonomyIssue("invalid_autonomy_level", "Envelope is missing autonomyLevel"));
  } else if (!VALID_AUTONOMY_LEVELS.has(level)) {
    issues.push(autonomyIssue(
      "invalid_autonomy_level",
      `Unknown autonomy level: "${level}". Valid values: ${[...VALID_AUTONOMY_LEVELS].join(", ")}`,
    ));
  }

  // ---- createdAt ----

  if (!envelope.createdAt || typeof envelope.createdAt !== "string" || (envelope.createdAt as string).trim() === "") {
    issues.push(autonomyIssue("missing_created_at", "Envelope is missing createdAt"));
  }

  // ---- Human-on-the-Loop enforcement ----

  if (envelope.humanOnTheLoop !== true) {
    issues.push(autonomyIssue(
      "human_on_the_loop_required",
      "humanOnTheLoop must be true — envelopes require human oversight",
    ));
  }

  if (envelope.noExecutionAuthorized !== true) {
    issues.push(autonomyIssue(
      "no_execution_authorized_required",
      "noExecutionAuthorized must be true — envelopes define planning boundaries, not execution authorization",
    ));
  }

  // ---- Allowed autonomous actions ----

  const allowedActions = envelope.allowedAutonomousActions as string[] | undefined;
  if (Array.isArray(allowedActions)) {
    for (let i = 0; i < allowedActions.length; i++) {
      const action = allowedActions[i];
      if (!VALID_AUTONOMOUS_ACTIONS.has(action)) {
        issues.push(autonomyIssue(
          "invalid_allowed_action",
          `"${action}" is not a valid autonomous action`,
          "error",
          `allowedAutonomousActions[${i}]`,
        ));
      }

      // Safety: no external/live/publishing/money/deployment/DB/calendar/runtime
      // actions may appear in allowed autonomous actions
      if (VALID_APPROVAL_REQUIRED_ACTIONS.has(action) || VALID_BLOCKED_ACTIONS.has(action)) {
        issues.push(autonomyIssue(
          "unsafe_autonomous_action",
          `"${action}" cannot be an autonomous action — it requires approval or is blocked`,
          "error",
          `allowedAutonomousActions[${i}]`,
        ));
      }
    }
  }

  // ---- Approval required actions ----

  const approvalActions = envelope.approvalRequiredActions as string[] | undefined;
  if (Array.isArray(approvalActions)) {
    for (let i = 0; i < approvalActions.length; i++) {
      const action = approvalActions[i];
      if (!VALID_APPROVAL_REQUIRED_ACTIONS.has(action)) {
        issues.push(autonomyIssue(
          "invalid_approval_required_action",
          `"${action}" is not a valid approval-required action`,
          "error",
          `approvalRequiredActions[${i}]`,
        ));
      }
    }
  }

  // ---- Blocked actions ----

  const blockedActions = envelope.blockedActions as string[] | undefined;
  if (Array.isArray(blockedActions)) {
    for (let i = 0; i < blockedActions.length; i++) {
      const action = blockedActions[i];
      if (!VALID_BLOCKED_ACTIONS.has(action)) {
        issues.push(autonomyIssue(
          "invalid_blocked_action",
          `"${action}" is not a valid blocked action`,
          "error",
          `blockedActions[${i}]`,
        ));
      }
    }
  }

  // ---- Forbidden execution fields (recursive) ----

  if (hasForbiddenAutonomyFields(envelope)) {
    issues.push(autonomyIssue(
      "forbidden_execution_field",
      "Envelope contains forbidden live-execution fields — envelopes are planning objects, not runtime commands",
    ));
  }

  return {
    valid: issues.filter((i) => i.severity === "error").length === 0,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Public: autonomy evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluates whether a requested action is permitted under the given
 * autonomy envelope. Returns a structured decision.
 *
 * This function is pure — it does not mutate the input.
 */
export function evaluateAutonomyRequest(
  envelope: Record<string, unknown>,
  requestedAction: string,
  context?: { estimatedCost?: number; riskLevel?: string },
): WorkOrderAutonomyEvaluation {
  const baseResult = {
    action: requestedAction,
    humanOnTheLoop: true as const,
    noExecutionAuthorized: true as const,
  };

  // ---- Blocked actions are always blocked ----

  const blockedActions = envelope.blockedActions as string[] | undefined;
  if (Array.isArray(blockedActions) && blockedActions.includes(requestedAction)) {
    return {
      ...baseResult,
      decision: "blocked",
      reason: `"${requestedAction}" is a blocked action — it is never permitted under any autonomy level`,
    };
  }

  // Also check against the canonical blocked set
  if (VALID_BLOCKED_ACTIONS.has(requestedAction)) {
    return {
      ...baseResult,
      decision: "blocked",
      reason: `"${requestedAction}" is a fundamentally blocked action — it violates safety boundaries`,
    };
  }

  // ---- Budget/cost escalation ----

  if (context?.estimatedCost !== undefined && typeof envelope.budgetLimit === "number") {
    if (context.estimatedCost > envelope.budgetLimit) {
      return {
        ...baseResult,
        decision: "escalation_required",
        reason: `Estimated cost (${context.estimatedCost}) exceeds budget limit (${envelope.budgetLimit})`,
      };
    }
  }

  // ---- Risk escalation ----

  if (context?.riskLevel !== undefined && typeof envelope.riskThreshold === "string") {
    const riskOrder = ["low", "medium", "high", "critical"];
    const requestedRiskIdx = riskOrder.indexOf(context.riskLevel);
    const thresholdIdx = riskOrder.indexOf(envelope.riskThreshold as string);

    if (requestedRiskIdx >= 0 && thresholdIdx >= 0 && requestedRiskIdx >= thresholdIdx) {
      return {
        ...baseResult,
        decision: "escalation_required",
        reason: `Risk level "${context.riskLevel}" meets or exceeds threshold "${envelope.riskThreshold}"`,
      };
    }
  }

  // ---- Approval-required actions ----

  const approvalActions = envelope.approvalRequiredActions as string[] | undefined;
  if (Array.isArray(approvalActions) && approvalActions.includes(requestedAction)) {
    return {
      ...baseResult,
      decision: "requires_approval",
      reason: `"${requestedAction}" requires explicit human approval`,
    };
  }

  // Also check against the canonical approval-required set
  if (VALID_APPROVAL_REQUIRED_ACTIONS.has(requestedAction)) {
    return {
      ...baseResult,
      decision: "requires_approval",
      reason: `"${requestedAction}" is an approval-required action by contract`,
    };
  }

  // ---- Allowed autonomous actions ----

  const allowedActions = envelope.allowedAutonomousActions as string[] | undefined;
  if (Array.isArray(allowedActions) && allowedActions.includes(requestedAction)) {
    return {
      ...baseResult,
      decision: "allowed_autonomous",
      reason: `"${requestedAction}" is an allowed autonomous action within the envelope`,
    };
  }

  // Also check against the canonical autonomous set
  if (VALID_AUTONOMOUS_ACTIONS.has(requestedAction)) {
    return {
      ...baseResult,
      decision: "allowed_autonomous",
      reason: `"${requestedAction}" is a known safe internal action`,
    };
  }

  // ---- Unknown action ----

  return {
    ...baseResult,
    decision: "requires_clarification",
    reason: `"${requestedAction}" is not recognized in any action category — clarification needed`,
  };
}

// ---------------------------------------------------------------------------
// Public: summary helper
// ---------------------------------------------------------------------------

/**
 * Creates a pure, human-readable summary of a Work Order Autonomy Envelope.
 * Emphasises the Human-on-the-Loop principle and controlled autonomy.
 *
 * This function is pure — it does not mutate the input.
 */
export function createAutonomyEnvelopeSummary(
  envelope: Record<string, unknown>,
): string {
  const id = envelope.id as string || "(inconnu)";
  const workOrderId = envelope.workOrderId as string || "(inconnu)";
  const agentId = envelope.agentId as string || "(inconnu)";
  const level = envelope.autonomyLevel as string || "(non défini)";

  const levelLabels: Record<string, string> = {
    supervised: "🔒 Supervisé — chaque action nécessite validation",
    delegated: "🔓 Délégué — actions internes autonomes, externes avec approbation",
    autonomous_dry_run: "📝 Dry-run autonome — planification libre, rien ne sort du système",
  };

  const levelLabel = levelLabels[level] || `⚠️ Niveau inconnu: ${level}`;

  const lines = [
    `### 🛡️ Enveloppe d'Autonomie — Work Order`,
    `- **ID** : \`${id}\``,
    `- **Work Order** : \`${workOrderId}\``,
    `- **Agent** : \`${agentId}\``,
    `- **Niveau** : ${levelLabel}`,
  ];

  // Autonomous actions
  const allowed = envelope.allowedAutonomousActions as string[] | undefined;
  if (Array.isArray(allowed) && allowed.length > 0) {
    lines.push(``, `#### ✅ Actions autonomes autorisées`);
    for (const action of allowed) {
      lines.push(`- 🟢 ${action}`);
    }
  }

  // Approval required
  const approval = envelope.approvalRequiredActions as string[] | undefined;
  if (Array.isArray(approval) && approval.length > 0) {
    lines.push(``, `#### 🟡 Actions nécessitant approbation`);
    for (const action of approval) {
      lines.push(`- 🟡 ${action}`);
    }
  }

  // Blocked
  const blocked = envelope.blockedActions as string[] | undefined;
  if (Array.isArray(blocked) && blocked.length > 0) {
    lines.push(``, `#### 🔴 Actions bloquées`);
    for (const action of blocked) {
      lines.push(`- 🔴 ${action}`);
    }
  }

  // Escalation triggers
  const triggers = envelope.escalationTriggers as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(triggers) && triggers.length > 0) {
    lines.push(``, `#### ⚡ Déclencheurs d'escalade`);
    for (const trigger of triggers) {
      const sev = trigger.severity === "critical" ? "🔴" : "🟡";
      lines.push(`- ${sev} **${trigger.condition || "(condition)"}** : ${trigger.description || "(sans description)"}`);
    }
  }

  // Constraints
  const constraints: string[] = [];
  if (typeof envelope.budgetLimit === "number") {
    constraints.push(`Budget max : ${envelope.budgetLimit} EUR`);
  }
  if (typeof envelope.timeLimitMinutes === "number") {
    constraints.push(`Temps max : ${envelope.timeLimitMinutes} min`);
  }
  if (typeof envelope.riskThreshold === "string") {
    constraints.push(`Seuil de risque : ${envelope.riskThreshold}`);
  }
  if (typeof envelope.maxToolCost === "number") {
    constraints.push(`Coût max par outil : ${envelope.maxToolCost} EUR`);
  }
  if (constraints.length > 0) {
    lines.push(``, `#### 📊 Contraintes`);
    for (const c of constraints) {
      lines.push(`- ${c}`);
    }
  }

  lines.push(
    ``,
    `---`,
    `💡 *Note Human-on-the-Loop : Cette enveloppe d'autonomie définit des limites de planification uniquement. Aucune exécution live, aucun déploiement, aucune dépense, aucune publication ou action externe n'est autorisée sans approbation humaine explicite. L'agent opère sous contrôle humain permanent.*`,
  );

  return lines.join("\n");
}
