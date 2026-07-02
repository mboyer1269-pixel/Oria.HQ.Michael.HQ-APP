#!/usr/bin/env node
// Tests for src/server/ai/openrouter-json-client.ts

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

const {
  generateJsonWithOpenRouter,
  resolveDefaultOpenRouterJsonModelId,
} = await jiti.import(path.join(__dirname, "openrouter-json-client.ts"));

const KEY = "openrouter-test-key";

function makeOpenRouterOkFetch(json, onBody = () => {}) {
  return async (url, init) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(init.headers.authorization, `Bearer ${KEY}`);
    const body = JSON.parse(init.body);
    onBody(body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(json) } }],
        usage: { prompt_tokens: 3, completion_tokens: 4 },
      }),
    };
  };
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

await test("generateJsonWithOpenRouter", async (t) => {
  const savedKey = process.env.OPENROUTER_API_KEY;
  const savedModel = process.env.OPENROUTER_JSON_MODEL_ID;

  t.after(() => {
    if (savedKey !== undefined) process.env.OPENROUTER_API_KEY = savedKey;
    else delete process.env.OPENROUTER_API_KEY;
    if (savedModel !== undefined) process.env.OPENROUTER_JSON_MODEL_ID = savedModel;
    else delete process.env.OPENROUTER_JSON_MODEL_ID;
  });

  await t.test("returns ok:false when OPENROUTER_API_KEY is absent", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const result = await generateJsonWithOpenRouter({ systemPrompt: "sys", userPrompt: "user" });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "no_api_key");
  });

  await t.test("uses OPENROUTER_JSON_MODEL_ID when configured", () => {
    process.env.OPENROUTER_JSON_MODEL_ID = "qwen/qwen3-coder:free";
    assert.equal(resolveDefaultOpenRouterJsonModelId(), "qwen/qwen3-coder:free");
  });

  await t.test("calls OpenRouter chat completions and parses JSON", async () => {
    process.env.OPENROUTER_API_KEY = KEY;
    delete process.env.OPENROUTER_JSON_MODEL_ID;
    const payload = { reply: "Salut CEO" };

    const result = await generateJsonWithOpenRouter(
      { systemPrompt: "sys", userPrompt: "user", modelId: "openrouter/free" },
      makeOpenRouterOkFetch(payload, (body) => {
        assert.equal(body.model, "openrouter/free");
        assert.deepEqual(body.response_format, { type: "json_object" });
      }),
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.json, payload);
    assert.equal(result.modelId, "openrouter/free");
    assert.deepEqual(result.tokenUsage, { input: 3, output: 4 });
  });

  await t.test("returns invalid_json when content is not JSON", async () => {
    process.env.OPENROUTER_API_KEY = KEY;
    const result = await generateJsonWithOpenRouter(
      { systemPrompt: "sys", userPrompt: "user", modelId: "openrouter/free" },
      async () => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "not json" } }] }),
      }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "invalid_json");
  });

  await t.test("provider errors are returned without throwing", async () => {
    process.env.OPENROUTER_API_KEY = KEY;
    const result = await generateJsonWithOpenRouter(
      { systemPrompt: "sys", userPrompt: "user", modelId: "openrouter/free" },
      makeErrorFetch(503),
    );
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "provider_error");
  });

  await t.test("timeout is returned as a typed failure", async () => {
    process.env.OPENROUTER_API_KEY = KEY;
    const result = await generateJsonWithOpenRouter(
      { systemPrompt: "sys", userPrompt: "user", timeoutMs: 1, modelId: "openrouter/free" },
      makeAbortFetch(),
    );
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "timeout");
  });
});
