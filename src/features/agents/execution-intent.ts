// src/features/agents/execution-intent.ts
//
// Pure model for an AGENT EXECUTION INTENT -- one executable action an agent
// (Hermès / Relay) has prepared and queued for CEO approval. Unlike a
// PreparedAction (the locked, manual-send-only cash-outreach proposal), an
// execution intent IS dispatchable -- but ONLY after the CEO manually approves
// it, which is the single trigger that fires the n8n webhook.
//
// Lifecycle: pending -> executing -> executed | failed. A rate-limited dispatch
// may return executing -> pending so the CEO can retry. The builder forces a new
// intent to "pending" and locks requiresCeoApproval to literal true, so an
// intent can never be constructed pre-approved or pre-executed.
//
// Dependency-free and pure: no Supabase, no network, no clock, no AI. The
// repository owns persistence; this module owns shape, validation, and the
// legal status transitions.

export type AgentExecutionIntentStatus = "pending" | "executing" | "executed" | "failed";

export const AGENT_EXECUTION_INTENT_STATUSES: readonly AgentExecutionIntentStatus[] = [
  "pending",
  "executing",
  "executed",
  "failed",
];

// The strict payload that will be dispatched to n8n. Mirrors
// n8nWebhookPayloadSchema (the Zod contract) as a plain type so this pure model
// never imports server/agents tool code.
export type AgentExecutionIntentPayload = {
  agentId: string;
  skillId: string;
  client: string;
  email: string;
  actionType: string;
  missionId: string;
  ventureId?: string;
  data: Record<string, unknown>;
};

export type AgentExecutionIntent = {
  intentId: string;
  workspaceId: string;
  agentId: string;
  skillId: string;
  // Which MCP tool dispatches this intent (e.g. "n8n_webhook_trigger").
  toolName: string;
  // Requested autonomy level for the Sentinelle re-evaluation at approval time.
  autonomyLevel: number;
  status: AgentExecutionIntentStatus;
  payload: AgentExecutionIntentPayload;
  // Set once the dispatch returns a reference.
  actionRef?: string;
  // Set when a dispatch fails.
  failureCode?: string;
  createdAt: string;
  updatedAt: string;
  // Governance lock -- an intent is a proposal until the CEO approves it.
  requiresCeoApproval: true;
};

// ---------------------------------------------------------------------------
// Legal status transitions
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<AgentExecutionIntentStatus, readonly AgentExecutionIntentStatus[]> = {
  // pending -> failed covers a terminal reject (e.g. Sentinelle BLOCK at approval)
  // before the intent ever enters the executing (in-flight) state.
  pending: ["executing", "failed"],
  executing: ["executed", "failed", "pending"],
  executed: [],
  failed: [],
};

export function canTransitionExecutionIntent(
  from: AgentExecutionIntentStatus,
  to: AgentExecutionIntentStatus,
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type AgentExecutionIntentValidation = {
  valid: boolean;
  errors: string[];
};

function requireText(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${field} must be non-empty`);
  }
}

function validatePayload(payload: AgentExecutionIntentPayload, errors: string[]): void {
  if (!payload || typeof payload !== "object") {
    errors.push("payload must be present");
    return;
  }
  requireText(payload.agentId, "payload.agentId", errors);
  requireText(payload.skillId, "payload.skillId", errors);
  requireText(payload.client, "payload.client", errors);
  requireText(payload.actionType, "payload.actionType", errors);
  requireText(payload.missionId, "payload.missionId", errors);
  if (typeof payload.email !== "string" || !payload.email.includes("@")) {
    errors.push("payload.email must be an email address");
  }
  if (payload.ventureId !== undefined) {
    requireText(payload.ventureId, "payload.ventureId", errors);
  }
  if (typeof payload.data !== "object" || payload.data === null || Array.isArray(payload.data)) {
    errors.push("payload.data must be an object");
  }
}

export function validateAgentExecutionIntent(intent: AgentExecutionIntent): AgentExecutionIntentValidation {
  const errors: string[] = [];

  requireText(intent.intentId, "intentId", errors);
  requireText(intent.workspaceId, "workspaceId", errors);
  requireText(intent.agentId, "agentId", errors);
  requireText(intent.skillId, "skillId", errors);
  requireText(intent.toolName, "toolName", errors);

  if (
    typeof intent.autonomyLevel !== "number" ||
    !Number.isInteger(intent.autonomyLevel) ||
    intent.autonomyLevel < 0 ||
    intent.autonomyLevel > 5
  ) {
    errors.push("autonomyLevel must be an integer between 0 and 5");
  }

  if (!AGENT_EXECUTION_INTENT_STATUSES.includes(intent.status)) {
    errors.push("status must be a known status");
  }

  validatePayload(intent.payload, errors);

  if (intent.actionRef !== undefined) {
    requireText(intent.actionRef, "actionRef", errors);
  }
  if (intent.failureCode !== undefined) {
    requireText(intent.failureCode, "failureCode", errors);
  }

  if (typeof intent.createdAt !== "string" || isNaN(+new Date(intent.createdAt))) {
    errors.push("createdAt must be a valid ISO date string");
  }
  if (typeof intent.updatedAt !== "string" || isNaN(+new Date(intent.updatedAt))) {
    errors.push("updatedAt must be a valid ISO date string");
  }

  if (intent.requiresCeoApproval !== true) {
    errors.push("requiresCeoApproval must be true");
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

// The build boundary accepts everything except the governance lock and the
// runtime-managed fields (status, actionRef, failureCode). The builder forces
// status to "pending" and the lock to true, so an intent can never be
// constructed in an already-approved or already-executed state.
export type BuildAgentExecutionIntentInput = Omit<
  AgentExecutionIntent,
  "status" | "requiresCeoApproval" | "actionRef" | "failureCode" | "updatedAt"
> & { updatedAt?: string };

export function buildAgentExecutionIntent(
  input: BuildAgentExecutionIntentInput,
): AgentExecutionIntent {
  return {
    intentId: input.intentId,
    workspaceId: input.workspaceId,
    agentId: input.agentId,
    skillId: input.skillId,
    toolName: input.toolName,
    autonomyLevel: input.autonomyLevel,
    status: "pending",
    payload: structuredClone(input.payload),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
    requiresCeoApproval: true,
  };
}
