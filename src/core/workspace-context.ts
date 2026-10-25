import { resolveAuthzContext, getAuthorizedWorkspaceConfig } from "@/server/auth/authz-context";
import type { ActiveWorkspaceContext, Workspace } from "@/core/types";
import {
  getDefaultAssistantProfile,
  getDefaultWorkspace,
  getDefaultWorkspaceMode,
} from "@/core/workspaces/registry";
import { getServerUserContext, type ServerUserContext } from "@/server/auth/user-context";

/** Active workspace and user context for server-side operations. */
export type WorkspaceContext = ActiveWorkspaceContext & {
  workspace: Workspace;
  userId: string;
  storagePreference: ServerUserContext["storagePreference"];
};

/**
 * Explicit identities/selections are authorized; no-argument callers retain the
 * configured owner's declared workspace default for backward compatibility.
 * HTTP boundaries should supply the authenticated user and selected workspace.
 */
export function getActiveWorkspaceContext(opts?: { workspaceId?: string; userId?: string; email?: string; emailVerified?: boolean }): WorkspaceContext {
  const user: ServerUserContext = opts?.userId
    ? { userId: opts.userId, email: opts.email, storagePreference: "supabase" }
    : getServerUserContext();
  // No arguments preserves the configured owner's declared default for legacy callers.
  // This is never a fallback for an unknown explicitly requested workspace.
  const authz = opts ? resolveAuthzContext({ ...user, emailVerified: opts.emailVerified === true }, opts.workspaceId) : undefined;
  const config = authz ? getAuthorizedWorkspaceConfig(authz.workspaceId) : undefined;
  const workspace = config ? {
    id: config.slug, slug: config.slug, displayName: config.displayName,
    ownerUserId: user.userId, modes: config.modes, defaultAssistantId: config.defaultAssistantId,
  } : getDefaultWorkspace({ ownerUserId: user.userId });
  const activeMode = config ? workspace.modes.find((m) => m.id === config.defaultModeId)! : getDefaultWorkspaceMode(workspace);
  const activeAgentProfile = config ? {
    id: config.defaultAssistantId, workspaceId: workspace.id, name: config.defaultAssistantName,
    runtimeId: config.defaultAssistantRuntimeId, allowedTools: config.defaultAssistantAllowedTools,
  } : getDefaultAssistantProfile(workspace);

  return {
    activeWorkspace: workspace,
    activeMode,
    activeAgentProfile,
    currentOwnerUser: {
      id: user.userId,
      email: user.email,
    },
    workspace,
    userId: user.userId,
    storagePreference: user.storagePreference,
  };
}
