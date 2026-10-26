import type { AgentProfile, Workspace } from "@/core/types";
import { getDefaultAssistantProfile } from "@/core/workspaces/registry";
import { normalizeAgentDisplayName, type AgentDisplayNameWriteResult } from "@/features/agents/display-name";

export type NameScope = { ownerId: string; workspaceId: string };
export type NameRow = { user_id: string; workspace_id: string; agent_id: string; display_name: string };
export interface AgentNameStore {
  read(scope: NameScope): Promise<NameRow[]>;
  write(scope: NameScope, agentId: string, name: string | null): Promise<void>;
}
export const NAMES_UNAVAILABLE = "Renommage indisponible : stockage durable non provisionné ou non qualifié. Aucune sauvegarde confirmée. Relisez les noms avant une nouvelle tentative.";

export async function readAgentNames(scope: NameScope, agents: readonly AgentProfile[], store: AgentNameStore | null) {
  const overrides: Record<string, string> = Object.create(null);
  if (!store) return { status: "unavailable" as const, overrides };
  try {
    for (const row of await store.read(scope)) {
      if (row.user_id !== scope.ownerId || row.workspace_id !== scope.workspaceId) throw new Error("scope mismatch");
      const name = normalizeAgentDisplayName(row.display_name);
      if (!agents.some(agent => agent.id === row.agent_id) || !name) throw new Error("invalid stored name");
      overrides[row.agent_id] = name;
    }
    return { status: "available" as const, overrides };
  } catch { return { status: "unavailable" as const, overrides: Object.create(null) as Record<string, string> }; }
}

export async function writeAgentName(scope: NameScope, agents: readonly AgentProfile[], input: unknown, store: AgentNameStore | null): Promise<AgentDisplayNameWriteResult> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { status: "invalid", message: "Demande invalide." };
  const data = input as Record<string, unknown>;
  if (Object.keys(data).sort().join(",") !== "agentId,displayName" || typeof data.agentId !== "string" || !agents.some(a => a.id === data.agentId)) return { status: "invalid", message: "Agent inconnu ou champs non autorisés." };
  const name = data.displayName === null ? null : normalizeAgentDisplayName(data.displayName);
  if (data.displayName !== null && name === null) return { status: "invalid", message: "Le nom doit contenir entre 1 et 80 caractères, sans caractères de contrôle." };
  if (!store) return { status: "unavailable", message: NAMES_UNAVAILABLE };
  try { await store.write(scope, data.agentId, name); return { status: "saved", displayName: name }; }
  catch { return { status: "unavailable", message: NAMES_UNAVAILABLE }; }
}

/** Presentation-only merge: never mutate the registry, profile IDs, tools or runtime. */
export function mergeAgentNames(workspace: Workspace, agents: readonly AgentProfile[], overrides: Readonly<Record<string, string>>) {
  return {
    agents: agents.map(agent => ({ ...agent, name: overrides[agent.id] ?? agent.name })),
    assistant: getDefaultAssistantProfile(workspace, overrides),
  };
}
