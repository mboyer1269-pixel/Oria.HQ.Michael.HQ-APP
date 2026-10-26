"use server";
import { requireOwnerAccess } from "@/server/auth/owner";
import { getDefaultWorkspace } from "@/core/workspaces/registry";
import { agentRegistry } from "@/features/agents/seed";
import { isAgentDisplayNameStorageEnabled } from "@/server/agents/display-names/flag";
import { createAgentNameStore } from "@/server/agents/display-names/supabase-store";
import { mergeAgentNames, readAgentNames, writeAgentName, NAMES_UNAVAILABLE } from "@/server/agents/display-names/service";
import type { AgentDisplayNameWriteResult } from "@/features/agents/display-name";

export async function getAgentDisplayNames() {
  const access = await requireOwnerAccess("/hq/agents");
  if (access.status === "forbidden") return null;
  const workspace = getDefaultWorkspace({ ownerUserId: access.user.id });
  let store = null;
  if (isAgentDisplayNameStorageEnabled()) {
    try { store = await createAgentNameStore(); } catch { /* Report unavailable, never claim persistence. */ }
  }
  const names = await readAgentNames({ ownerId: access.user.id, workspaceId: workspace.id }, agentRegistry, store);
  return { workspaceId: workspace.id, status: names.status, ...mergeAgentNames(workspace, agentRegistry, names.overrides) };
}

export async function saveAgentDisplayName(input: unknown): Promise<AgentDisplayNameWriteResult> {
  const access = await requireOwnerAccess("/hq/agents");
  if (access.status === "forbidden") return { status: "forbidden", message: "Accès réservé au propriétaire." };
  const workspace = getDefaultWorkspace({ ownerUserId: access.user.id });
  let store = null;
  if (isAgentDisplayNameStorageEnabled()) {
    try { store = await createAgentNameStore(); } catch { return { status: "unavailable", message: NAMES_UNAVAILABLE }; }
  }
  return writeAgentName({ ownerId: access.user.id, workspaceId: workspace.id }, agentRegistry, input, store);
}
