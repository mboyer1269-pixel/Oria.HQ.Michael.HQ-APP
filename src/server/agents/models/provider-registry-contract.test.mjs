#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");

test("Provider Registry Contract tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const { createStaticProviderRegistry } = await jiti.import(
    path.join(__dirname, "provider-registry-contract.ts"),
  );

  const providers = [
    {
      id: "openrouter",
      label: "OpenRouter",
      kind: "router",
      trustLevel: "allowlisted",
      apiKeyEnvVar: "OPENROUTER_API_KEY",
      supportsMcp: false,
      supportsToolUse: true,
    },
    {
      id: "ollama-local",
      label: "Ollama (local)",
      kind: "local-runtime",
      trustLevel: "reviewed",
      supportsMcp: false,
      supportsToolUse: false,
    },
  ];

  const models = [
    {
      id: "vendor/free-model:free",
      providerId: "openrouter",
      label: "Free Model",
      pricing: { promptUsdPerMTok: 0, completionUsdPerMTok: 0, perRequestUsd: 0 },
      costTier: "free",
      supportsToolUse: false,
      supportsStructuredJson: true,
      supportsMcp: false,
      provenance: { source: "static-file" },
    },
  ];

  const adapters = [
    {
      id: "openrouter-http",
      label: "OpenRouter HTTP",
      kind: "http-api",
      providerId: "openrouter",
      sentinelle: { defaultZone: "green", requiresApprovalForToolUse: false },
      ledgerRequired: true,
    },
    {
      id: "ollama-local-process",
      label: "Ollama local process",
      kind: "local-process",
      providerId: "ollama-local",
      sentinelle: { defaultZone: "yellow", requiresApprovalForToolUse: true },
      ledgerRequired: true,
    },
  ];

  await t.test("a valid static registry builds and resolves lookups", () => {
    const result = createStaticProviderRegistry({ providers, models, adapters });
    assert.equal(result.ok, true);

    const { registry } = result;
    assert.equal(registry.getProvider("openrouter")?.label, "OpenRouter");
    assert.equal(registry.getModel("vendor/free-model:free")?.costTier, "free");
    assert.equal(registry.getAdapter("ollama-local-process")?.kind, "local-process");
    assert.equal(registry.listProviders().length, 2);
    assert.equal(registry.listModels().length, 1);
    assert.deepEqual(
      registry.listAdaptersForProvider("openrouter").map((a) => a.id),
      ["openrouter-http"],
    );
  });

  await t.test("invariant: unknown ids resolve to undefined, never a fallback", () => {
    const result = createStaticProviderRegistry({ providers, models, adapters });
    assert.equal(result.ok, true);
    assert.equal(result.registry.getProvider("mystery-provider"), undefined);
    assert.equal(result.registry.getModel("mystery/model"), undefined);
    assert.deepEqual(result.registry.listAdaptersForProvider("mystery-provider"), []);
  });

  await t.test("a model referencing an unregistered provider is rejected", () => {
    const result = createStaticProviderRegistry({
      providers,
      models: [{ ...models[0], providerId: "ghost-provider" }],
      adapters,
    });
    assert.equal(result.ok, false);
    assert.match(result.errors.join(" "), /unknown provider "ghost-provider"/);
  });

  await t.test("an adapter referencing an unregistered provider is rejected", () => {
    const result = createStaticProviderRegistry({
      providers,
      models,
      adapters: [{ ...adapters[0], providerId: "ghost-provider" }],
    });
    assert.equal(result.ok, false);
    assert.match(result.errors.join(" "), /unknown provider "ghost-provider"/);
  });

  await t.test("duplicate ids are rejected", () => {
    const result = createStaticProviderRegistry({
      providers: [...providers, providers[0]],
      models,
      adapters,
    });
    assert.equal(result.ok, false);
    assert.match(result.errors.join(" "), /duplicate provider id "openrouter"/);
  });

  await t.test("descriptor validation errors propagate to the registry result", () => {
    const result = createStaticProviderRegistry({
      providers: [{ ...providers[0], apiKeyEnvVar: "sk-or-v1-secretvalue" }],
      models,
      adapters,
    });
    assert.equal(result.ok, false);
    assert.match(result.errors.join(" "), /environment variable NAME/);
  });
});
