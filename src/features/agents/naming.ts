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

// ---------------------------------------------------------------------------
// Council role resolution — see docs/AGENT_NAMING.md.
//
// Council `roleId`s (src/server/agents/agent-council-run-contract.ts) fall into
// two intentional families:
//   - agent-backed: the role IS a registry agent, displayed under its product
//     name (e.g. `auditor` → Sentinel, `hermes` → Relay).
//   - synthetic lenses: council-only reasoning functions with no standalone
//     agent (`orient`, `t_gravity`, `operator`). They carry an explicit label
//     so the UI never shows a raw token, and resolveCouncilRoleToAgentId()
//     returns null for them — by design, not by accident.
//
// Keys are plain strings (not AgentCouncilRoleId) to avoid a features → server
// import. `naming-contract.test.mjs` asserts these two maps cover
// AGENT_COUNCIL_ROLE_IDS exactly (agent XOR synthetic), so any drift between the
// council contract and this layer fails loudly there.
//
// Note: AGENT_ID_ALIASES above resolves WRITER/ledger aliases; the map below
// resolves COUNCIL roleIds. They are separate concerns and may overlap
// (`joris_orchestrator` appears in both) without conflicting.
// ---------------------------------------------------------------------------

/** Council roleIds that ARE a registry agent → canonical registry agent id. */
export const COUNCIL_ROLE_TO_AGENT: Record<string, string> = {
  joris_orchestrator: "joris",
  hermes: "hermes",
  auditor: "sentinel",
  builder: "builder",
  scribe: "scribe",
  closer: "closer",
};

/** Council roleIds that are deliberation lenses, not agents → display label. */
export const SYNTHETIC_COUNCIL_ROLES: Record<string, { label: string }> = {
  orient: { label: "Cadrage" },
  t_gravity: { label: "Gravité éco." },
  operator: { label: "Opérateur" },
};

/**
 * Resolve a council roleId to a canonical registry agent id, or `null` when the
 * role is a synthetic deliberation lens (`orient`, `t_gravity`, `operator`).
 */
export function resolveCouncilRoleToAgentId(roleId: string): string | null {
  return COUNCIL_ROLE_TO_AGENT[roleId] ?? null;
}

/**
 * Product display name for a council roleId: the agent's product name when the
 * role is agent-backed, the lens label when it is synthetic, and the raw token
 * as a last-resort fallback so unknown roles stay visible instead of vanishing.
 */
export function getCouncilRoleDisplayName(roleId: string): string {
  const agentId = COUNCIL_ROLE_TO_AGENT[roleId];
  if (agentId !== undefined) return getAgentDisplayName(agentId);
  const synthetic = SYNTHETIC_COUNCIL_ROLES[roleId];
  if (synthetic !== undefined) return synthetic.label;
  return roleId;
}
