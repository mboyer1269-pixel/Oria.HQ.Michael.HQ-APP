#!/usr/bin/env node
// Tests for src/server/ai/openai-json-client.ts
//
// No real network calls — fetchFn is always a mock.
// OPENAI_API_KEY is read at call time, so tests set process.env directly.

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

const clientPath = path.join(__dirname, "openai-json-client.ts");
const { generateJsonWithOpenAI } = await jiti.import(clientPath);

// ---------------------------------------------------------------------------
// fetch mock helpers
// ---------------------------------------------------------------------------

function makeOkFetch(json) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(json) } }],
    }),
  });
}

function makeTextFetch(text) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: text } }],
    }),
  });
}

function makeErrorFetch(status) {
  return async () => ({ ok: false, status, json: async () => ({}) });
}

function makeAbortFetch() {
  return async () => {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    throw err;
  };
}

function makeThrowFetch() {
  return async () => { throw new Error("Network unreachable"); };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const KEY = "openai-test-key-xyz";

await test("generateJsonWithOpenAI", async (t) => {
  await t.test("no API key → ok:false errorCode=no_api_key, no throw", async () => {
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const result = await generateJsonWithOpenAI(
      { systemPrompt: "sys", userPrompt: "user" },
      makeOkFetch([]),
    );
    if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "no_api_key");
    assert.ok(typeof result.fallbackReason === "string");
  });

  await t.test("valid JSON array → ok:true with parsed json and modelId", async () => {
    process.env.OPENAI_API_KEY = KEY;
    const payload = [{ ventureId: "suivia" }];
    const result = await generateJsonWithOpenAI(
      { systemPrompt: "sys", userPrompt: "user" },
      makeOkFetch(payload),
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.json, payload);
    assert.ok(typeof result.rawText === "string");
    assert.ok(typeof result.modelId === "string" && result.modelId.length > 0);
  });

  await t.test("JSON wrapped in markdown fences → ok:true, parsed correctly", async () => {
    process.env.OPENAI_API_KEY = KEY;
    const inner = [{ hello: "world" }];
    const fenced = "```json\n" + JSON.stringify(inner) + "\n```";
    const result = await generateJsonWithOpenAI(
      { systemPrompt: "sys", userPrompt: "user" },
      makeTextFetch(fenced),
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.json, inner);
  });

  await t.test("provider HTTP 401 → ok:false errorCode=provider_error", async () => {
    process.env.OPENAI_API_KEY = KEY;
    const result = await generateJsonWithOpenAI(
      { systemPrompt: "sys", userPrompt: "user" },
      makeErrorFetch(401),
    );
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "provider_error");
    assert.ok(result.fallbackReason.includes("401"));
  });

  await t.test("provider HTTP 429 → ok:false errorCode=provider_error", async () => {
    process.env.OPENAI_API_KEY = KEY;
    const result = await generateJsonWithOpenAI(
      { systemPrompt: "sys", userPrompt: "user" },
      makeErrorFetch(429),
    );
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "provider_error");
  });

  await t.test("non-JSON text → ok:false errorCode=invalid_json", async () => {
    process.env.OPENAI_API_KEY = KEY;
    const result = await generateJsonWithOpenAI(
      { systemPrompt: "sys", userPrompt: "user" },
      makeTextFetch("Sorry, I cannot help."),
    );
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "invalid_json");
  });

  await t.test("empty content → ok:false errorCode=invalid_json", async () => {
    process.env.OPENAI_API_KEY = KEY;
    const result = await generateJsonWithOpenAI(
      { systemPrompt: "sys", userPrompt: "user" },
      makeTextFetch(""),
    );
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "invalid_json");
  });

  await t.test("AbortError → ok:false errorCode=timeout", async () => {
    process.env.OPENAI_API_KEY = KEY;
    const result = await generateJsonWithOpenAI(
      { systemPrompt: "sys", userPrompt: "user", timeoutMs: 5000 },
      makeAbortFetch(),
    );
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "timeout");
    assert.ok(result.fallbackReason.includes("timed out"));
  });

  await t.test("unexpected network error → ok:false errorCode=unexpected_error", async () => {
    process.env.OPENAI_API_KEY = KEY;
    const result = await generateJsonWithOpenAI(
      { systemPrompt: "sys", userPrompt: "user" },
      makeThrowFetch(),
    );
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "unexpected_error");
  });

  await t.test("custom modelId is reflected in success result", async () => {
    process.env.OPENAI_API_KEY = KEY;
    const result = await generateJsonWithOpenAI(
      { systemPrompt: "sys", userPrompt: "user", modelId: "gpt-4o" },
      makeOkFetch({ ok: true }),
    );
    assert.equal(result.ok, true);
    assert.equal(result.modelId, "gpt-4o");
  });
});
