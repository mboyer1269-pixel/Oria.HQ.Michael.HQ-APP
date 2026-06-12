#!/usr/bin/env node
// Tests for agent-learning-loop.ts — Compound Learning Loop pure logic:
// verdict adaptation, ROI summaries, lesson derivation, vault dedupe,
// and markdown serialization round-trip.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

async function loadModules() {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });
  const loop = await jiti.import(path.join(__dirname, "agent-learning-loop.ts"));
  const graph = await jiti.import(path.join(__dirname, "memory-graph.ts"));
  return { loop, graph };
}

function makeSignal(overrides = {}) {
  return {
    candidateId: "cand-1",
    kind: "agent-action",
    decision: "promising",
    score: 70,
    netValueCents: 10_000,
    roiMultiple: 3,
    reasons: [],
    storedAt: "2026-06-12T00:00:00.000Z",
    ...overrides,
  };
}

test("adaptStoredVerdict: flattens verdict + candidate metadata", async () => {
  const { loop } = await loadModules();

  const signal = loop.adaptStoredVerdict(
    {
      storedAt: "2026-06-12T10:00:00.000Z",
      verdict: {
        candidateId: "cand-9",
        kind: "mission",
        decision: "reject",
        score: 20,
        netValueCents: -500,
        roiMultiple: 0.5,
        reasons: ["ROI trop faible"],
        guardReason: "red zone",
      },
    },
    { agentId: "joris", title: "Relance pipeline" },
  );

  assert.equal(signal.candidateId, "cand-9");
  assert.equal(signal.agentId, "joris");
  assert.equal(signal.title, "Relance pipeline");
  assert.equal(signal.decision, "reject");
  assert.equal(signal.guardReason, "red zone");
  assert.equal(signal.storedAt, "2026-06-12T10:00:00.000Z");

  // Without candidate metadata, attribution fields stay absent.
  const bare = loop.adaptStoredVerdict({
    storedAt: "2026-06-12T10:00:00.000Z",
    verdict: {
      candidateId: "cand-10",
      kind: "idea",
      decision: "marginal",
      score: 50,
      netValueCents: null,
      roiMultiple: null,
      reasons: [],
    },
  });
  assert.equal(bare.agentId, undefined);
});

test("buildAgentRoiSummaries: grouping, aggregates, ordering", async () => {
  const { loop } = await loadModules();

  const signals = [
    makeSignal({ candidateId: "a1", agentId: "joris", netValueCents: 20_000, roiMultiple: 4, score: 80 }),
    makeSignal({ candidateId: "a2", agentId: "joris", decision: "reject", netValueCents: -1_000, roiMultiple: 0.2, score: 30 }),
    makeSignal({ candidateId: "a3", agentId: "hermes", netValueCents: 5_000, roiMultiple: 2, score: 60 }),
    makeSignal({ candidateId: "a4", decision: "not-evaluable", netValueCents: null, roiMultiple: null, score: 0 }),
  ];

  const summaries = loop.buildAgentRoiSummaries(signals);
  assert.equal(summaries.length, 3);

  // Ordered by total net value DESC: joris (19000) > hermes (5000) > non-attribué (0).
  assert.equal(summaries[0].agentKey, "joris");
  assert.equal(summaries[0].signals, 2);
  assert.equal(summaries[0].promising, 1);
  assert.equal(summaries[0].rejected, 1);
  assert.equal(summaries[0].totalNetValueCents, 19_000);
  assert.equal(summaries[0].bestRoiMultiple, 4);
  assert.equal(summaries[0].winRate, 0.5);
  assert.equal(summaries[0].averageScore, 55);

  assert.equal(summaries[1].agentKey, "hermes");
  assert.equal(summaries[2].agentKey, loop.UNATTRIBUTED_AGENT_KEY);
  assert.equal(summaries[2].winRate, null);

  assert.deepEqual(loop.buildAgentRoiSummaries([]), []);
});

test("deriveLessonProposals: failure pattern needs repeated reason", async () => {
  const { loop } = await loadModules();

  // One reject only — below threshold, no lesson.
  const single = loop.deriveLessonProposals(
    [makeSignal({ decision: "reject", reasons: ["Coût supérieur au revenu"] })],
    [],
  );
  assert.equal(single.proposals.length, 0);

  // Same reason twice — lesson proposed.
  const repeated = loop.deriveLessonProposals(
    [
      makeSignal({ candidateId: "r1", decision: "reject", reasons: ["Coût supérieur au revenu"] }),
      makeSignal({ candidateId: "r2", decision: "reject", reasons: ["Coût supérieur au revenu"] }),
    ],
    [],
  );
  assert.equal(repeated.proposals.length, 1);
  const [lesson] = repeated.proposals;
  assert.equal(lesson.kind, "failure-pattern");
  assert.equal(lesson.id, "lesson-failure-cout-superieur-au-revenu");
  assert.deepEqual(lesson.sourceRefs, ["r1", "r2"]);
  assert.equal(lesson.confidence, "medium");
});

test("deriveLessonProposals: guard and winning patterns", async () => {
  const { loop } = await loadModules();

  const signals = [
    // Guard pattern: same guard reason twice.
    makeSignal({ candidateId: "g1", decision: "not-evaluable", guardReason: "Zone rouge: envoi externe" }),
    makeSignal({ candidateId: "g2", decision: "not-evaluable", guardReason: "Zone rouge: envoi externe" }),
    // Winning pattern: joris twice promising at ROI >= 2.
    makeSignal({ candidateId: "w1", agentId: "joris", roiMultiple: 3, netValueCents: 10_000 }),
    makeSignal({ candidateId: "w2", agentId: "joris", roiMultiple: 2.5, netValueCents: 5_000 }),
    // Below ROI threshold — never counts toward winning pattern.
    makeSignal({ candidateId: "w3", agentId: "joris", roiMultiple: 1.5 }),
  ];

  const { proposals } = loop.deriveLessonProposals(signals, []);
  const kinds = proposals.map((p) => p.kind).sort();
  assert.deepEqual(kinds, ["guard-pattern", "winning-pattern"]);

  const winning = proposals.find((p) => p.kind === "winning-pattern");
  assert.equal(winning.agentKey, "joris");
  assert.deepEqual(winning.sourceRefs, ["w1", "w2"]);
  assert.ok(winning.content.includes("150.00$"));
});

test("deriveLessonProposals: dedupes against existing vault entries", async () => {
  const { loop } = await loadModules();

  const signals = [
    makeSignal({ candidateId: "r1", decision: "reject", reasons: ["ROI trop faible"] }),
    makeSignal({ candidateId: "r2", decision: "reject", reasons: ["ROI trop faible"] }),
  ];

  // Existing entry with the exact lesson id.
  const byId = loop.deriveLessonProposals(signals, [
    {
      id: "lesson-failure-roi-trop-faible",
      type: "note",
      title: "Autre titre",
      status: "active",
      tags: [],
      sourceRefs: [],
      links: [],
      body: "",
    },
  ]);
  assert.equal(byId.proposals.length, 0);
  assert.equal(byId.duplicatesSkipped, 1);

  // Existing note with the same normalized title, different id.
  const byTitle = loop.deriveLessonProposals(signals, [
    {
      id: "autre-id",
      type: "note",
      title: "Pattern d'échec: ROI trop faible",
      status: "active",
      tags: [],
      sourceRefs: [],
      links: [],
      body: "",
    },
  ]);
  assert.equal(byTitle.proposals.length, 0);
  assert.equal(byTitle.duplicatesSkipped, 1);
});

test("buildLearningLoopReport: assembles summaries + proposals", async () => {
  const { loop } = await loadModules();

  const report = loop.buildLearningLoopReport(
    [
      makeSignal({ candidateId: "r1", decision: "reject", reasons: ["X"] }),
      makeSignal({ candidateId: "r2", decision: "reject", reasons: ["X"] }),
    ],
    [],
  );
  assert.equal(report.signalCount, 2);
  assert.equal(report.summaries.length, 1);
  assert.equal(report.proposals.length, 1);
  assert.equal(report.duplicatesSkipped, 0);
});

test("serializeLessonProposalMarkdown round-trips through the vault parser", async () => {
  const { loop, graph } = await loadModules();

  const proposal = {
    id: "lesson-winning-joris",
    kind: "winning-pattern",
    title: "Pattern gagnant: joris (ROI ≥ 2x)",
    content: "2 verdicts promising à fort ROI.",
    tags: ["learning-loop", "winning-pattern", "roi"],
    sourceRefs: ["w1", "w2"],
    confidence: "medium",
    agentKey: "joris",
  };

  const markdown = loop.serializeLessonProposalMarkdown(proposal, "2026-06-12");
  const entry = graph.parseMemoryEntryMarkdown(markdown, "memory/notes/lesson-winning-joris.md");

  assert.ok(entry);
  assert.equal(entry.id, "lesson-winning-joris");
  assert.equal(entry.type, "note");
  assert.equal(entry.status, "proposed");
  assert.deepEqual(entry.tags, ["learning-loop", "winning-pattern", "roi"]);
  assert.deepEqual(entry.sourceRefs, ["w1", "w2"]);
  assert.equal(entry.createdAt, "2026-06-12");
  // The agent backlink lands in the graph.
  assert.equal(entry.links.length, 1);
  assert.equal(entry.links[0].targetId, "joris");
  assert.equal(entry.links[0].targetType, "agent");
});
