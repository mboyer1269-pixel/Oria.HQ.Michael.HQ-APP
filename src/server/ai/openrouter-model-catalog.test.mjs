#!/usr/bin/env node
// Tests for src/server/ai/openrouter-model-catalog.ts

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

const { buildOpenRouterFreeModelSnapshot } = await jiti.import(
  path.join(__dirname, "openrouter-model-catalog.ts"),
);

test("buildOpenRouterFreeModelSnapshot keeps only free text models and preserves flags", () => {
  const snapshot = buildOpenRouterFreeModelSnapshot(
    {
      data: [
        {
          id: "qwen/qwen3-coder:free",
          name: "Qwen Coder Free",
          context_length: 1048576,
          pricing: { prompt: "0", completion: "0", request: "0" },
          architecture: { output_modalities: ["text"] },
        },
        {
          id: "openai/gpt-4o",
          name: "Paid",
          context_length: 128000,
          pricing: { prompt: "0.0000025", completion: "0.00001", request: "0" },
          architecture: { output_modalities: ["text"] },
        },
        {
          id: "image/free",
          name: "Image Free",
          context_length: 1000,
          pricing: { prompt: "0", completion: "0", request: "0" },
          architecture: { output_modalities: ["image"] },
        },
        {
          id: "meta-llama/llama-3.3-70b-instruct:free",
          name: "Llama Free",
          context_length: 131072,
          pricing: { prompt: 0, completion: 0, request: 0 },
          architecture: { output_modalities: ["text"] },
        },
      ],
    },
    {
      nowIso: "2026-07-02T00:00:00.000Z",
      existingCatalog: {
        models: [
          {
            id: "qwen/qwen3-coder:free",
            enabled: true,
            recommended: true,
          },
        ],
      },
    },
  );

  assert.equal(snapshot.generated_at, "2026-07-02T00:00:00.000Z");
  assert.equal(snapshot.provider, "openrouter");
  assert.equal(snapshot.router_fallback, "openrouter/free");
  assert.deepEqual(
    snapshot.models.map((model) => model.id),
    ["qwen/qwen3-coder:free", "meta-llama/llama-3.3-70b-instruct:free"],
  );
  assert.equal(snapshot.models[0].enabled, true);
  assert.equal(snapshot.models[0].recommended, true);
  assert.equal(snapshot.models[1].enabled, false);
  assert.equal(snapshot.models[1].provider, "meta-llama");
});
