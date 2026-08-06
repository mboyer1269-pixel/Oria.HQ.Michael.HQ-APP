#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

// Exercises the conversational catch-all with an injected reply generator, so no
// network or real API key is ever touched.
test("Joris brain — conversational LLM wiring", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });
  const { runJorisCommand } = await jiti.import(path.join(__dirname, "brain.ts"));

  const message = "Salut Joris, quoi de neuf aujourd'hui?";

  await t.test("uses the real LLM reply for a general chat message when available", async () => {
    const deps = {
      generateReply: async () => ({ ok: true, text: "REPONSE_LLM_MOCK", modelId: "mock-model-x" }),
    };

    const result = await runJorisCommand(message, undefined, deps);

    assert.equal(result.intent, "chat");
    assert.equal(result.generation, "llm");
    assert.equal(result.summary, "REPONSE_LLM_MOCK");
    assert.equal(result.modelId, "mock-model-x");
    assert.equal(result.costMode, "economy");
  });

  await t.test("falls back to a deterministic summary when the LLM is unavailable (no silent AI mode)", async () => {
    const deps = {
      generateReply: async () => ({ ok: false, reason: "no provider configured" }),
    };

    const result = await runJorisCommand(message, undefined, deps);

    assert.equal(result.intent, "chat");
    assert.equal(result.generation, "fallback");
    assert.ok(result.summary.includes("Reçu, CEO"));
    assert.ok(result.summary.includes(message));
    assert.notEqual(result.summary, "REPONSE_LLM_MOCK");
  });

  await t.test("board.consult on the LLM path keeps the verified-lessons rail verbatim", async () => {
    const lessonEntry = {
      id: "lesson-1",
      type: "lesson",
      title: "Toujours confirmer",
      content: "Confirme avant d'agir.",
      tags: ["learning-loop"],
      trustLevel: "verified",
      sourceRef: "ledger:abc",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };
    const deps = {
      generateReply: async () => ({ ok: true, text: "LLM_BODY", modelId: "mock-model" }),
      readVerifiedVault: () => ({ entries: [lessonEntry] }),
    };

    const result = await runJorisCommand("Consulte le board sur cette question.", undefined, deps);

    assert.equal(result.intent, "board.consult");
    assert.equal(result.generation, "llm");
    assert.ok(result.summary.startsWith("LLM_BODY"), "LLM text is the main body");
    assert.ok(
      result.summary.includes("VERIFIED_MEMORY_LESSONS_FOR_JORIS"),
      "verified-lessons rail preserved verbatim",
    );
    // board.consult is premium-floor via cost ladder → routed mode is brute.
    assert.equal(result.costMode, "brute");
  });
});
