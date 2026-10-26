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

import { KEY_PHRASES, countLocalExemptions, uncitedRuleLines } from "./rules-scan.mjs";
import { LOCK, vendoredState } from "./vendored-hash.mjs";

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

// Third-party skill packs vendored verbatim (technical Postgres/Supabase docs,
// not Orya governance). Excluded from the normative-line scan by name.
const VENDORED = [".agents/skills/supabase/", ".agents/skills/supabase-postgres-best-practices/"];

test("every normative / governance-subject line outside core.md cites a rule id (or rule:local(<reason>)); constraint sections hold only rules: [ids]", async () => {
  const files = [CHARTER, ...(await listAgentFiles(path.join(root, ".agents")))]
    .filter((f) => f !== CORE)
    .filter((f) => !VENDORED.some((v) => path.relative(root, f).startsWith(v)));
  const hits = [];
  for (const f of files) hits.push(...uncitedRuleLines(await readFile(f, "utf8"), path.relative(root, f)));
  assert.deepEqual(hits, [], `normative lines without an R- id:\n${hits.join("\n")}`);
});

test("core-rule-labels.generated.ts is in sync with core.md", async () => {
  const { parseLabels, render, OUT } = await import("./generate-rule-labels.mjs");
  const labels = parseLabels(await readFile(CORE, "utf8"));
  const ids = new Set(await coreIds());
  for (const key of Object.keys(labels)) assert.ok(ids.has(key.split("#")[0]), `label ${key}: unknown rule id`);
  assert.equal(await readFile(OUT, "utf8"), render(labels), "run node src/scripts/ci/generate-rule-labels.mjs");
});

test("charter registry served to agents is byte-identical to the pre-change snapshot", async () => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") } });
  const { charterRegistry } = await jiti.import(CHARTER);
  const snapshot = await readFile(
    path.join(root, "src/features/agents/__snapshots__/charter-registry.snapshot.json"),
    "utf8",
  );
  assert.equal(`${JSON.stringify(charterRegistry, null, 2)}\n`, snapshot);
});

// Ratchet: rule:local(<reason>) exemptions may only go down. Lower this number
// when you promote one to an R- id; raising it fails CI by design.
const FROZEN_RULE_LOCAL = 21;

test(`rule:local exemptions do not grow (frozen at ${FROZEN_RULE_LOCAL})`, async () => {
  const files = [CHARTER, ...(await listAgentFiles(path.join(root, ".agents")))]
    .filter((f) => !VENDORED.some((v) => path.relative(root, f).startsWith(v)));
  let n = 0;
  for (const f of files) n += countLocalExemptions(await readFile(f, "utf8"));
  assert.ok(n <= FROZEN_RULE_LOCAL, `rule:local count ${n} > frozen ${FROZEN_RULE_LOCAL}`);
});

test("vendored supabase* skill packs match the frozen content hash (incl. governance-subject lines)", async () => {
  const frozen = JSON.parse(await readFile(LOCK, "utf8"));
  delete frozen.overlaps;
  assert.deepEqual(await vendoredState(), frozen,
    "vendored skill content drifted: review the change for governance rules (cite R- ids), then run node src/scripts/ci/vendored-hash.mjs --write");
});

// Reviewed vendored lines that restate a core.md rule (#450). Upstream text is
// not edited; the overlap is recorded in the lock file instead.
const REQUIRED_OVERLAPS = [{ file: "supabase/SKILL.md", line: 44, overlaps: "R-NO-SECRETS" }];

test("vendored overlap notes point at declared core.md ids and the reviewed notes are present", async () => {
  const { overlaps = [] } = JSON.parse(await readFile(LOCK, "utf8"));
  const ids = await coreIds();
  for (const o of overlaps) {
    assert.ok(ids.includes(o.overlaps), `overlap ${o.file}:${o.line} cites unknown id ${o.overlaps}`);
    const text = await readFile(path.join(root, ".agents/skills", o.file), "utf8");
    assert.ok(text.split("\n")[o.line - 1]?.trim(), `overlap ${o.file}:${o.line} points at an empty/missing line`);
  }
  for (const r of REQUIRED_OVERLAPS) {
    assert.ok(overlaps.some((o) => o.file === r.file && o.line === r.line && o.overlaps === r.overlaps),
      `required overlap note missing: ${r.file}:${r.line} -> ${r.overlaps}`);
  }
});
