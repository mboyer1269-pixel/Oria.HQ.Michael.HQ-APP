#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");

test("Model Provider Contract tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "model-provider-contract.ts"));
  const {
    OPENROUTER_MODELS_API_ENDPOINT,
    isValidEnvVarName,
    isProvenZeroPricing,
    isEligibleAsFree,
    validateModelProviderDescriptor,
    validateModelCapabilityDescriptor,
    validateRuntimeAdapterDescriptor,
    validateLocalRuntimePreference,
  } = mod;

  const validProvider = {
    id: "openrouter",
    label: "OpenRouter",
    kind: "router",
    trustLevel: "allowlisted",
    apiKeyEnvVar: "OPENROUTER_API_KEY",
    baseUrl: "https://openrouter.ai/api/v1",
    catalogSource: {
      kind: "openrouter-models-api",
      endpoint: OPENROUTER_MODELS_API_ENDPOINT,
      refreshPolicy: "cached-only",
    },
    supportsMcp: false,
    supportsToolUse: true,
  };

  const zeroPricing = { promptUsdPerMTok: 0, completionUsdPerMTok: 0, perRequestUsd: 0 };
  const unknownPricing = { promptUsdPerMTok: null, completionUsdPerMTok: null, perRequestUsd: null };

  await t.test("env var NAME validation accepts names and rejects secret-looking values", () => {
    assert.equal(isValidEnvVarName("OPENROUTER_API_KEY"), true);
    assert.equal(isValidEnvVarName("ANTHROPIC_API_KEY"), true);
    assert.equal(isValidEnvVarName("sk-proj-abc123def456"), false);
    assert.equal(isValidEnvVarName("sk_live_XXXXXXXX"), false);
    assert.equal(isValidEnvVarName("Bearer eyJhbGciOi"), false);
    assert.equal(isValidEnvVarName(""), false);
    assert.equal(isValidEnvVarName("A".repeat(65)), false);
  });

  await t.test("a well-formed provider descriptor validates", () => {
    assert.deepEqual(validateModelProviderDescriptor(validProvider), { ok: true });
  });

  await t.test("invariant: a secret value in apiKeyEnvVar is invalid", () => {
    const result = validateModelProviderDescriptor({
      ...validProvider,
      apiKeyEnvVar: "sk-or-v1-0123456789abcdef",
    });
    assert.equal(result.ok, false);
    assert.match(result.errors.join(" "), /environment variable NAME/);
  });

  await t.test("invariant: CLI subscription runtimes are adapters, not model providers", () => {
    const result = validateModelProviderDescriptor({
      ...validProvider,
      id: "claude-code",
      kind: "cli-subscription",
    });
    assert.equal(result.ok, false);
    assert.match(result.errors.join(" "), /runtime adapters, not model providers/);
  });

  await t.test("invariant: OpenRouter catalog source must be the official JSON API", () => {
    const scraping = validateModelProviderDescriptor({
      ...validProvider,
      catalogSource: {
        kind: "openrouter-models-api",
        endpoint: "https://openrouter.ai/models",
        refreshPolicy: "cached-only",
      },
    });
    assert.equal(scraping.ok, false);
    assert.match(scraping.errors.join(" "), /HTML scraping are forbidden/);

    const official = validateModelProviderDescriptor(validProvider);
    assert.equal(official.ok, true);
  });

  await t.test("invariant: OpenRouter catalog endpoint is exactly the models API", () => {
    const withCatalogEndpoint = (endpoint) =>
      validateModelProviderDescriptor({
        ...validProvider,
        catalogSource: {
          kind: "openrouter-models-api",
          ...(endpoint === undefined ? {} : { endpoint }),
          refreshPolicy: "cached-only",
        },
      });

    // A query string on the official endpoint stays valid.
    assert.deepEqual(withCatalogEndpoint(`${OPENROUTER_MODELS_API_ENDPOINT}?category=free`), {
      ok: true,
    });

    // Any other API path has the wrong response shape for a model catalog.
    const wrongPath = withCatalogEndpoint("https://openrouter.ai/api/v1/chat/completions");
    assert.equal(wrongPath.ok, false);
    assert.match(wrongPath.errors.join(" "), /official\s+models JSON API/);

    // A prefix look-alike is not the models endpoint.
    const lookAlike = withCatalogEndpoint(`${OPENROUTER_MODELS_API_ENDPOINT}-mirror`);
    assert.equal(lookAlike.ok, false);

    // The endpoint is required for this source kind.
    const missing = withCatalogEndpoint(undefined);
    assert.equal(missing.ok, false);
  });

  await t.test("invariant: unknown pricing is never free", () => {
    assert.equal(isProvenZeroPricing(zeroPricing), true);
    assert.equal(isProvenZeroPricing(unknownPricing), false);
    assert.equal(
      isProvenZeroPricing({ promptUsdPerMTok: 0, completionUsdPerMTok: 0, perRequestUsd: null }),
      false,
    );

    assert.equal(isEligibleAsFree(zeroPricing), true);
    assert.equal(isEligibleAsFree(unknownPricing), false);
    assert.equal(isEligibleAsFree(unknownPricing, { allowTrialOrUnknown: true }), true);
  });

  await t.test("invariant: the trial/unknown opt-in never whitewashes a known positive cost", () => {
    const paidPricing = { promptUsdPerMTok: 3, completionUsdPerMTok: 15, perRequestUsd: 0 };
    assert.equal(isEligibleAsFree(paidPricing), false);
    assert.equal(isEligibleAsFree(paidPricing, { allowTrialOrUnknown: true }), false);

    // One positive dimension is enough to disqualify, even among unknowns.
    const partiallyPaid = { promptUsdPerMTok: null, completionUsdPerMTok: 0.1, perRequestUsd: null };
    assert.equal(isEligibleAsFree(partiallyPaid, { allowTrialOrUnknown: true }), false);

    // Zero-or-unknown pricing is what the opt-in actually covers.
    const trialPricing = { promptUsdPerMTok: 0, completionUsdPerMTok: 0, perRequestUsd: null };
    assert.equal(isEligibleAsFree(trialPricing), false);
    assert.equal(isEligibleAsFree(trialPricing, { allowTrialOrUnknown: true }), true);
  });

  await t.test("invariant: costTier free requires catalog-proven zero pricing", () => {
    const base = {
      id: "vendor/some-model:free",
      providerId: "openrouter",
      label: "Some Model (free)",
      pricing: zeroPricing,
      costTier: "free",
      supportsToolUse: false,
      supportsStructuredJson: true,
      supportsMcp: false,
      provenance: { source: "static-file" },
    };
    assert.deepEqual(validateModelCapabilityDescriptor(base), { ok: true });

    const assumedFree = validateModelCapabilityDescriptor({ ...base, pricing: unknownPricing });
    assert.equal(assumedFree.ok, false);
    assert.match(assumedFree.errors.join(" "), /catalog-proven zero pricing/);
  });

  await t.test("invariant: a missing pricing descriptor is a validation error, not a throw", () => {
    const base = {
      id: "vendor/no-pricing-model",
      providerId: "openrouter",
      label: "No Pricing Model",
      costTier: "economy",
      supportsToolUse: false,
      supportsStructuredJson: false,
      supportsMcp: false,
      provenance: { source: "manual" },
    };

    for (const pricing of [undefined, null, "0"]) {
      const result = validateModelCapabilityDescriptor({ ...base, pricing });
      assert.equal(result.ok, false);
      assert.match(result.errors.join(" "), /pricing descriptor is required/);
    }
  });

  await t.test("invariant: runtime adapters cannot opt out of the Ledger", () => {
    const adapter = {
      id: "openrouter-http",
      label: "OpenRouter HTTP",
      kind: "http-api",
      providerId: "openrouter",
      sentinelle: { defaultZone: "green", requiresApprovalForToolUse: false },
      ledgerRequired: true,
    };
    assert.deepEqual(validateRuntimeAdapterDescriptor(adapter), { ok: true });

    const noLedger = validateRuntimeAdapterDescriptor({ ...adapter, ledgerRequired: false });
    assert.equal(noLedger.ok, false);
    assert.match(noLedger.errors.join(" "), /Ledger has no opt-out/);
  });

  await t.test("invariant: sentinelle tool-use approval must be an explicit boolean", () => {
    const adapter = {
      id: "openrouter-http",
      label: "OpenRouter HTTP",
      kind: "http-api",
      providerId: "openrouter",
      sentinelle: { defaultZone: "green", requiresApprovalForToolUse: false },
      ledgerRequired: true,
    };

    // Untyped snapshots must not smuggle in truthy strings or omissions.
    for (const requiresApprovalForToolUse of [undefined, null, "true", 1]) {
      const result = validateRuntimeAdapterDescriptor({
        ...adapter,
        sentinelle: { defaultZone: "green", requiresApprovalForToolUse },
      });
      assert.equal(result.ok, false);
      assert.match(result.errors.join(" "), /explicit boolean/);
    }

    const missingGate = validateRuntimeAdapterDescriptor({ ...adapter, sentinelle: undefined });
    assert.equal(missingGate.ok, false);
    assert.match(missingGate.errors.join(" "), /defaultZone must be/);
    assert.match(missingGate.errors.join(" "), /explicit boolean/);
  });

  await t.test("invariant: a local runtime is preferred, never assumed available", () => {
    assert.deepEqual(
      validateLocalRuntimePreference({
        preferLocal: true,
        assumeAvailable: false,
        runtimeAdapterId: "ollama-local",
      }),
      { ok: true },
    );

    const assumed = validateLocalRuntimePreference({ preferLocal: true, assumeAvailable: true });
    assert.equal(assumed.ok, false);
    assert.match(assumed.errors.join(" "), /never assumed/);
  });
});
