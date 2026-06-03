import type { WorkspaceMode } from "@/core/types";

/**
 * Generic workspace configuration contract.
 * Workspace-specific values live in src/config/workspaces/*.config.ts.
 * The core registry (registry.ts) consumes this type without knowing
 * any workspace-specific proper nouns.
 */
export type WorkspaceConfig = {
  slug: string;
  displayName: string;
  defaultModeId: string;
  defaultAssistantId: string;
  defaultAssistantName: string;
  defaultAssistantRuntimeId: string;
  defaultAssistantAllowedTools: string[];
  modes: WorkspaceMode[];
};
