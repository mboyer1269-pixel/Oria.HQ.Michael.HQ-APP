#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");

test("Provider Connection Discovery tests", async (t) => {
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
  const {
    resolveProviderConnectionDiscovery,
    isProviderConnectionSnapshotStale,
    isExecutionReady,
    deriveUnavailableModelIds,
  } = await jiti.import(path.join(__dirname, "provider-connection-discovery.ts"));

  const zeroPricing = { promptUsdPerMTok: 0, completionUsdPerMTok: 0, perRequestUsd: 0 };

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
        id: "openai-codex",
        label: "OpenAI Codex (ChatGPT OAuth)",
        kind: "api",
        trustLevel: "reviewed",
        supportsMcp: false,
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
        id: "codex/gpt-codex",
        providerId: "openai-codex",
        label: "Codex model",
        pricing: zeroPricing,
        costTier: "free",
        supportsToolUse: true,
        supportsStructuredJson: true,
        supportsMcp: false,
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
        id: "openai-codex-cli",
        label: "Codex CLI subscription",
        kind: "cli-subscription",
        providerId: "openai-codex",
        sentinelle: { defaultZone: "yellow", requiresApprovalForToolUse: true },
        ledgerRequired: true,
      },
    ],
  });
  assert.equal(registryResult.ok, true, JSON.stringify(registryResult.ok ? [] : registryResult.errors));
  const registry = registryResult.registry;

  await t.test("cross-workspace discovery is refused, never answered from another workspace", async () => {
    const probe = async () => ({ connectionState: "connected", source: "exercised-capability" });
    const result = await resolveProviderConnectionDiscovery(registry, {
      workspaceId: "workspace-a",
      requestingWorkspaceId: "workspace-b",
      probe,
    });
    assert.deepEqual(result, { status: "cross_workspace_denied" });
  });

  await t.test("invalid request (missing probe, empty workspace id) is rejected, not guessed", async () => {
    const missingProbe = await resolveProviderConnectionDiscovery(registry, {
      workspaceId: "workspace-a",
      requestingWorkspaceId: "workspace-a",
      probe: undefined,
    });
    assert.equal(missingProbe.status, "invalid_request");

    const emptyWorkspace = await resolveProviderConnectionDiscovery(registry, {
      workspaceId: "",
      requestingWorkspaceId: "",
      probe: async () => ({ connectionState: "connected", source: "exercised-capability" }),
    });
    assert.equal(emptyWorkspace.status, "invalid_request");
  });

  await t.test("no connection: probe reports connection_required with a required action", async () => {
    const probe = async (provider) =>
      provider.id === "openai-codex"
        ? {
            connectionState: "connection_required",
            source: "oauth-external-marker",
            requiredAction: "connect ChatGPT OAuth on the host before this provider can be used",
          }
        : { connectionState: "connected", source: "env-key-presence" };

    const result = await resolveProviderConnectionDiscovery(registry, {
      workspaceId: "workspace-a",
      requestingWorkspaceId: "workspace-a",
      probe,
      nowIso: "2026-10-02T12:00:00.000Z",
    });
    assert.equal(result.status, "ok");
    const codexEntry = result.snapshot.entries.find((e) => e.providerId === "openai-codex");
    assert.equal(codexEntry.connectionState, "connection_required");
    assert.equal(codexEntry.requiredAction, "connect ChatGPT OAuth on the host before this provider can be used");
  });

  await t.test("lost/thrown response becomes unknown, never connected and never a fabricated reason", async () => {
    const probe = async (provider) => {
      if (provider.id === "openrouter") throw new Error("network reset");
      return { connectionState: "connected", source: "env-key-presence" };
    };
    const result = await resolveProviderConnectionDiscovery(registry, {
      workspaceId: "workspace-a",
      requestingWorkspaceId: "workspace-a",
      probe,
    });
    assert.equal(result.status, "ok");
    const openRouterEntry = result.snapshot.entries.find((e) => e.providerId === "openrouter");
    assert.equal(openRouterEntry.connectionState, "unknown");
    assert.ok(openRouterEntry.requiredAction.includes("retry"));
  });

  await t.test("a malformed probe outcome (bad enum values) degrades to unknown, not a throw", async () => {
    const probe = async () => ({ connectionState: "it-works-trust-me", source: "vibes" });
    const result = await resolveProviderConnectionDiscovery(registry, {
      workspaceId: "workspace-a",
      requestingWorkspaceId: "workspace-a",
      probe,
    });
    assert.equal(result.status, "ok");
    for (const entry of result.snapshot.entries) {
      assert.equal(entry.connectionState, "unknown");
    }
  });

  await t.test("replaying the exact same request produces an equal snapshot shape (idempotent observation)", async () => {
    const probe = async (provider) =>
      provider.id === "openrouter"
        ? { connectionState: "connected", source: "env-key-presence", evidence: ["OPENROUTER_API_KEY present"] }
        : { connectionState: "connection_required", source: "oauth-external-marker" };

    const first = await resolveProviderConnectionDiscovery(registry, {
      workspaceId: "workspace-a",
      requestingWorkspaceId: "workspace-a",
      probe,
      nowIso: "2026-10-02T12:00:00.000Z",
    });
    const second = await resolveProviderConnectionDiscovery(registry, {
      workspaceId: "workspace-a",
      requestingWorkspaceId: "workspace-a",
      probe,
      nowIso: "2026-10-02T12:00:00.000Z",
    });
    assert.deepEqual(first, second);
  });

  await t.test("stale snapshot detection: fresh within window, stale beyond it, malformed timestamp always stale", () => {
    const snapshot = { checkedAtIso: "2026-10-02T12:00:00.000Z" };
    assert.equal(isProviderConnectionSnapshotStale(snapshot, "2026-10-02T12:04:00.000Z", 5 * 60_000), false);
    assert.equal(isProviderConnectionSnapshotStale(snapshot, "2026-10-02T12:06:00.000Z", 5 * 60_000), true);
    assert.equal(isProviderConnectionSnapshotStale({ checkedAtIso: "not-a-date" }, "2026-10-02T12:00:00.000Z", 5 * 60_000), true);
    assert.equal(isProviderConnectionSnapshotStale(null, "2026-10-02T12:00:00.000Z", 5 * 60_000), true);
  });

  await t.test("a declared-only capability is never execution-ready, even when connected", () => {
    assert.equal(isExecutionReady({ connectionState: "connected", source: "declared-capability" }), false);
    assert.equal(isExecutionReady({ connectionState: "connected", source: "exercised-capability" }), true);
    assert.equal(isExecutionReady({ connectionState: "connected", source: "env-key-presence" }), true);
    assert.equal(isExecutionReady({ connectionState: "connection_required", source: "exercised-capability" }), false);
    assert.equal(isExecutionReady({ connectionState: "unknown", source: "exercised-capability" }), false);
  });

  await t.test("deriveUnavailableModelIds feeds model-selection-policy without a second router", async () => {
    const { selectModel } = await jiti.import(path.join(__dirname, "model-selection-policy.ts"));
    const { validateAgentModelProfile } = await jiti.import(
      path.join(__dirname, "agent-model-profile-contract.ts"),
    );

    const profile = {
      agentId: "mission",
      displayName: "Mission agent",
      routes: {
        conversation: {
          candidateModelIds: ["codex/gpt-codex", "vendor/free-model:free"],
          bindingMode: "auto",
        },
      },
    };
    assert.equal(validateAgentModelProfile(profile).ok, true);

    // Codex is connection_required; OpenRouter is connected via a real key.
    const probe = async (provider) =>
      provider.id === "openai-codex"
        ? { connectionState: "connection_required", source: "oauth-external-marker" }
        : { connectionState: "connected", source: "env-key-presence" };

    const discovery = await resolveProviderConnectionDiscovery(registry, {
      workspaceId: "workspace-a",
      requestingWorkspaceId: "workspace-a",
      probe,
    });
    assert.equal(discovery.status, "ok");

    const unavailableModelIds = deriveUnavailableModelIds(registry, discovery.snapshot);
    assert.ok(unavailableModelIds.includes("codex/gpt-codex"));
    assert.ok(!unavailableModelIds.includes("vendor/free-model:free"));

    const decision = selectModel(registry, {
      profile,
      route: "conversation",
      unavailableModelIds,
    });
    assert.equal(decision.eligible, true);
    assert.equal(decision.modelId, "vendor/free-model:free");
    assert.equal(
      decision.skipped.some((s) => s.modelId === "codex/gpt-codex" && s.reasonCode === "model_unavailable"),
      true,
    );
  });

  await t.test("a provider missing from the snapshot is treated as unavailable, never as available", () => {
    const partialSnapshot = {
      workspaceId: "workspace-a",
      checkedAtIso: "2026-10-02T12:00:00.000Z",
      entries: [{ providerId: "openrouter", connectionState: "connected", source: "env-key-presence", checkedAtIso: "2026-10-02T12:00:00.000Z", evidence: [] }],
    };
    const unavailableModelIds = deriveUnavailableModelIds(registry, partialSnapshot);
    assert.ok(unavailableModelIds.includes("codex/gpt-codex"));
  });
});
