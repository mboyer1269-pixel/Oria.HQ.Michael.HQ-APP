#!/usr/bin/env node
// Tests for src/server/ai/llm-json-provider.ts
//
// Tests provider preference, fallback chain, and failure recording.
// No real network calls — fetchFns are always mocks.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const providerPath = path.join(__dirname, "llm-json-provider.ts");
const { generateStructuredJson } = await jiti.import(providerPath);

// ---------------------------------------------------------------------------
// fetch mock helpers
// ---------------------------------------------------------------------------

const ANTHROPIC_KEY = "anthropic-test-key";
const OPENAI_KEY = "openai-test-key";

function makeAnthropicOkFetch(json) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: "text", text: JSON.stringify(json) }] }),
  });
}

function makeOpenAiOkFetch(json) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(json) } }] }),
  });
}

function makeErrorFetch(status = 500) {
  return async () => ({ ok: false, status, json: async () => ({}) });
}

function makeAbortFetch() {
  return async () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

await test("generateStructuredJson", async (t) => {
  const payload = [{ ventureId: "suivia" }];

  await t.test("auto: uses Anthropic when ANTHROPIC_API_KEY is set", async () => {
    process.env.ANTHROPIC_API_KEY = ANTHROPIC_KEY;
    delete process.env.OPENAI_API_KEY;
    const result = await generateStructuredJson({
      providerPreference: "auto",
      systemPrompt: "sys",
      userPrompt: "user",
      fetchFns: { anthropic: makeAnthropicOkFetch(payload) },
    });
    assert.equal(result.ok, true);
    assert.equal(result.providerUsed, "anthropic");
    assert.equal(result.fallbackUsed, false);
    assert.deepEqual(result.json, payload);
  });

  await t.test("auto: falls back to OpenAI when Anthropic has no key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = OPENAI_KEY;
    const result = await generateStructuredJson({
      providerPreference: "auto",
      systemPrompt: "sys",
      userPrompt: "user",
      fetchFns: { openai: makeOpenAiOkFetch(payload) },
    });
    assert.equal(result.ok, true);
    assert.equal(result.providerUsed, "openai");
    assert.equal(result.fallbackUsed, true);
    assert.ok(result.failureChain.length > 0, "failureChain records Anthropic failure");
  });

  await t.test("auto: falls back to OpenAI when Anthropic returns provider error", async () => {
    process.env.ANTHROPIC_API_KEY = ANTHROPIC_KEY;
    process.env.OPENAI_API_KEY = OPENAI_KEY;
    const result = await generateStructuredJson({
      providerPreference: "auto",
      systemPrompt: "sys",
      userPrompt: "user",
      fetchFns: {
        anthropic: makeErrorFetch(503),
        openai: makeOpenAiOkFetch(payload),
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.providerUsed, "openai");
    assert.equal(result.fallbackUsed, true);
    assert.ok(result.failureChain.some((r) => r.startsWith("anthropic:")));
  });

  await t.test("auto: both providers fail → ok:false with populated failureChain", async () => {
    process.env.ANTHROPIC_API_KEY = ANTHROPIC_KEY;
    process.env.OPENAI_API_KEY = OPENAI_KEY;
    const result = await generateStructuredJson({
      providerPreference: "auto",
      systemPrompt: "sys",
      userPrompt: "user",
      fetchFns: {
        anthropic: makeErrorFetch(500),
        openai: makeErrorFetch(500),
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "all_providers_failed");
    assert.ok(result.failureChain.length >= 2);
    assert.ok(result.failureChain.some((r) => r.startsWith("anthropic:")));
    assert.ok(result.failureChain.some((r) => r.startsWith("openai:")));
  });

  await t.test("explicit anthropic: only tries Anthropic even with OpenAI available", async () => {
    process.env.ANTHROPIC_API_KEY = ANTHROPIC_KEY;
    process.env.OPENAI_API_KEY = OPENAI_KEY;
    const result = await generateStructuredJson({
      providerPreference: "anthropic",
      systemPrompt: "sys",
      userPrompt: "user",
      fetchFns: {
        anthropic: makeAnthropicOkFetch(payload),
        openai: makeOpenAiOkFetch([{ wrong: "provider" }]),
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.providerUsed, "anthropic");
    assert.deepEqual(result.json, payload);
  });

  await t.test("explicit openai: only tries OpenAI", async () => {
    process.env.ANTHROPIC_API_KEY = ANTHROPIC_KEY;
    process.env.OPENAI_API_KEY = OPENAI_KEY;
    const result = await generateStructuredJson({
      providerPreference: "openai",
      systemPrompt: "sys",
      userPrompt: "user",
      fetchFns: {
        anthropic: makeAnthropicOkFetch([{ wrong: "provider" }]),
        openai: makeOpenAiOkFetch(payload),
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.providerUsed, "openai");
    assert.deepEqual(result.json, payload);
  });

  await t.test("explicit anthropic fails → ok:false (no OpenAI fallback)", async () => {
    process.env.ANTHROPIC_API_KEY = ANTHROPIC_KEY;
    process.env.OPENAI_API_KEY = OPENAI_KEY;
    const result = await generateStructuredJson({
      providerPreference: "anthropic",
      systemPrompt: "sys",
      userPrompt: "user",
      fetchFns: {
        anthropic: makeErrorFetch(503),
        openai: makeOpenAiOkFetch(payload),
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.failureChain.length, 1);
    assert.ok(result.failureChain[0].startsWith("anthropic:"));
  });

  await t.test("no keys at all → ok:false with failureChain", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const result = await generateStructuredJson({
      providerPreference: "auto",
      systemPrompt: "sys",
      userPrompt: "user",
    });
    assert.equal(result.ok, false);
    assert.ok(result.failureChain.length >= 2);
  });

  await t.test("Anthropic timeout triggers OpenAI fallback", async () => {
    process.env.ANTHROPIC_API_KEY = ANTHROPIC_KEY;
    process.env.OPENAI_API_KEY = OPENAI_KEY;
    const result = await generateStructuredJson({
      providerPreference: "auto",
      systemPrompt: "sys",
      userPrompt: "user",
      fetchFns: {
        anthropic: makeAbortFetch(),
        openai: makeOpenAiOkFetch(payload),
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.providerUsed, "openai");
    assert.equal(result.fallbackUsed, true);
  });

  await t.test("fallbackUsed is false when first provider succeeds", async () => {
    process.env.ANTHROPIC_API_KEY = ANTHROPIC_KEY;
    delete process.env.OPENAI_API_KEY;
    const result = await generateStructuredJson({
      providerPreference: "auto",
      systemPrompt: "sys",
      userPrompt: "user",
      fetchFns: { anthropic: makeAnthropicOkFetch(payload) },
    });
    assert.equal(result.ok, true);
    assert.equal(result.fallbackUsed, false);
    assert.equal(result.failureChain.length, 0);
  });
});
