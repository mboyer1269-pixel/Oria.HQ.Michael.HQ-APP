import type { AssistantProfile, Workspace, WorkspaceMode } from "@/core/types";
import type { WorkspaceConfig } from "@/core/workspaces/types";
import { MICHAEL_HQ_WORKSPACE_CONFIG } from "@/config/workspaces/michael-hq.config";

/**
 * The active workspace config. The core registry is generic -- all
 * workspace-specific proper nouns live in the config file, not here.
 *
 * Phase 7: replace this single-config constant with a map or DB resolver
 * when multiple workspaces are supported.
 */
const ACTIVE_WORKSPACE_CONFIG: WorkspaceConfig = MICHAEL_HQ_WORKSPACE_CONFIG;

export const DEFAULT_WORKSPACE_SLUG = ACTIVE_WORKSPACE_CONFIG.slug;
export const DEFAULT_WORKSPACE_MODE_ID = ACTIVE_WORKSPACE_CONFIG.defaultModeId;
export const DEFAULT_ASSISTANT_PROFILE_ID = ACTIVE_WORKSPACE_CONFIG.defaultAssistantId;

type GetDefaultWorkspaceInput = {
  ownerUserId: string;
};

/**
 * Returns the default workspace bound to the given owner. Pure function -- the
 * registry has no I/O. Workspace-specific display values are loaded from the
 * config file (src/config/workspaces/michael-hq.config.ts), keeping this core
 * function free of proper nouns.
 */
export function getDefaultWorkspace(input: GetDefaultWorkspaceInput): Workspace {
  return {
    id: ACTIVE_WORKSPACE_CONFIG.slug,
    slug: ACTIVE_WORKSPACE_CONFIG.slug,
    displayName: ACTIVE_WORKSPACE_CONFIG.displayName,
    ownerUserId: input.ownerUserId,
    modes: ACTIVE_WORKSPACE_CONFIG.modes,
    defaultAssistantId: ACTIVE_WORKSPACE_CONFIG.defaultAssistantId,
  };
}

export function getDefaultWorkspaceMode(workspace: Workspace): WorkspaceMode {
  return (
    workspace.modes.find((mode) => mode.id === ACTIVE_WORKSPACE_CONFIG.defaultModeId) ??
    workspace.modes[0]
  );
}

export function getDefaultAssistantProfile(workspace: Workspace): AssistantProfile {
  return {
    id: workspace.defaultAssistantId,
    workspaceId: workspace.id,
    name: ACTIVE_WORKSPACE_CONFIG.defaultAssistantName,
    runtimeId: ACTIVE_WORKSPACE_CONFIG.defaultAssistantRuntimeId,
    allowedTools: ACTIVE_WORKSPACE_CONFIG.defaultAssistantAllowedTools,
  };
}
