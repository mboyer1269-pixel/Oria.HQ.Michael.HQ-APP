#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Model emission gate tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const { evaluateModelEmissionGate } = await jiti.import(path.join(__dirname, "model-emission-gate.ts"));
  const { createStaticProviderRegistry } = await jiti.import(
    path.join(__dirname, "..", "agents", "models", "provider-registry-contract.ts"),
  );

  const registryResult = createStaticProviderRegistry({
    providers: [
      { id: "openai-codex", label: "OpenAI Codex (ChatGPT OAuth)", kind: "api", trustLevel: "reviewed", supportsMcp: false, supportsToolUse: true },
    ],
    models: [
      {
        id: "codex/gpt-codex",
        providerId: "openai-codex",
        label: "Codex model",
        pricing: { promptUsdPerMTok: 0, completionUsdPerMTok: 0, perRequestUsd: 0 },
        costTier: "free",
        supportsToolUse: true,
        supportsStructuredJson: true,
        supportsMcp: false,
        provenance: { source: "manual" },
      },
    ],
    adapters: [
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
  assert.equal(registryResult.ok, true);
  const registry = registryResult.registry;

  const connectedSnapshot = {
    workspaceId: "workspace-a",
    checkedAtIso: "2026-10-02T12:00:00.000Z",
    entries: [
      {
        providerId: "openai-codex",
        connectionState: "connected",
        source: "cli-subscription-login",
        checkedAtIso: "2026-10-02T12:00:00.000Z",
        evidence: ["hermes_cli auth status openai-codex -> openai-codex: logged in"],
      },
    ],
  };
  const validTariff = { currency: "USD", notToExceedCents: 500, source: "operator-set-budget", observedAt: "2026-10-02T12:00:00.000Z" };
  const nowMs = Date.parse("2026-10-02T12:30:00.000Z");

  const baseRequest = {
    workspaceId: "workspace-a",
    requestingWorkspaceId: "workspace-a",
    modelId: "codex/gpt-codex",
    requiresTools: true,
    registry,
    connectionSnapshot: connectedSnapshot,
    authorization: { authorized: true, authorizedBy: "mission-approval-1", authorizedAtIso: "2026-10-02T12:15:00.000Z" },
    tariff: validTariff,
    nowMs,
  };

  await t.test("cross-workspace request is refused before the catalog is even built", () => {
    const result = evaluateModelEmissionGate({ ...baseRequest, requestingWorkspaceId: "workspace-b" });
    assert.deepEqual(result, { status: "cross_workspace_denied" });
  });

  await t.test("missing registry/catalog input (invalid request) is refused, never guessed", () => {
    const result = evaluateModelEmissionGate({ ...baseRequest, registry: undefined });
    assert.equal(result.status, "invalid_request");
  });

  await t.test("no connection discovery: refused by name, not folded into a generic denial", () => {
    const result = evaluateModelEmissionGate({ ...baseRequest, connectionSnapshot: null });
    assert.deepEqual(result, { status: "connection_discovery_missing" });
  });

  await t.test("no authorization decision: refused by name — connection alone never grants emission", () => {
    const result = evaluateModelEmissionGate({ ...baseRequest, authorization: null });
    assert.deepEqual(result, { status: "authorization_missing" });
  });

  await t.test("no budget/tariff: refused by name", () => {
    const result = evaluateModelEmissionGate({ ...baseRequest, tariff: null });
    assert.deepEqual(result, { status: "budget_missing" });
  });

  await t.test("real connected evidence + explicit authorization + valid tariff -> emission allowed", () => {
    const result = evaluateModelEmissionGate(baseRequest);
    assert.equal(result.status, "ok");
    assert.equal(result.assessment.emit, true);
    assert.equal(result.assessment.capability.state, "authorized");
    assert.equal(result.assessment.capability.modelId, "codex/gpt-codex");
  });

  await t.test("connected but NOT authorized caps the entry at 'connected' — assessServerEmission blocks not_authorized", () => {
    const result = evaluateModelEmissionGate({
      ...baseRequest,
      authorization: { authorized: false, authorizedBy: "mission-approval-1", authorizedAtIso: "2026-10-02T12:15:00.000Z" },
    });
    assert.equal(result.status, "ok");
    assert.deepEqual(result.assessment, { emit: false, block: "not_authorized", requestedModelId: "codex/gpt-codex" });
  });

  await t.test("a provider that is NOT connected caps the entry at 'listed', even when authorization says true", () => {
    const disconnectedSnapshot = {
      workspaceId: "workspace-a",
      checkedAtIso: "2026-10-02T12:00:00.000Z",
      entries: [
        { providerId: "openai-codex", connectionState: "connection_required", source: "cli-subscription-login", checkedAtIso: "2026-10-02T12:00:00.000Z", evidence: [] },
      ],
    };
    const result = evaluateModelEmissionGate({ ...baseRequest, connectionSnapshot: disconnectedSnapshot });
    assert.equal(result.status, "ok");
    assert.deepEqual(result.assessment, { emit: false, block: "public_catalog_only", requestedModelId: "codex/gpt-codex" });
  });

  await t.test("a declared-only (not execution-ready) connection also caps the entry at 'listed'", () => {
    const declaredOnlySnapshot = {
      workspaceId: "workspace-a",
      checkedAtIso: "2026-10-02T12:00:00.000Z",
      entries: [
        { providerId: "openai-codex", connectionState: "connected", source: "declared-capability", checkedAtIso: "2026-10-02T12:00:00.000Z", evidence: [] },
      ],
    };
    const result = evaluateModelEmissionGate({ ...baseRequest, connectionSnapshot: declaredOnlySnapshot });
    assert.equal(result.status, "ok");
    assert.equal(result.assessment.emit, false);
    assert.equal(result.assessment.block, "public_catalog_only");
  });

  await t.test("an unknown model id produces not_listed — no entry is fabricated", () => {
    const result = evaluateModelEmissionGate({ ...baseRequest, modelId: "nonexistent/model" });
    assert.equal(result.status, "ok");
    assert.deepEqual(result.assessment, { emit: false, block: "not_listed", requestedModelId: "nonexistent/model" });
  });

  await t.test("requiresTools true against a tool-incapable model is blocked by Cursor's own gate, unchanged by this caller", () => {
    const noToolsRegistry = createStaticProviderRegistry({
      providers: [{ id: "openai-codex", label: "x", kind: "api", trustLevel: "reviewed", supportsMcp: false, supportsToolUse: true }],
      models: [
        {
          id: "codex/no-tools",
          providerId: "openai-codex",
          label: "No tools",
          pricing: { promptUsdPerMTok: 0, completionUsdPerMTok: 0, perRequestUsd: 0 },
          costTier: "free",
          supportsToolUse: false,
          supportsStructuredJson: true,
          supportsMcp: false,
          provenance: { source: "manual" },
        },
      ],
      adapters: [{ id: "openai-codex-cli", label: "x", kind: "cli-subscription", providerId: "openai-codex", sentinelle: { defaultZone: "yellow", requiresApprovalForToolUse: true }, ledgerRequired: true }],
    }).registry;
    const result = evaluateModelEmissionGate({ ...baseRequest, registry: noToolsRegistry, modelId: "codex/no-tools" });
    assert.equal(result.status, "ok");
    assert.deepEqual(result.assessment, { emit: false, block: "tools_unavailable", requestedModelId: "codex/no-tools" });
  });

  await t.test("replaying the exact same request produces a deep-equal result (idempotent, no new side effect)", () => {
    const first = evaluateModelEmissionGate(baseRequest);
    const second = evaluateModelEmissionGate(baseRequest);
    assert.deepEqual(first, second);
  });
});
