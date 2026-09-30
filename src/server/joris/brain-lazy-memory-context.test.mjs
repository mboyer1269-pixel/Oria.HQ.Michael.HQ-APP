#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
process.env.NODE_ENV = "development";

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});
const { runJorisCommand } = await jiti.import(path.join(__dirname, "brain.ts"));

function dependencies() {
  const trace = { status: "enriched", reason: "test mock", evidencePackValid: true };
  const evidenceSummary = {
    status: "enriched",
    sourceCount: 1,
    confidence: "medium",
    freshness: { oldestIso: null, newestIso: null, ageDays: null },
    limitations: [],
    fallbackReasons: [],
  };
  const calls = { readVault: 0, enrich: [], generate: [] };
  const deps = {
    readVerifiedVault: (workspaceId) => {
      calls.readVault += 1;
      calls.readWorkspaceId = workspaceId;
      return { entries: [] };
    },
    enrichMemexContext: async (input) => {
      calls.enrich.push(input);
      return {
        memoryContext: "MEMEX_TEST_CONTEXT",
        evidencePack: null,
        evidenceSummary,
        trace,
      };
    },
    generateReply: async (input) => {
      calls.generate.push(input);
      return { ok: true, text: "LLM_TEST_REPLY", modelId: "mock-model" };
    },
  };
  return { calls, deps };
}

test("Joris loads vault and Memex context only on paths that consume it", async (t) => {
  await t.test("structured mission planning skips vault, Memex, and reply generation", async () => {
    const { calls, deps } = dependencies();
    const result = await runJorisCommand("Planifie la mission lancement", undefined, deps);

    assert.equal(result.intent, "mission.plan");
    assert.equal(calls.readVault, 0);
    assert.equal(calls.enrich.length, 0);
    assert.equal(calls.generate.length, 0);
  });

  await t.test("pending booking proposal and confirmation both skip memory reads", async () => {
    const { calls, deps } = dependencies();
    const proposal = await runJorisCommand("Book RDV demain 14h00 lazy-memory-test", undefined, deps);
    assert.equal(proposal.intent, "mission.draft");
    assert.ok(proposal.pendingDraftId);

    const confirmation = await runJorisCommand("confirme", undefined, deps);
    assert.equal(confirmation.intent, "calendar.book");
    assert.ok(confirmation.calendarEvent);
    assert.equal(calls.readVault, 0);
    assert.equal(calls.enrich.length, 0);
    assert.equal(calls.generate.length, 0);
  });

  await t.test("chat still loads one workspace-scoped context and passes it to the reply generator", async () => {
    const { calls, deps } = dependencies();
    const result = await runJorisCommand("Salut Joris, quoi de neuf aujourd'hui?", undefined, deps);

    assert.equal(result.intent, "chat");
    assert.equal(calls.readVault, 1);
    assert.equal(calls.enrich.length, 1);
    assert.equal(calls.enrich[0].workspaceId, calls.readWorkspaceId);
    assert.equal(calls.generate.length, 1);
    assert.equal(calls.generate[0].memoryContext, "MEMEX_TEST_CONTEXT");
  });

  await t.test("board consult still appends the verified memory rail and Memex preview", async () => {
    const { calls, deps } = dependencies();
    const result = await runJorisCommand("Consulte le board sur cette question.", undefined, deps);

    assert.equal(result.intent, "board.consult");
    assert.equal(calls.enrich.length, 1);
    assert.equal(calls.generate[0].memoryContext, "MEMEX_TEST_CONTEXT");
    assert.ok(result.summary.includes("MEMEX_TEST_CONTEXT"));
    assert.ok(result.summary.includes("Memex Evidence Preview"));
  });

  await t.test("CEO brief still includes workspace memory and Memex preview", async () => {
    const { calls, deps } = dependencies();
    const result = await runJorisCommand("Donne-moi un résumé de la semaine", undefined, deps);

    assert.equal(result.intent, "brief.generate");
    assert.equal(calls.readVault, 1);
    assert.equal(calls.enrich.length, 1);
    assert.equal(calls.enrich[0].workspaceId, calls.readWorkspaceId);
    assert.ok(result.summary.includes("MEMEX_TEST_CONTEXT"));
    assert.ok(result.summary.includes("Memex Evidence Preview"));
  });
});
