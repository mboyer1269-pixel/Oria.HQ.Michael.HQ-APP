/**
 * Workspace-specific configuration for the Michael HQ workspace.
 *
 * This file is the ONLY place in the codebase where workspace-specific proper
 * nouns (display names, mode labels, project names) should appear. The core
 * registry (src/core/workspaces/registry.ts) stays generic and delegates to
 * this config.
 *
 * When a second workspace is added, create a parallel config file and update
 * the registry resolver accordingly.
 */

import type { WorkspaceConfig } from "@/core/workspaces/types";

export const MICHAEL_HQ_WORKSPACE_CONFIG: WorkspaceConfig = {
  slug: "michael-hq",
  displayName: "Michael HQ",
  defaultModeId: "hq",
  defaultAssistantId: "joris",
  defaultAssistantName: "Joris",
  defaultAssistantRuntimeId: "joris-brain",
  defaultAssistantAllowedTools: ["calendar.book", "brief.generate"],
  modes: [
    { id: "personal", label: "Personnel" },
    { id: "hq", label: "HQ" },
    { id: "suivia", label: "Suivia" },
    { id: "mcl", label: "MCL" },
  ],
};
