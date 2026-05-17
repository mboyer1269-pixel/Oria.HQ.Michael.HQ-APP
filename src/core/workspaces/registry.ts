import type { Workspace } from "@/core/types";

/**
 * Built-in workspace slug for the founder's HQ. In a later phase this becomes
 * one of many entries in a workspace database; for now it's the only workspace
 * the system knows about.
 */
export const DEFAULT_WORKSPACE_SLUG = "michael-hq";

type GetDefaultWorkspaceInput = {
  ownerUserId: string;
};

/**
 * Returns the default workspace bound to the given owner. Pure function — the
 * registry has no I/O yet. Phase 7 moves the modes and the "Michael HQ" copy
 * out of core and into a workspace-scoped config file.
 */
export function getDefaultWorkspace(input: GetDefaultWorkspaceInput): Workspace {
  return {
    id: DEFAULT_WORKSPACE_SLUG,
    slug: DEFAULT_WORKSPACE_SLUG,
    displayName: "Michael HQ",
    ownerUserId: input.ownerUserId,
    modes: [
      { id: "personal", label: "Personnel" },
      { id: "hq", label: "HQ" },
      { id: "suivia", label: "Suivia" },
      { id: "mcl", label: "MCL" },
    ],
    defaultAssistantId: "joris",
  };
}
