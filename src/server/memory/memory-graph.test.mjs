#!/usr/bin/env node
// Tests for memory-graph.ts — Memory Vault v0.1 pure logic:
// id normalization, backlink extraction, entry parsing, graph building,
// duplicate detection, and chainline mapping.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

async function loadModule() {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });
  return jiti.import(path.join(__dirname, "memory-graph.ts"));
}

function makeEntry(overrides = {}) {
  return {
    id: "entry-1",
    type: "note",
    title: "Entry 1",
    status: "active",
    tags: [],
    sourceRefs: [],
    links: [],
    body: "",
    ...overrides,
  };
}

test("normalizeMemoryId", async () => {
  const { normalizeMemoryId } = await loadModule();

  assert.equal(normalizeMemoryId("Decision Name"), "decision-name");
  assert.equal(normalizeMemoryId("Décision Mémoire Vault"), "decision-memoire-vault");
  assert.equal(normalizeMemoryId("  --Weird__Input!!  "), "weird-input");
  assert.equal(normalizeMemoryId("already-normalized"), "already-normalized");
  assert.equal(normalizeMemoryId(""), "");
});

test("extractBacklinks: plain, typed, ref kinds, dedupe", async () => {
  const { extractBacklinks } = await loadModule();

  const markdown = [
    "Voir [[Decision Name]] et [[agent:joris]].",
    "Aussi [[venture:loi96]], [[ledger:evt-123]], [[pr:memory-vault-v0-1]], [[next:do-thing]].",
    "Répété : [[Decision Name]] et [[agent:joris]].",
  ].join("\n");

  const links = extractBacklinks(markdown);
  assert.equal(links.length, 6);

  const plain = links.find((l) => l.targetId === "decision-name");
  assert.ok(plain);
  assert.equal(plain.targetType, undefined);
  assert.equal(plain.refKind, undefined);

  const agent = links.find((l) => l.targetId === "joris");
  assert.equal(agent.targetType, "agent");

  const venture = links.find((l) => l.targetId === "loi96");
  assert.equal(venture.targetType, "venture");

  const ledger = links.find((l) => l.refKind === "ledger");
  assert.equal(ledger.targetId, "evt-123");

  const pr = links.find((l) => l.refKind === "pr");
  assert.equal(pr.targetId, "memory-vault-v0-1");
  assert.equal(pr.targetType, "pr");

  const next = links.find((l) => l.refKind === "next");
  assert.equal(next.targetId, "do-thing");
});

test("extractBacklinks: empty and malformed input", async () => {
  const { extractBacklinks } = await loadModule();

  assert.deepEqual(extractBacklinks(""), []);
  assert.deepEqual(extractBacklinks("no links here"), []);
  assert.deepEqual(extractBacklinks("[[]] [[ ]]"), []);
});

test("parseMemoryEntryMarkdown: frontmatter + body links", async () => {
  const { parseMemoryEntryMarkdown } = await loadModule();

  const raw = [
    "---",
    "id: my-decision",
    "type: decision",
    "title: My Decision",
    "status: active",
    "project: oria-hq",
    "tags: governance, memory-vault",
    "confidence: high",
    "sourceRefs: AGENTS.md, docs/MEMORY_VAULT_CONTRACT.md",
    "createdAt: 2026-06-12",
    "updatedAt: 2026-06-12",
    "---",
    "",
    "# My Decision",
    "",
    "Body referencing [[agent:joris]] and [[source:memory-vault-contract]].",
  ].join("\n");

  const entry = parseMemoryEntryMarkdown(raw, "memory/decisions/my-decision.md");
  assert.ok(entry);
  assert.equal(entry.id, "my-decision");
  assert.equal(entry.type, "decision");
  assert.equal(entry.title, "My Decision");
  assert.equal(entry.project, "oria-hq");
  assert.deepEqual(entry.tags, ["governance", "memory-vault"]);
  assert.equal(entry.confidence, "high");
  assert.deepEqual(entry.sourceRefs, ["AGENTS.md", "docs/MEMORY_VAULT_CONTRACT.md"]);
  assert.equal(entry.createdAt, "2026-06-12");
  assert.equal(entry.filePath, "memory/decisions/my-decision.md");
  assert.equal(entry.links.length, 2);
  assert.equal(entry.links[0].targetId, "joris");
  assert.equal(entry.links[1].targetId, "memory-vault-contract");
});

test("parseMemoryEntryMarkdown: defaults and fallbacks", async () => {
  const { parseMemoryEntryMarkdown } = await loadModule();

  // No frontmatter — title from heading, type defaults to note.
  const headingOnly = parseMemoryEntryMarkdown("# Heading Title\n\nBody.");
  assert.ok(headingOnly);
  assert.equal(headingOnly.id, "heading-title");
  assert.equal(headingOnly.type, "note");
  assert.equal(headingOnly.status, "active");

  // Unknown type falls back to note.
  const unknownType = parseMemoryEntryMarkdown("---\ntype: galaxy\ntitle: X\n---\nBody");
  assert.equal(unknownType.type, "note");

  // No title at all — unparseable, returns null.
  assert.equal(parseMemoryEntryMarkdown("just some text"), null);
  assert.equal(parseMemoryEntryMarkdown(""), null);
});

test("buildMemoryGraph: nodes, missing targets, edge dedupe, backlinks, orphans", async () => {
  const { buildMemoryGraph } = await loadModule();

  const entries = [
    makeEntry({
      id: "a",
      title: "A",
      links: [
        { targetId: "b", raw: "b" },
        { targetId: "b", raw: "b" }, // duplicate edge
        { targetId: "a", raw: "a" }, // self-link, dropped
        { targetId: "ghost", targetType: "agent", raw: "agent:ghost" }, // missing
      ],
    }),
    makeEntry({ id: "b", title: "B" }),
    makeEntry({ id: "orphan", title: "Orphan" }),
  ];

  const graph = buildMemoryGraph(entries);

  // 3 real nodes + 1 missing node.
  assert.equal(graph.nodes.length, 4);
  const ghost = graph.nodes.find((n) => n.id === "ghost");
  assert.equal(ghost.missing, true);
  assert.equal(ghost.type, "agent");

  // Deduped: a->b once, a->ghost once. Self-link dropped.
  assert.equal(graph.edges.length, 2);
  assert.ok(!graph.edges.some((e) => e.sourceId === "a" && e.targetId === "a"));

  assert.deepEqual(graph.backlinks.b, ["a"]);
  assert.deepEqual(graph.orphanIds, ["orphan"]);
});

test("buildMemoryGraph: chainline entries produce chainline edges", async () => {
  const { buildMemoryGraph } = await loadModule();

  const entries = [
    makeEntry({
      id: "chain",
      type: "chainline",
      title: "Chain",
      links: [{ targetId: "a", raw: "a" }],
    }),
    makeEntry({ id: "a", title: "A" }),
  ];

  const graph = buildMemoryGraph(entries);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0].kind, "chainline");
});

test("detectDuplicateMemory: id and title collisions", async () => {
  const { detectDuplicateMemory } = await loadModule();

  // No duplicates.
  assert.deepEqual(
    detectDuplicateMemory([makeEntry({ id: "a", title: "A" }), makeEntry({ id: "b", title: "B" })]),
    [],
  );

  // Id collision.
  const idDupes = detectDuplicateMemory([
    makeEntry({ id: "same", title: "First" }),
    makeEntry({ id: "same", title: "Second" }),
  ]);
  assert.equal(idDupes.length, 1);
  assert.equal(idDupes[0].reason, "id");
  assert.equal(idDupes[0].entryIds.length, 2);

  // Same normalized title within the same type, different ids.
  const titleDupes = detectDuplicateMemory([
    makeEntry({ id: "x", type: "note", title: "Même Note" }),
    makeEntry({ id: "y", type: "note", title: "meme note" }),
  ]);
  assert.equal(titleDupes.length, 1);
  assert.equal(titleDupes[0].reason, "title");

  // Same title but different types — not a duplicate.
  assert.deepEqual(
    detectDuplicateMemory([
      makeEntry({ id: "x", type: "note", title: "Shared" }),
      makeEntry({ id: "y", type: "decision", title: "Shared" }),
    ]),
    [],
  );
});

test("buildChainlineGraph: stage mapping, order, missing stages", async () => {
  const { buildChainlineGraph } = await loadModule();

  const entries = [
    makeEntry({ id: "src-1", type: "source", title: "The Source" }),
    makeEntry({ id: "note-1", type: "note", title: "The Note" }),
    makeEntry({ id: "dec-1", type: "decision", title: "The Decision" }),
    makeEntry({ id: "act-1", type: "action", title: "The Action" }),
    makeEntry({ id: "joris", type: "agent", title: "Joris" }),
    makeEntry({
      id: "chain-1",
      type: "chainline",
      title: "Chain 1",
      links: [
        { targetId: "src-1", targetType: "source", raw: "source:src-1" },
        { targetId: "note-1", targetType: "note", raw: "note:note-1" },
        { targetId: "dec-1", targetType: "decision", raw: "decision:dec-1" },
        { targetId: "act-1", targetType: "action", raw: "action:act-1" },
        { targetId: "joris", targetType: "agent", raw: "agent:joris" }, // context, skipped
        { targetId: "evt-9", refKind: "ledger", raw: "ledger:evt-9" },
        { targetId: "pr-9", refKind: "pr", targetType: "pr", raw: "pr:pr-9" },
        { targetId: "follow-up", refKind: "next", raw: "next:follow-up" },
      ],
    }),
  ];

  const paths = buildChainlineGraph(entries);
  assert.equal(paths.length, 1);

  const [chain] = paths;
  assert.equal(chain.id, "chain-1");
  assert.deepEqual(
    chain.steps.map((s) => s.stage),
    ["source", "note", "decision", "action", "ledger", "pr", "next"],
  );
  assert.deepEqual(chain.missingStages, []);

  // Resolved steps carry the entry title; unresolved keep the raw link.
  assert.equal(chain.steps[0].label, "The Source");
  assert.equal(chain.steps[0].resolved, true);
  const ledgerStep = chain.steps.find((s) => s.stage === "ledger");
  assert.equal(ledgerStep.resolved, false);
  assert.equal(ledgerStep.label, "ledger:evt-9");

  // Agent link is context, not a chain step.
  assert.ok(!chain.steps.some((s) => s.targetId === "joris"));
});

test("buildChainlineGraph: incomplete chain reports missing stages", async () => {
  const { buildChainlineGraph } = await loadModule();

  const entries = [
    makeEntry({ id: "dec-1", type: "decision", title: "Lonely Decision" }),
    makeEntry({
      id: "chain-1",
      type: "chainline",
      title: "Partial Chain",
      links: [{ targetId: "dec-1", targetType: "decision", raw: "decision:dec-1" }],
    }),
  ];

  const [chain] = buildChainlineGraph(entries);
  assert.deepEqual(chain.missingStages, ["source", "note", "action", "ledger", "pr", "next"]);
});

test("chainlinesForEntry: membership lookup", async () => {
  const { buildChainlineGraph, chainlinesForEntry } = await loadModule();

  const entries = [
    makeEntry({ id: "dec-1", type: "decision", title: "D" }),
    makeEntry({ id: "unrelated", title: "U" }),
    makeEntry({
      id: "chain-1",
      type: "chainline",
      title: "Chain",
      links: [{ targetId: "dec-1", targetType: "decision", raw: "decision:dec-1" }],
    }),
  ];

  const chainlines = buildChainlineGraph(entries);
  assert.equal(chainlinesForEntry("dec-1", chainlines).length, 1);
  assert.equal(chainlinesForEntry("chain-1", chainlines).length, 1);
  assert.equal(chainlinesForEntry("unrelated", chainlines).length, 0);
});

test("seed vault files parse and chain end-to-end", async () => {
  const { parseMemoryEntryMarkdown, buildMemoryGraph, buildChainlineGraph, detectDuplicateMemory } =
    await loadModule();
  const { readFile, readdir } = await import("node:fs/promises");

  const memoryRoot = path.join(projectRoot, "memory");
  const entries = [];
  async function walk(dir) {
    for (const dirent of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, dirent.name);
      if (dirent.isDirectory()) await walk(full);
      else if (
        dirent.name.endsWith(".md") &&
        !["readme.md", "index.md"].includes(dirent.name.toLowerCase())
      ) {
        const entry = parseMemoryEntryMarkdown(await readFile(full, "utf8"), full);
        if (entry) entries.push(entry);
      }
    }
  }
  await walk(memoryRoot);

  assert.ok(entries.length >= 8, `expected >= 8 seed entries, got ${entries.length}`);
  assert.deepEqual(detectDuplicateMemory(entries), []);

  const graph = buildMemoryGraph(entries);
  assert.ok(graph.edges.length > 0);

  const chainlines = buildChainlineGraph(entries);
  assert.ok(chainlines.length >= 1, "expected at least one chainline in the seed vault");
  for (const chainline of chainlines) {
    assert.deepEqual(
      chainline.missingStages,
      [],
      `chainline ${chainline.id} has missing stages: ${chainline.missingStages.join(", ")}`,
    );
  }
});
