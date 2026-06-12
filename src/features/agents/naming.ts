import { agentRegistry } from "./seed";

// ---------------------------------------------------------------------------
// Agent naming layer — pure helpers, no I/O.
//
// Technical agent IDs are immutable: ledger rows, execution licenses, webhook
// bindings, council roleIds and DB enums reference them. Product display
// names resolve through this module only — never hard-code an agent name in
// UI strings or prompts.
// ---------------------------------------------------------------------------

/** Writer/ledger aliases that map onto canonical registry agent ids. */
const AGENT_ID_ALIASES: Record<string, string> = {
  agent_hermes: "hermes",
  joris_orchestrator: "joris",
};

/**
 * Former display names (pre naming v1, mythological set) → canonical agent
 * id. Lets legacy stored data (snapshots, notes, exports) resolve to the
 * current product name instead of dangling.
 */
export const LEGACY_AGENT_NAME_TO_ID: Record<string, string> = {
  "Hermès": "hermes",
  "Orion": "orion",
  "Thémis": "sentinel",
  "Mnémosyne": "scribe",
  "Ploutos": "finops",
  "Héphaïstos": "builder",
  "Peithô": "closer",
  "Phémé": "marketing",
  "Dédale": "inventor",
};

/** Resolve any agent reference (id, ledger alias, legacy name) to a canonical id. */
export function resolveAgentId(idOrAlias: string): string {
  return AGENT_ID_ALIASES[idOrAlias] ?? LEGACY_AGENT_NAME_TO_ID[idOrAlias] ?? idOrAlias;
}

/**
 * Product display name for an agent reference. Falls back to the raw input
 * when the reference does not resolve to a registry agent, so unknown writers
 * stay visible instead of disappearing.
 */
export function getAgentDisplayName(idOrAlias: string): string {
  const id = resolveAgentId(idOrAlias);
  return agentRegistry.find((agent) => agent.id === id)?.name ?? idOrAlias;
}
