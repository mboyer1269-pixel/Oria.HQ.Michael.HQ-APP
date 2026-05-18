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
  /** When true, the action runs without human approval. */
  autoApprove: boolean;
  /** When true, even auto-approve actions surface a confirmation UI before execution. */
  requiresConfirmation: boolean;
  reason?: string;
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
