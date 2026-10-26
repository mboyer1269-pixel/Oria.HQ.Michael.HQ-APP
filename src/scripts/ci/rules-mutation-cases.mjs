// Mutation cases for the rules single-source guard. Each case rewrites ONE
// real file; the guard (rules-single-source.test.mjs) must then fail.
// Used in-memory by rules-single-source-mutation.test.mjs and on disk by
// rules-mutation-red.mjs (red proof against the real guard).
const SCOUT = ".agents/skills/orya-innovation-scout/SKILL.md";
const PLANNER = ".agents/skills/orya-pr-planner/SKILL.md";
const CHARTER = "src/features/agents/charter-seed.ts";
const BOUNDARY_IDS = 'rules: ["R-SCOUT-READ-ONLY", "R-ZONE-RED", "R-NO-SECRETS", "R-NO-DEPLOY", "R-NO-PROD-ACCESS", "R-ESCALATE-RED"]';

const insertAfter = (anchor, add) => (t) => {
  if (!t.includes(anchor)) throw new Error(`anchor missing: ${anchor}`);
  return t.replace(anchor, `${anchor}\n${add}`);
};

export const CASES = [
  {
    name: "EN paraphrase inside a ## Boundaries section (even with an id)",
    file: SCOUT, probe: "Only Michael may merge into main",
    apply: insertAfter(BOUNDARY_IDS, "- Only Michael may merge into main; agents never merge. <!-- R-NO-MERGE -->"),
  },
  {
    name: "FR prose in a charter escalation field (even with an id)",
    file: CHARTER, probe: "Ne fusionne pas vers main sans Michael",
    apply: (t) => t.replace('escalation: ruleLabel("R-ESCALATION-ROUTE#hermes-escalation"),',
      'escalation: "Ne fusionne pas vers main sans Michael", // R-NO-MERGE'),
  },
  {
    name: "rule moved OUT of its section into body prose (EN paraphrase)",
    file: SCOUT, probe: "Only Michael may merge into main",
    apply: insertAfter("## Research Domains", "\nOnly Michael may merge into main; agents never merge."),
  },
  {
    name: "'Agents are forbidden to merge' (no normative keyword)",
    file: PLANNER, probe: "Agents are forbidden to merge",
    apply: insertAfter("## Checklist", "\n- Agents are forbidden to merge."),
  },
  {
    name: "'Ne fusionne pas vers main sans Michael' in a charter list",
    file: CHARTER, probe: "Ne fusionne pas vers main sans Michael",
    apply: (t) => t.replace("successCriteria: [", 'successCriteria: [\n      "Ne fusionne pas vers main sans Michael",'),
  },
  {
    name: "'Michael alone merges' (no normative keyword)",
    file: PLANNER, probe: "Michael alone merges",
    apply: insertAfter("## Checklist", "\nMichael alone merges."),
  },
  {
    name: "rule:local exemption inside a constraint section",
    file: SCOUT, probe: "Never touch prod",
    apply: insertAfter(BOUNDARY_IDS, "- Never touch prod. <!-- rule:local(convenience) -->"),
  },
  {
    name: "bare rule:local (no reason)",
    file: PLANNER, probe: "Agents must never merge",
    apply: insertAfter("## Checklist", "\nAgents must never merge. <!-- rule:local -->"),
  },
  {
    name: "rule added to vendored supabase/SKILL.md",
    file: ".agents/skills/supabase/SKILL.md", probe: null, vendored: true,
    apply: insertAfter("## Core Principles", "\nAgents must never deploy migrations without approval."),
  },
];
