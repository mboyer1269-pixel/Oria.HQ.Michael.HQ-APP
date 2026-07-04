#!/usr/bin/env node

// Joris Memex read-only context source — optional enrichment after handshake.
// Design: docs/MEMEX_READONLY_CONTEXT_SOURCE_V1.md

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Joris Memex context source v1", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "memex-context-source.ts"));
  const bridgeMod = await jiti.import(
    path.join(projectRoot, "src/server/mcp/memex-bridge-contract.ts"),
  );

  const { enrichJorisMemoryContextWithMemex } = mod;
  const { MEMEX_V1_READ_ALLOWLIST } = bridgeMod;

  const NOW = "2026-07-03T21:00:00.000Z";
  const existingContext = "Verified vault note\n\nLessons rail block";

  const okTransport = {
    listTools: async () => [...MEMEX_V1_READ_ALLOWLIST],
    callTool: async () => "Brief orientatif Memex pour la tâche en cours.",
    close: async () => {},
  };

  await t.test("1. Memex unavailable leaves Joris context unchanged", async () => {
    const result = await enrichJorisMemoryContextWithMemex({
      existingContext,
      taskIntent: "planifier la semaine",
      workspaceId: "michael-hq",
      env: {},
    });
    assert.equal(result.memoryContext, existingContext);
    assert.equal(result.evidencePack, null);
    assert.equal(result.trace.status, "unavailable");
  });

  await t.test("2. timeout falls back without crash", async () => {
    const result = await enrichJorisMemoryContextWithMemex({
      existingContext,
      taskIntent: "planifier",
      workspaceId: "michael-hq",
      transport: {
        listTools: () => new Promise(() => {}),
        callTool: async () => "never",
        close: async () => {},
      },
      env: { MEMEX_CORE_ROOT: "/fake", ORIA_ENABLE_MEMEX_READONLY: "1", NODE_ENV: "production" },
      nowIso: NOW,
    });
    assert.equal(result.memoryContext, existingContext);
    assert.equal(result.evidencePack, null);
    assert.ok(["handshake_failed", "fallback"].includes(result.trace.status));
  });

  await t.test("3. bad MCP output falls back without crash", async () => {
    const result = await enrichJorisMemoryContextWithMemex({
      existingContext,
      taskIntent: "planifier",
      workspaceId: "michael-hq",
      transport: {
        listTools: async () => [...MEMEX_V1_READ_ALLOWLIST],
        callTool: async () => "",
        close: async () => {},
      },
      env: { MEMEX_CORE_ROOT: "/fake" },
      nowIso: NOW,
    });
    assert.equal(result.memoryContext, existingContext);
    assert.equal(result.evidencePack, null);
    assert.equal(result.trace.status, "fallback");
  });

  await t.test("7+8. successful enrichment produces Memory Evidence Pack with provenance", async () => {
    const result = await enrichJorisMemoryContextWithMemex({
      existingContext,
      taskIntent: "planifier la semaine",
      workspaceId: "michael-hq",
      transport: okTransport,
      env: { MEMEX_CORE_ROOT: "/fake" },
      nowIso: NOW,
    });
    assert.equal(result.trace.status, "enriched");
    assert.ok(result.evidencePack);
    assert.ok(result.evidencePack.provenance.length > 0);
    assert.ok(result.evidenceSummary);
    assert.ok(result.evidenceSummary.sourceCount > 0);
    assert.equal(result.evidenceSummary.confidence, "medium");
    assert.notEqual(result.memoryContext, existingContext);
    assert.ok(result.memoryContext.includes("Contexte Memex"));
    assert.ok(result.memoryContext.includes(existingContext));
    assert.ok(result.memoryContext.includes("Memex Memory Evidence Summary"));
    assert.ok(result.memoryContext.includes("sourceCount:"));
    assert.ok(result.memoryContext.includes("fallbackReasons: none"));
  });

  await t.test("fallback keeps context unchanged and exposes explicit fallback summary", async () => {
    const result = await enrichJorisMemoryContextWithMemex({
      existingContext,
      taskIntent: "planifier",
      workspaceId: "michael-hq",
      transport: {
        listTools: async () => [...MEMEX_V1_READ_ALLOWLIST],
        callTool: async () => "",
        close: async () => {},
      },
      env: { MEMEX_CORE_ROOT: "/fake" },
      nowIso: NOW,
    });
    assert.equal(result.trace.status, "fallback");
    assert.equal(result.evidencePack, null);
    assert.equal(result.memoryContext, existingContext);
    assert.equal(result.evidenceSummary.sourceCount, 0);
    assert.equal(result.evidenceSummary.confidence, "none");
    assert.ok(result.evidenceSummary.fallbackReasons.length > 0);
  });

  await t.test("9. deprecated memories excluded via handshake-only injectable path", async () => {
    const result = await enrichJorisMemoryContextWithMemex({
      existingContext,
      taskIntent: "test",
      workspaceId: "michael-hq",
      transport: {
        listTools: async () => [...MEMEX_V1_READ_ALLOWLIST],
        callTool: async () => "   ",
        close: async () => {},
      },
      env: { MEMEX_CORE_ROOT: "/fake" },
      nowIso: NOW,
    });
    assert.equal(result.trace.status, "fallback");
    assert.equal(result.evidencePack, null);
  });

  await t.test("12. cloud never spawns transport factory", async () => {
    let spawned = false;
    const result = await enrichJorisMemoryContextWithMemex({
      existingContext,
      taskIntent: "test",
      workspaceId: "michael-hq",
      env: { VERCEL: "1", MEMEX_CORE_ROOT: "/should-not-spawn" },
      createTransport: async () => {
        spawned = true;
        return okTransport;
      },
    });
    assert.equal(spawned, false);
    assert.equal(result.trace.status, "unavailable");
  });

  await t.test("handshake failure keeps existing context", async () => {
    const result = await enrichJorisMemoryContextWithMemex({
      existingContext,
      taskIntent: "test",
      workspaceId: "michael-hq",
      transport: {
        listTools: async () => ["agentmemory_submit_proposal"],
        callTool: async () => "nope",
        close: async () => {},
      },
      env: { MEMEX_CORE_ROOT: "/fake" },
      nowIso: NOW,
    });
    assert.equal(result.memoryContext, existingContext);
    assert.equal(result.trace.status, "handshake_failed");
  });
});
