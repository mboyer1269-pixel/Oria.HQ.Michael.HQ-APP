import type { AgentProfile } from "./types";
import type { SkillProfile } from "@/features/skills/types";

// ---------------------------------------------------------------------------
// Agent ↔ Skill mapping helpers — pure functions, no I/O.
// ---------------------------------------------------------------------------

export type AgentSkillMappingResult = {
  agent: AgentProfile;
  /** Skills found in the catalog for this agent's skillIds. */
  matched: SkillProfile[];
  /** skillIds declared on the agent but absent from the catalog. */
  missing: string[];
};

export type MappingValidationReport = {
  valid: boolean;
  results: AgentSkillMappingResult[];
  /** Skill IDs present in the catalog but not claimed by any agent. */
  unclaimed: string[];
};

/**
 * Returns the catalog skills assigned to a single agent, plus any
 * skillIds the agent declares that have no corresponding catalog entry.
 */
export function getSkillsForAgent(
  agent: AgentProfile,
  skills: SkillProfile[],
): AgentSkillMappingResult {
  const matched = skills.filter((s) => agent.skillIds.includes(s.id));
  const matchedIds = new Set(matched.map((s) => s.id));
  const missing = agent.skillIds.filter((id) => !matchedIds.has(id));
  return { agent, matched, missing };
}

/**
 * Validates the full agent registry against the skills catalog.
 *
 * Returns:
 *  - per-agent matched/missing breakdown
 *  - catalog skills claimed by no agent (unclaimed)
 *  - `valid: true` only when every declared skillId resolves and every
 *    catalog skill is claimed by at least one agent
 */
export function validateAgentSkillMapping(
  agents: AgentProfile[],
  skills: SkillProfile[],
): MappingValidationReport {
  const results = agents.map((agent) => getSkillsForAgent(agent, skills));

  const allClaimedIds = new Set(agents.flatMap((a) => a.skillIds));
  const unclaimed = skills.filter((s) => !allClaimedIds.has(s.id)).map((s) => s.id);

  const anyMissing = results.some((r) => r.missing.length > 0);
  const valid = !anyMissing && unclaimed.length === 0;

  return { valid, results, unclaimed };
}
