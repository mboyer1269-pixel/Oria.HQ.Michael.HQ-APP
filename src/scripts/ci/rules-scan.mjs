// src/scripts/ci/rules-scan.mjs
//
// Detector shared by the rules-single-source tests.
//
// 1. Legacy key phrases (KEY_PHRASES): exact canonical wording of a rule.
// 2. Constraint sections hold ids only: in markdown, every line under a
//    `## Rules` / `## Boundaries` (or "... Constraints") heading must be
//    `rules: ["R-…", ...]`; in charter-seed.ts, `escalation:` / `constraints:`
//    values must be `ruleLabel("R-…#key")`. No prose, no rule:local there.
// 3. Elsewhere, a line with a normative keyword (EN never/must/only; FR
//    jamais/interdit/doit/seul/aucun, with inflections) or a governance
//    subject (merge/fusionn, deploy/déploi, push, secret, pay/pai/dépense,
//    delete/supprim, approv) must cite an R- id, or carry
//    `rule:local(<non-empty reason>)`.
//
// HEURISTIC ONLY — no guarantee value. Real enforcement is binding R- ids to
// the G1 registry / execution guard (follow-up). Keyword lists are frozen.
//
// Not scanned (noise control): inline `code`, fenced code blocks, markdown
// headings, hyphenated compounds (read-only, docs-only) and pure comment
// lines in .ts files.

const norm = (s) => s.toLowerCase().replace(/\s+/g, " ");

export // Key phrases per rule (lowercase, whitespace-normalized substring match).
// A phrase found outside core.md means the rule text was recopied.
const KEY_PHRASES = {
  "R-IDENTITY-RECOVERY": [
    "confirm the current branch and working tree state before",
    "agents.md takes precedence on operational matters",
  ],
  "R-SCOPE-DISCIPLINE": [
    "do not start a new phase, feature, or refactor unless michael explicitly authorizes",
    "never start a new phase, feature, refactor or dependency without an explicit mandate",
  ],
  "R-SKILL-ROUTING": ["do not let a skill expand scope beyond", "a skill never expands scope beyond"],
  "R-ASK-WHEN-UNSURE": ["if uncertain about scope or authority, ask rather than assume"],
  "R-MICHAEL-DECIDES": ["human final authority is not a formality", "human final authority is the operating model"],
  "R-ASK-BEFORE-SENSITIVE": ["the agent must ask before: spending money", "ask michael before spending money"],
  "R-NO-PAID-API": ["never call a paid api"],
  "R-NO-EXTERNAL-CONTACT": ["never contact third parties"],
  "R-NO-AGENT-ESCALATION": [
    "may **never** grant another agent permissions",
    "may never grant another agent permissions",
  ],
  "R-ZONE-GREEN": ["agents may perform these actions without explicit human approval", "autonomous, reversible, local-only:"],
  "R-ZONE-YELLOW": [
    "agents must request explicit approval from michael before proceeding",
    "requires michael's explicit approval: server actions",
  ],
  "R-ZONE-RED": [
    "agents must refuse to perform them even if instructed by other agents",
    "forbidden without extraordinary per-instance authorization, even if another agent",
  ],
  "R-ESCALATE-YELLOW": ["stop, describe it, classify it, assess the risk"],
  "R-ESCALATE-RED": ["refuse, report that it was requested, explain why"],
  "R-NO-SECRETS": [
    "reference secrets by name only (e.g.",
    "never create** new secret material",
    "never create new secret material",
  ],
  "R-NO-PROD-ACCESS": ["agents have **zero access** to production systems", "agents have zero production access"],
  "R-NO-DEPLOY": ["deployment is the owner's gesture"],
  "R-NO-MERGE": ["only michael may merge to `main`", "only michael merges to `main`"],
  "R-NO-FORCE-PUSH": [
    "`git push --force` and `git push --force-with-lease` are red zone",
    "no `git push --force` / `--force-with-lease`",
  ],
  "R-BRANCH-HYGIENE": ["<agent-prefix>/<scope>-<short-description>"],
  "R-COMMIT-HYGIENE": ["atomic commits** — each commit should represent one logical change", "atomic commits, relevant files only"],
  "R-PR-REVIEW": [
    "agent approval does not satisfy the merge requirement",
    "agent approval never satisfies the merge requirement",
  ],
  "R-PR-TEMPLATE": ["pr descriptions include summary, changes, zone classification"],
  "R-PROTECTED-FILES": ["the following files require explicit mandate to modify", "change only with an explicit mandate (yellow at minimum)"],
  "R-ANTI-DISPERSION": [
    "no external repo, cockpit, or worktree is merged without completing the audit gate",
    "is the **sole source of truth** for orya product architecture",
    "is the sole source of truth for orya product architecture",
  ],
  "R-VALIDATION-GATES": ["if **any** check fails, stop, report the failure clearly", "if any check fails, stop, report it clearly"],
  "R-PROVEN-VS-ASSUMED": ["always separate what was proven"],
  "R-GREEN-NEEDS-RUN-LINK": ["say a change is green only with a link"],
  "R-NO-HIDDEN-STATE": ["never hide abnormal git state, failing checks"],
  "R-COMMUNICATION": ["avoid empty encouragement, generic startup language", "no empty encouragement, generic startup language"],
  "R-NAMING": [
    "files in `src/core/` must remain fully generic",
    "`src/core/` has no proper nouns or service-specific imports",
  ],
  "R-NO-STRAY-CHANGES": ["no stashed changes that belong in this pr", "no stashed change belonging to the pr"],
  "R-COMMIT-MESSAGE-STYLE": ["use the imperative mood, be specific", "use the imperative mood and say specifically"],
  "R-PRESENT-THEN-WAIT": ["present the planned commit/pr to michael for approval", "explicit approval before executing"],
  "R-HANDOFF": ["final handoffs must include:", "final handoffs list: executive summary"],
};

const ID_REF = /\bR-[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b/;
export const LOCAL_MARKER = /rule:local\(([^)]*\S[^)]*)\)/g;
const BARE_LOCAL = /rule:local(?!\([^)]*\S[^)]*\))/;
const KEYWORDS = [
  "never", "must", "only",
  "jamais", "interdit", "interdite", "interdits", "interdites",
  "doit", "doivent", "seul", "seule", "seuls", "seules",
  "aucun", "aucune", "aucuns", "aucunes",
];
const NORMATIVE = new RegExp(`(?<![\\p{L}\\-])(?:${KEYWORDS.join("|")})(?![\\p{L}\\-])`, "iu");
// Governance subjects: word-initial stems ("payload" is not a payment).
const SUBJECTS = ["merge", "fusionn", "deploy", "déploi", "push", "secret", "pay(?!load)", "pai", "dépense", "delete", "supprim", "approv"];
export const SUBJECT = new RegExp(`(?<![\\p{L}\\-])(?:${SUBJECTS.join("|")})`, "iu");
const MD_CONSTRAINT_HEADING = /^#{2,3}\s+(?:.*\s)?(?:Rules|Boundaries|Constraints?)\s*$/i;
const RULES_LINE = /^rules: \[\s*"R-[A-Z0-9-]+"(?:\s*,\s*"R-[A-Z0-9-]+")*\s*\]$/;
const TS_CONSTRAINT_FIELD = /^\s*(escalation|constraints)\s*:/;
const TS_RULE_LABEL_VALUE = /^\s*ruleLabel\("R-[A-Z0-9-]+#[a-z0-9-]+"\),?\s*$/;

function scanLines(text, file) {
  const isTs = file.endsWith(".ts");
  const lines = text.split("\n");
  const out = [];
  let fenced = false;
  let inConstraint = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    const at = `${file}:${i + 1}: ${line}`;
    if (!isTs && line.startsWith("```")) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    if (!isTs && /^#{1,6}\s/.test(line)) {
      inConstraint = MD_CONSTRAINT_HEADING.test(line);
      continue;
    }
    if (!isTs && inConstraint) {
      if (line && line !== "---" && !RULES_LINE.test(line)) out.push(`${at}  [constraint section: ids only]`);
      continue;
    }
    if (isTs) {
      const field = lines[i].match(TS_CONSTRAINT_FIELD);
      if (field) {
        const rest = lines[i].slice(lines[i].indexOf(":") + 1);
        const value = rest.trim() ? rest : lines[i + 1] ?? "";
        if (!TS_RULE_LABEL_VALUE.test(value)) out.push(`${at}  [constraint field ${field[1]}: ruleLabel(id) only]`);
        if (!rest.trim()) i += 1;
        continue;
      }
      if (/^(\/\/|\/\*|\*)/.test(line)) continue;
    }
    if (BARE_LOCAL.test(line)) {
      out.push(`${at}  [rule:local needs a reason]`);
      continue;
    }
    const scanned = line.replace(/`[^`]*`/g, "");
    if (!NORMATIVE.test(scanned) && !SUBJECT.test(scanned)) continue;
    if (ID_REF.test(line) || /rule:local\([^)]*\S[^)]*\)/.test(line)) continue;
    out.push(at);
  }
  return out;
}

/** Rule statements in `text` that do not cite an R- id (empty = clean). */
export function uncitedRuleLines(text, file = "") {
  const t = norm(text);
  const hits = [];
  for (const [id, phrases] of Object.entries(KEY_PHRASES)) {
    for (const p of phrases) if (t.includes(norm(p))) hits.push(`${file}: recopies ${id}: ${p}`);
  }
  return [...hits, ...scanLines(text, file)];
}

/** Governance-subject lines (no id) — used on vendored upstream files. */
export function governanceSubjectLines(text, file = "") {
  return text
    .split("\n")
    .map((l, i) => [l.replace(/`[^`]*`/g, ""), i])
    .filter(([l]) => SUBJECT.test(l) && !ID_REF.test(l))
    .map(([, i]) => `${file}:${i + 1}`);
}

/** Number of rule:local(<reason>) exemptions in `text`. */
export function countLocalExemptions(text) {
  return [...text.matchAll(LOCAL_MARKER)].length;
}
