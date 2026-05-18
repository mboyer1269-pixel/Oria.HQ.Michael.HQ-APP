import type { ActiveWorkspaceContext, Workspace } from "@/core/types";
import {
  getDefaultAssistantProfile,
  getDefaultWorkspace,
  getDefaultWorkspaceMode,
} from "@/core/workspaces/registry";
import { getServerUserContext, type ServerUserContext } from "@/server/auth/user-context";

/**
 * The active workspace + user context for a server-side request.
 *
 * Forward-compatible with multi-workspace: today we always resolve to the
 * single default workspace, but call sites that depend on `workspace` will
 * keep working when we add a real workspace resolver (e.g. from the URL or a
 * session claim).
 */
export type WorkspaceContext = ActiveWorkspaceContext & {
  workspace: Workspace;
  userId: string;
  storagePreference: ServerUserContext["storagePreference"];
};

/**
 * Resolve the active workspace context.
 *
 * This is a thin wrapper around the existing single-owner `getServerUserContext`.
 * Existing call sites can stay on `getServerUserContext` while new code starts
 * using `getActiveWorkspaceContext`. Phase 6 routes everything through this
 * function via a context-firewall middleware.
 */
export function getActiveWorkspaceContext(): WorkspaceContext {
  const user = getServerUserContext();
  const workspace = getDefaultWorkspace({ ownerUserId: user.userId });
  const activeMode = getDefaultWorkspaceMode(workspace);
  const activeAgentProfile = getDefaultAssistantProfile(workspace);

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
