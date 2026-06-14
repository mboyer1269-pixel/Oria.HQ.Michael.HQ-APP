#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

// No real API keys, no network: the success path uses an injected mock fetch and
// a dummy key; the unavailable path relies on the clients short-circuiting on a
// missing key before any fetch.
const ENV_KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"];
const SAVED = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
function setKey(k, v) {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}

test.after(() => {
  for (const k of ENV_KEYS) setKey(k, SAVED[k]);
});

/** Mock fetch returning an Anthropic Messages-shaped response with `text`. */
function anthropicTextResponse(text) {
  return async () =>
    new Response(
      JSON.stringify({
        content: [{ type: "text", text }],
        usage: { input_tokens: 5, output_tokens: 5 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
}

test("Joris reply generator", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });
  const { generateJorisReply } = await jiti.import(path.join(__dirname, "joris-reply-generator.ts"));

  await t.test("returns ok:false when no provider is configured (no keys, no network)", async () => {
    setKey("ANTHROPIC_API_KEY", undefined);
    setKey("OPENAI_API_KEY", undefined);

    const result = await generateJorisReply({ message: "Salut Joris" });

    assert.equal(result.ok, false);
  });

  await t.test("returns the reply text when the provider succeeds (mocked fetch)", async () => {
    setKey("ANTHROPIC_API_KEY", "test-key-not-real");
    setKey("OPENAI_API_KEY", undefined);

    const result = await generateJorisReply({
      message: "Salut Joris",
      fetchFn: anthropicTextResponse(JSON.stringify({ reply: "Salut CEO, voici ma réponse." })),
    });

    assert.equal(result.ok, true);
    assert.equal(result.text, "Salut CEO, voici ma réponse.");
    assert.ok(typeof result.modelId === "string" && result.modelId.length > 0);
  });

  await t.test("returns ok:false when the reply JSON shape is invalid (mocked fetch)", async () => {
    setKey("ANTHROPIC_API_KEY", "test-key-not-real");
    setKey("OPENAI_API_KEY", undefined);

    const result = await generateJorisReply({
      message: "Salut Joris",
      fetchFn: anthropicTextResponse(JSON.stringify({ notReply: "oops" })),
    });

    assert.equal(result.ok, false);
  });
});
