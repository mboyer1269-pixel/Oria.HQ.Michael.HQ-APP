#!/usr/bin/env node

// Memex Memory Evidence summary — pure helper for agent reasoning.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Memex Memory Evidence summary", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "memex-memory-evidence-summary.ts"));
  const {
    summarizeMemexMemoryEvidence,
    formatMemexMemoryEvidenceSummaryForContext,
    buildMemexMemoryEvidenceObservabilityPayload,
    buildMemexMemoryEvidencePreview,
    shouldAttachMemexEvidencePreview,
    withMemexEvidencePreview,
    isMemexEvidenceSummaryBlockCompact,
    MEMEX_EVIDENCE_OBSERVABILITY_LOG_EVENT,
  } = mod;

  const pack = {
    packVersion: 1,
    source: "memex",
    sourceTool: "agentmemory_librarian_brief",
    namespace: "michael.hq",
    zone: "human",
    agentZonePolicyReference: null,
    memoryIds: ["memex-librarian-brief"],
    provenance: [
      {
        memoryId: "memex-librarian-brief",
        sourceTool: "agentmemory_librarian_brief",
        namespace: "michael.hq",
        retrievedAtIso: "2026-07-03T20:00:00.000Z",
      },
    ],
    deprecatedExcluded: true,
    trustLevel: "active",
    freshness: {
      oldestIso: "2026-07-03T20:00:00.000Z",
      newestIso: "2026-07-03T20:00:00.000Z",
    },
    conflictPolicy: "exclude_conflicts",
    conflicts: [],
    contextBudget: 4000,
    injectedCharCount: 42,
    redactionsApplied: 0,
    routingHintAdvisoryOnly: true,
    oriaAuthority: true,
    createdAtIso: "2026-07-03T20:00:00.000Z",
  };

  await t.test("summarizes enriched pack without granting authority", () => {
    const summary = summarizeMemexMemoryEvidence({
      evidencePack: pack,
      trace: {
        status: "enriched",
        reason: "Memex librarian brief injected with Memory Evidence Pack",
        handshakeOk: true,
        evidencePackValid: true,
      },
      nowIso: "2026-07-04T20:00:00.000Z",
    });

    assert.equal(summary.status, "enriched");
    assert.equal(summary.sourceCount, 1);
    assert.equal(summary.confidence, "medium");
    assert.equal(summary.freshness.ageDays, 1);
    assert.deepEqual(summary.fallbackReasons, []);
    assert.ok(summary.limitations.some((line) => line.includes("advisory context only")));
  });

  await t.test("summarizes fallback reason when no pack was injected", () => {
    const summary = summarizeMemexMemoryEvidence({
      evidencePack: null,
      trace: {
        status: "fallback",
        reason: "empty or invalid Memex selection",
        handshakeOk: true,
        evidencePackValid: false,
      },
      nowIso: "2026-07-04T20:00:00.000Z",
    });

    assert.equal(summary.sourceCount, 0);
    assert.equal(summary.confidence, "none");
    assert.equal(summary.freshness.newestIso, null);
    assert.deepEqual(summary.fallbackReasons, ["empty or invalid Memex selection"]);
    assert.ok(summary.limitations.some((line) => line.includes("No Memex memory was injected")));
  });

  await t.test("formats a compact reasoning block", () => {
    const block = formatMemexMemoryEvidenceSummaryForContext(
      summarizeMemexMemoryEvidence({
        evidencePack: pack,
        trace: {
          status: "enriched",
          reason: "Memex librarian brief injected with Memory Evidence Pack",
        },
        nowIso: "2026-07-04T20:00:00.000Z",
      }),
    );

    assert.ok(block.includes("Memex Memory Evidence Summary"));
    assert.ok(block.includes("sourceCount: 1"));
    assert.ok(block.includes("confidence: medium"));
    assert.ok(block.includes("fallbackReasons: none"));
  });

  await t.test("observability payload stays compact and log-safe", () => {
    const sensitiveBrief = "sk-live-SECRET-token-never-log-this";
    const summary = summarizeMemexMemoryEvidence({
      evidencePack: {
        ...pack,
        memoryIds: [sensitiveBrief],
      },
      trace: {
        status: "enriched",
        reason: `injected with ${sensitiveBrief}`,
      },
      nowIso: "2026-07-04T20:00:00.000Z",
    });
    const block = formatMemexMemoryEvidenceSummaryForContext(summary);
    const payload = buildMemexMemoryEvidenceObservabilityPayload({
      summary,
      evidencePackValid: true,
    });

    assert.ok(isMemexEvidenceSummaryBlockCompact(block));
    assert.ok(!block.includes(sensitiveBrief));
    assert.ok(!block.includes("sk-live-SECRET"));
    assert.deepEqual(Object.keys(payload).sort(), [
      "ageDays",
      "confidence",
      "evidencePackValid",
      "fallbackReasonCount",
      "sourceCount",
      "status",
    ]);
    assert.equal(payload.fallbackReasonCount, 0);
    assert.equal(MEMEX_EVIDENCE_OBSERVABILITY_LOG_EVENT, "joris.memex.summary");
    assert.equal(JSON.stringify(payload).includes("limitations"), false);
    assert.equal(JSON.stringify(payload).includes(sensitiveBrief), false);
  });

  await t.test("fallback summary exposes fallbackReasons without fabricating sources", () => {
    const summary = summarizeMemexMemoryEvidence({
      evidencePack: null,
      trace: { status: "unavailable", reason: "MEMEX_CORE_ROOT unset" },
      nowIso: "2026-07-04T20:00:00.000Z",
    });
    const payload = buildMemexMemoryEvidenceObservabilityPayload({ summary });

    assert.equal(summary.sourceCount, 0);
    assert.equal(summary.confidence, "none");
    assert.ok(summary.fallbackReasons.length > 0);
    assert.equal(payload.fallbackReasonCount, 1);
    assert.equal(payload.sourceCount, 0);
  });

  await t.test("enriched preview includes sourceCount confidence freshness", () => {
    const summary = summarizeMemexMemoryEvidence({
      evidencePack: pack,
      trace: { status: "enriched", reason: "ok" },
      nowIso: "2026-07-04T20:00:00.000Z",
    });
    const preview = buildMemexMemoryEvidencePreview(summary);

    assert.ok(preview.includes("Memex Evidence Preview"));
    assert.ok(preview.includes("read-only"));
    assert.ok(preview.includes("no execution authorized"));
    assert.ok(preview.includes("sourceCount: 1"));
    assert.ok(preview.includes("confidence: medium"));
    assert.ok(preview.includes("freshnessAgeDays: 1 day(s) old"));
    assert.ok(preview.includes("fallbackReasons: none"));
  });

  await t.test("fallback preview explains reason without inventing sources", () => {
    const summary = summarizeMemexMemoryEvidence({
      evidencePack: null,
      trace: { status: "fallback", reason: "empty or invalid Memex selection" },
      nowIso: "2026-07-04T20:00:00.000Z",
    });
    const preview = buildMemexMemoryEvidencePreview(summary);

    assert.ok(preview.includes("sourceCount: 0"));
    assert.ok(preview.includes("confidence: none"));
    assert.ok(preview.includes("fallbackReasons: 1"));
    assert.ok(preview.includes("empty or invalid Memex selection"));
  });

  await t.test("preview never includes raw memory content or secrets", () => {
    const secret = "sk-live-RAW-MEMORY-CONTENT-NEVER-PREVIEW";
    const summary = summarizeMemexMemoryEvidence({
      evidencePack: {
        ...pack,
        memoryIds: [secret],
        provenance: [
          {
            memoryId: secret,
            sourceTool: "agentmemory_librarian_brief",
            namespace: "michael.hq",
            retrievedAtIso: "2026-07-03T20:00:00.000Z",
          },
        ],
      },
      trace: { status: "enriched", reason: secret },
      nowIso: "2026-07-04T20:00:00.000Z",
    });
    const preview = buildMemexMemoryEvidencePreview(summary);

    assert.ok(!preview.includes(secret));
    assert.ok(!preview.includes("sk-live-RAW-MEMORY"));
    assert.ok(!preview.includes("agentmemory_librarian_brief"));
  });

  await t.test("withMemexEvidencePreview attaches only for board.consult and brief.generate", () => {
    const summary = summarizeMemexMemoryEvidence({
      evidencePack: pack,
      trace: { status: "enriched", reason: "ok" },
      nowIso: "2026-07-04T20:00:00.000Z",
    });
    const base = "Base response text";

    assert.equal(shouldAttachMemexEvidencePreview("board.consult", "vault context"), true);
    assert.equal(shouldAttachMemexEvidencePreview("brief.generate", "vault context"), true);
    assert.equal(shouldAttachMemexEvidencePreview("calendar.book", "vault context"), false);
    assert.equal(shouldAttachMemexEvidencePreview("board.consult", null), false);

    const withPreview = withMemexEvidencePreview(base, {
      intent: "board.consult",
      memoryContext: "vault context",
      evidenceSummary: summary,
    });
    assert.notEqual(withPreview, base);
    assert.ok(withPreview.includes("Memex Evidence Preview"));

    const unchanged = withMemexEvidencePreview(base, {
      intent: "mission.plan",
      memoryContext: "vault context",
      evidenceSummary: summary,
    });
    assert.equal(unchanged, base);
  });
});
