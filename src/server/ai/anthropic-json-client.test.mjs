#!/usr/bin/env node
// Tests for src/server/ai/anthropic-json-client.ts
//
// No real network calls. fetch is mocked via the optional fetchFn parameter.
// server-only is stubbed so jiti can load the module outside Next.js.
// ANTHROPIC_API_KEY is read at call time, so tests set/unset process.env directly.

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

const clientPath = path.join(__dirname, "anthropic-json-client.ts");
const { generateJsonWithAnthropic } = await jiti.import(clientPath);

// ---------------------------------------------------------------------------
// fetch mock helpers
// ---------------------------------------------------------------------------

function makeOkFetch(json) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: "text", text: JSON.stringify(json) }] }),
  });
}

function makeTextFetch(text) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: "text", text }] }),
  });
}

function makeErrorFetch(status) {
  return async () => ({
    ok: false,
    status,
    json: async () => ({}),
  });
}

function makeAbortFetch() {
  return async () => {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    throw err;
  };
}

function makeThrowFetch() {
  return async () => {
    throw new Error("Network unreachable");
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

await test("generateJsonWithAnthropic", async (t) => {
  const KEY = "test-key-abc123";

  await t.test("no API key → ok:false errorCode=no_api_key, no throw", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const result = await generateJsonWithAnthropic(
      { systemPrompt: "sys", userPrompt: "user" },
      makeOkFetch([]),
    );
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "no_api_key");
    assert.ok(typeof result.fallbackReason === "string" && result.fallbackReason.length > 0);
  });

  await t.test("valid JSON array → ok:true with parsed json and modelId", async () => {
    process.env.ANTHROPIC_API_KEY = KEY;
    const payload = [{ ventureId: "suivia", targetBuyer: "Clinique test" }];
    const result = await generateJsonWithAnthropic(
      { systemPrompt: "sys", userPrompt: "user" },
      makeOkFetch(payload),
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.json, payload);
    assert.ok(typeof result.rawText === "string");
    assert.ok(typeof result.modelId === "string" && result.modelId.length > 0);
  });

  await t.test("JSON wrapped in markdown fences → ok:true, parsed correctly", async () => {
    process.env.ANTHROPIC_API_KEY = KEY;
    const inner = [{ hello: "world" }];
    const fenced = "```json\n" + JSON.stringify(inner) + "\n```";
    const result = await generateJsonWithAnthropic(
      { systemPrompt: "sys", userPrompt: "user" },
      makeTextFetch(fenced),
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.json, inner);
  });

  await t.test("provider HTTP 429 → ok:false errorCode=provider_error", async () => {
    process.env.ANTHROPIC_API_KEY = KEY;
    const result = await generateJsonWithAnthropic(
      { systemPrompt: "sys", userPrompt: "user" },
      makeErrorFetch(429),
    );
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "provider_error");
    assert.ok(result.fallbackReason.includes("429"));
  });

  await t.test("non-JSON plain text → ok:false errorCode=invalid_json", async () => {
    process.env.ANTHROPIC_API_KEY = KEY;
    const result = await generateJsonWithAnthropic(
      { systemPrompt: "sys", userPrompt: "user" },
      makeTextFetch("Sorry I cannot help with that."),
    );
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "invalid_json");
  });

  await t.test("empty text in response → ok:false errorCode=invalid_json", async () => {
    process.env.ANTHROPIC_API_KEY = KEY;
    const result = await generateJsonWithAnthropic(
      { systemPrompt: "sys", userPrompt: "user" },
      makeTextFetch(""),
    );
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "invalid_json");
  });

  await t.test("AbortError → ok:false errorCode=timeout", async () => {
    process.env.ANTHROPIC_API_KEY = KEY;
    const result = await generateJsonWithAnthropic(
      { systemPrompt: "sys", userPrompt: "user", timeoutMs: 5000 },
      makeAbortFetch(),
    );
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "timeout");
    assert.ok(result.fallbackReason.includes("timed out"));
  });

  await t.test("unexpected network error → ok:false errorCode=unexpected_error", async () => {
    process.env.ANTHROPIC_API_KEY = KEY;
    const result = await generateJsonWithAnthropic(
      { systemPrompt: "sys", userPrompt: "user" },
      makeThrowFetch(),
    );
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "unexpected_error");
  });

  await t.test("custom modelId is reflected in success result", async () => {
    process.env.ANTHROPIC_API_KEY = KEY;
    const result = await generateJsonWithAnthropic(
      { systemPrompt: "sys", userPrompt: "user", modelId: "claude-sonnet-4-6" },
      makeOkFetch({ ok: true }),
    );
    assert.equal(result.ok, true);
    assert.equal(result.modelId, "claude-sonnet-4-6");
  });
});
