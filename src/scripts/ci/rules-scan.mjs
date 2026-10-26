// src/scripts/ci/rules-scan.mjs
//
// Detector shared by the rules-single-source tests.
//
// 1. Legacy key phrases (KEY_PHRASES): exact canonical wording of a rule.
// 2. Normative lines: outside core.md, any line in a scanned file that uses a
//    normative keyword (EN: never, must, only; FR: jamais, interdit, doit,
//    seul, aucun, with inflections) must cite an R- id from core.md, or carry
//    an explicit `rule:local` marker (a skill- or agent-specific guideline
//    that is not a governance rule). Rephrasing a rule cannot hide it.
//
// Noise control (deliberately narrow): inline `code`, fenced code blocks,
// markdown headings, hyphenated compounds (read-only, --name-only, docs-only)
// and pure comment lines in .ts files are not scanned.

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
const LOCAL_MARKER = /rule:local/;
const KEYWORDS = [
  "never", "must", "only",
  "jamais", "interdit", "interdite", "interdits", "interdites",
  "doit", "doivent", "seul", "seule", "seuls", "seules",
  "aucun", "aucune", "aucuns", "aucunes",
];
// Word boundary that also rejects hyphen compounds (read-only, docs-only).
const NORMATIVE = new RegExp(`(?<![\\p{L}\\-])(?:${KEYWORDS.join("|")})(?![\\p{L}\\-])`, "iu");

function normativeLines(text, file) {
  const isTs = file.endsWith(".ts");
  const out = [];
  let fenced = false;
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!isTs && line.startsWith("```")) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    if (!isTs && line.startsWith("#")) return;
    if (isTs && /^(\/\/|\/\*|\*)/.test(line)) return;
    const scanned = line.replace(/`[^`]*`/g, "");
    if (!NORMATIVE.test(scanned)) return;
    if (ID_REF.test(line) || LOCAL_MARKER.test(line)) return;
    out.push(`${file}:${i + 1}: ${line}`);
  });
  return out;
}

/** Rule statements in `text` that do not cite an R- id (empty = clean). */
export function uncitedRuleLines(text, file = "") {
  const t = norm(text);
  const hits = [];
  for (const [id, phrases] of Object.entries(KEY_PHRASES)) {
    for (const p of phrases) if (t.includes(norm(p))) hits.push(`${file}: recopies ${id}: ${p}`);
  }
  return [...hits, ...normativeLines(text, file)];
}
