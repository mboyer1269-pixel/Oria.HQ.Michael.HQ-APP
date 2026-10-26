#!/usr/bin/env node

// src/scripts/ci/rules-single-source.test.mjs
//
// Playbooks P0 — the agent rules have ONE versioned source:
// .agents/rules/core.md. Everything else references rules by id (R-...).
//
//   1. every rule id declared in core.md is unique;
//   2. charter-seed.ts and every .agents/skills/*/SKILL.md reference >= 1 id
//      that exists in core.md (and reference no unknown id);
//   3. no file outside core.md (in .agents/ or charter-seed.ts) recopies the
//      canonical sentence of a rule — checked through per-rule key phrases,
//      including the legacy wording the rules had before consolidation.

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..", "..");
const CORE = path.join(root, ".agents/rules/core.md");
const CHARTER = path.join(root, "src/features/agents/charter-seed.ts");

// Key phrases per rule (lowercase, whitespace-normalized substring match).
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
  "R-HANDOFF": ["final handoffs must include:", "final handoffs list: executive summary"],
};

const norm = (s) => s.toLowerCase().replace(/\s+/g, " ");
const ID_DECL = /^- \*\*(R-[A-Z0-9-]+)\*\*/gm;
const ID_REF = /\bR-[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b/g;

async function listAgentFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listAgentFiles(p)));
    else if (entry.name.endsWith(".md")) out.push(p);
  }
  return out;
}

async function coreIds() {
  const core = await readFile(CORE, "utf8");
  return [...core.matchAll(ID_DECL)].map((m) => m[1]);
}

test("core.md declares unique rule ids", async () => {
  const ids = await coreIds();
  assert.ok(ids.length > 0, ".agents/rules/core.md declares no rule ids");
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dupes, [], `duplicate rule ids: ${dupes.join(", ")}`);
  for (const id of Object.keys(KEY_PHRASES)) {
    assert.ok(ids.includes(id), `key-phrase list names ${id}, which core.md does not declare`);
  }
});

test("charter-seed.ts and every SKILL.md reference known rule ids", async () => {
  const ids = new Set(await coreIds());
  const skillsDir = path.join(root, ".agents/skills");
  const skills = (await readdir(skillsDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => path.join(skillsDir, d.name, "SKILL.md"));
  for (const file of [CHARTER, ...skills]) {
    const refs = [...new Set((await readFile(file, "utf8")).match(ID_REF) ?? [])];
    const rel = path.relative(root, file);
    assert.ok(refs.length > 0, `${rel} references no rule id from .agents/rules/core.md`);
    const unknown = refs.filter((r) => !ids.has(r));
    assert.deepEqual(unknown, [], `${rel} references unknown rule ids`);
  }
});

test("no file outside core.md recopies a rule's canonical text", async () => {
  const files = [CHARTER, ...(await listAgentFiles(path.join(root, ".agents")))].filter(
    (f) => f !== CORE,
  );
  const core = norm(await readFile(CORE, "utf8"));
  const hits = [];
  for (const [id, phrases] of Object.entries(KEY_PHRASES)) {
    assert.ok(
      phrases.some((p) => core.includes(norm(p))),
      `none of ${id}'s key phrases appear in core.md; update the phrase list with the rule`,
    );
    for (const file of files) {
      const text = norm(await readFile(file, "utf8"));
      for (const p of phrases) {
        if (text.includes(norm(p))) hits.push(`${path.relative(root, file)}: ${id} ("${p}")`);
      }
    }
  }
  assert.deepEqual(hits, [], `rule text recopied outside core.md:\n${hits.join("\n")}`);
});
