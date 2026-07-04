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
  const { summarizeMemexMemoryEvidence, formatMemexMemoryEvidenceSummaryForContext } = mod;

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
});
