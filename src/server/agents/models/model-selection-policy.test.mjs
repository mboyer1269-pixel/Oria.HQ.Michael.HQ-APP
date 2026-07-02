#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");

test("Model Selection Policy tests", async (t) => {
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
  const { selectModel } = await jiti.import(path.join(__dirname, "model-selection-policy.ts"));

  const zeroPricing = { promptUsdPerMTok: 0, completionUsdPerMTok: 0, perRequestUsd: 0 };
  const unknownPricing = { promptUsdPerMTok: null, completionUsdPerMTok: null, perRequestUsd: null };
  const paidPricing = { promptUsdPerMTok: 3, completionUsdPerMTok: 15, perRequestUsd: 0 };

  const registryResult = createStaticProviderRegistry({
    providers: [
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
        id: "anthropic",
        label: "Anthropic",
        kind: "api",
        trustLevel: "allowlisted",
        apiKeyEnvVar: "ANTHROPIC_API_KEY",
        supportsMcp: true,
        supportsToolUse: true,
      },
      {
        id: "ollama-local",
        label: "Ollama (local)",
        kind: "local-runtime",
        trustLevel: "reviewed",
        supportsMcp: false,
        supportsToolUse: true,
      },
      {
        id: "sketchy-mcp",
        label: "Unvetted MCP provider",
        kind: "api",
        trustLevel: "untrusted",
        apiKeyEnvVar: "SKETCHY_API_KEY",
        supportsMcp: true,
        supportsToolUse: true,
      },
    ],
    models: [
      {
        id: "vendor/free-model:free",
        providerId: "openrouter",
        label: "Free Model",
        pricing: zeroPricing,
        costTier: "free",
        supportsToolUse: false,
        supportsStructuredJson: true,
        supportsMcp: false,
        provenance: { source: "static-file" },
      },
      {
        id: "vendor/mystery-price-model",
        providerId: "openrouter",
        label: "Mystery Price Model",
        pricing: unknownPricing,
        costTier: "economy",
        supportsToolUse: true,
        supportsStructuredJson: true,
        supportsMcp: false,
        provenance: { source: "manual" },
      },
      {
        id: "anthropic/premium-model",
        providerId: "anthropic",
        label: "Premium Model",
        pricing: paidPricing,
        costTier: "premium",
        supportsToolUse: true,
        supportsStructuredJson: true,
        supportsMcp: true,
        provenance: { source: "static-file" },
      },
      {
        id: "local/small-model",
        providerId: "ollama-local",
        label: "Local Small Model",
        pricing: zeroPricing,
        costTier: "free",
        supportsToolUse: true,
        supportsStructuredJson: false,
        supportsMcp: false,
        provenance: { source: "manual" },
      },
      {
        id: "sketchy/tool-model",
        providerId: "sketchy-mcp",
        label: "Unvetted Tool Model",
        pricing: zeroPricing,
        costTier: "free",
        supportsToolUse: true,
        supportsStructuredJson: true,
        supportsMcp: true,
        provenance: { source: "manual" },
      },
    ],
    adapters: [
      {
        id: "openrouter-http",
        label: "OpenRouter HTTP",
        kind: "http-api",
        providerId: "openrouter",
        sentinelle: { defaultZone: "green", requiresApprovalForToolUse: false },
        ledgerRequired: true,
      },
      {
        id: "anthropic-http",
        label: "Anthropic HTTP",
        kind: "http-api",
        providerId: "anthropic",
        sentinelle: { defaultZone: "green", requiresApprovalForToolUse: false },
        ledgerRequired: true,
      },
      {
        id: "ollama-local-process",
        label: "Ollama local process",
        kind: "local-process",
        providerId: "ollama-local",
        sentinelle: { defaultZone: "yellow", requiresApprovalForToolUse: false },
        ledgerRequired: true,
      },
      {
        id: "sketchy-mcp-client",
        label: "Unvetted MCP client",
        kind: "mcp-client",
        providerId: "sketchy-mcp",
        sentinelle: { defaultZone: "red", requiresApprovalForToolUse: true },
        ledgerRequired: true,
      },
    ],
  });
  assert.equal(registryResult.ok, true);
  const registry = registryResult.registry;

  const baseProfile = {
    agentId: "joris",
    displayName: "Joris",
    routes: {
      conversation: {
        candidateModelIds: ["vendor/free-model:free", "anthropic/premium-model"],
        bindingMode: "auto",
      },
    },
  };

  await t.test("the first eligible candidate wins, Sentinelle and Ledger always required", () => {
    const decision = selectModel(registry, { profile: baseProfile, route: "conversation" });
    assert.equal(decision.eligible, true);
    assert.equal(decision.modelId, "vendor/free-model:free");
    assert.equal(decision.providerId, "openrouter");
    assert.equal(decision.runtimeAdapterId, "openrouter-http");
    assert.equal(decision.sentinelleRequired, true);
    assert.equal(decision.ledgerRequired, true);
    assert.equal(decision.pinned, false);
  });

  await t.test("invariant: an unknown model is ineligible, never a fallback", () => {
    const decision = selectModel(registry, {
      profile: {
        ...baseProfile,
        routes: {
          conversation: {
            candidateModelIds: ["mystery/model", "anthropic/premium-model"],
            bindingMode: "auto",
          },
        },
      },
      route: "conversation",
    });
    assert.equal(decision.eligible, true);
    assert.equal(decision.modelId, "anthropic/premium-model");
    assert.deepEqual(
      decision.skipped.map((s) => s.reasonCode),
      ["unknown_model"],
    );
  });

  await t.test("invariant: unknown model AND unknown provider yield no eligible candidate", () => {
    const decision = selectModel(registry, {
      profile: {
        ...baseProfile,
        routes: {
          conversation: {
            candidateModelIds: ["mystery/model-a", "mystery/model-b"],
            bindingMode: "auto",
          },
        },
      },
      route: "conversation",
    });
    assert.equal(decision.eligible, false);
    assert.equal(decision.reasonCode, "no_eligible_candidate");
    assert.equal(decision.skipped.length, 2);
  });

  await t.test("invariant: free-tier requests reject unproven pricing unless opted in", () => {
    const profile = {
      ...baseProfile,
      routes: {
        drafts: {
          candidateModelIds: ["vendor/mystery-price-model", "vendor/free-model:free"],
          bindingMode: "auto",
          requireFreeTier: true,
        },
      },
    };

    const strict = selectModel(registry, { profile, route: "drafts" });
    assert.equal(strict.eligible, true);
    assert.equal(strict.modelId, "vendor/free-model:free");
    assert.equal(strict.skipped[0].reasonCode, "not_proven_free");

    const optedIn = selectModel(registry, {
      profile,
      route: "drafts",
      allowTrialOrUnknownAsFree: true,
    });
    assert.equal(optedIn.eligible, true);
    assert.equal(optedIn.modelId, "vendor/mystery-price-model");
  });

  await t.test("invariant: untrusted providers cannot run tools at all", () => {
    const decision = selectModel(registry, {
      profile: {
        ...baseProfile,
        routes: {
          "tool-work": {
            candidateModelIds: ["sketchy/tool-model", "anthropic/premium-model"],
            bindingMode: "auto",
          },
        },
      },
      route: "tool-work",
      requireToolUse: true,
    });
    assert.equal(decision.eligible, true);
    assert.equal(decision.modelId, "anthropic/premium-model");
    assert.equal(decision.skipped[0].reasonCode, "provider_untrusted_for_tool_use");
  });

  await t.test("invariant: reviewed (not allowlisted) tool use forces the approval gate", () => {
    const decision = selectModel(registry, {
      profile: {
        ...baseProfile,
        routes: {
          "tool-work": {
            candidateModelIds: ["local/small-model", "anthropic/premium-model"],
            bindingMode: "auto",
          },
        },
      },
      route: "tool-work",
      requireToolUse: true,
    });
    assert.equal(decision.eligible, true);
    assert.equal(decision.providerId, "ollama-local");
    assert.equal(decision.sentinelle.requiresApprovalForToolUse, true);
  });

  await t.test("invariant: a preferred local runtime is used when present, skipped when absent", () => {
    const profile = {
      ...baseProfile,
      routes: {
        conversation: {
          candidateModelIds: ["local/small-model", "vendor/free-model:free"],
          bindingMode: "auto",
        },
      },
      localRuntime: {
        preferLocal: true,
        assumeAvailable: false,
        runtimeAdapterId: "ollama-local-process",
      },
    };
    const preferred = selectModel(registry, { profile, route: "conversation" });
    assert.equal(preferred.eligible, true);
    assert.equal(preferred.runtimeAdapterId, "ollama-local-process");

    const withGhostAdapter = selectModel(registry, {
      profile: {
        ...profile,
        localRuntime: {
          preferLocal: true,
          assumeAvailable: false,
          runtimeAdapterId: "ghost-adapter",
        },
      },
      route: "conversation",
    });
    assert.equal(withGhostAdapter.eligible, true);
    assert.equal(withGhostAdapter.runtimeAdapterId, "ollama-local-process");
  });

  await t.test("unavailable models are skipped in order", () => {
    const decision = selectModel(registry, {
      profile: baseProfile,
      route: "conversation",
      unavailableModelIds: ["vendor/free-model:free"],
    });
    assert.equal(decision.eligible, true);
    assert.equal(decision.modelId, "anthropic/premium-model");
    assert.equal(decision.skipped[0].reasonCode, "model_unavailable");
  });

  await t.test("an invalid profile (hidden vendor pin) is rejected before selection", () => {
    const decision = selectModel(registry, {
      profile: {
        ...baseProfile,
        routes: {
          conversation: {
            candidateModelIds: ["anthropic/premium-model"],
            bindingMode: "auto",
          },
        },
      },
      route: "conversation",
    });
    assert.equal(decision.eligible, false);
    assert.equal(decision.reasonCode, "invalid_profile");
  });

  await t.test("a pinned route stays eligible and flags the decision as pinned", () => {
    const decision = selectModel(registry, {
      profile: {
        ...baseProfile,
        routes: {
          "client-audit": {
            candidateModelIds: ["anthropic/premium-model"],
            bindingMode: "pinned",
            pinnedReason: "CEO mandate: client audits stay on the premium brain",
          },
        },
      },
      route: "client-audit",
    });
    assert.equal(decision.eligible, true);
    assert.equal(decision.pinned, true);
    assert.match(decision.reason, /CEO mandate/);
  });

  await t.test("an unknown route is ineligible", () => {
    const decision = selectModel(registry, { profile: baseProfile, route: "ghost-route" });
    assert.equal(decision.eligible, false);
    assert.equal(decision.reasonCode, "unknown_route");
  });
});
