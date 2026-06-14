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
});
