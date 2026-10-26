import "server-only";

import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { resolveAuthzContext, WorkspaceAccessError, type Identity } from "@/server/auth/authz-context";

export const NO_ACTIVE_WORKSPACE_MESSAGE = "Aucun espace actif, choisis ou crée un espace.";

export type MemoryWorkspaceResolution =
  | { status: "ok"; workspaceId: string }
  | { status: "no-workspace"; message: string; code: WorkspaceAccessError["code"] };

/**
 * Resolves the active workspace for /hq/memory from the authenticated identity.
 * Returns `workspaceId` = ctx.workspace.id (the workspace slug, the canonical
 * key used by the file vault). WorkspaceAccessError becomes a no-workspace
 * state; any other error still throws.
 */
export function resolveMemoryWorkspace(identity: Identity): MemoryWorkspaceResolution {
  try {
    const ctx = getActiveWorkspaceContext({
      ...resolveAuthzContext(identity),
      email: identity.email,
      emailVerified: identity.emailVerified,
    });
    return { status: "ok", workspaceId: ctx.workspace.id };
  } catch (error) {
    if (error instanceof WorkspaceAccessError) {
      return { status: "no-workspace", message: NO_ACTIVE_WORKSPACE_MESSAGE, code: error.code };
    }
    throw error;
  }
}
