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
      { id: "openrouter", label: "OpenRouter", kind: "router", trustLevel: "allowlisted", apiKeyEnvVar: "OPENROUTER_API_KEY", supportsMcp: false, supportsToolUse: true },
    ],
    models: [
      {
        id: "codex/gpt-codex",
        providerId: "openai-codex",
        label: "Codex model",
        // Deliberately non-zero/mixed pricing: billingKind must come from the
        // SUBSCRIPTION evidence, not from this field, when the two disagree.
        pricing: { promptUsdPerMTok: 3, completionUsdPerMTok: 15, perRequestUsd: 0 },
        costTier: "premium",
        supportsToolUse: true,
        supportsStructuredJson: true,
        supportsMcp: false,
        provenance: { source: "manual" },
      },
      {
        id: "vendor/free-model:free",
        providerId: "openrouter",
        label: "Free model",
        pricing: { promptUsdPerMTok: 0, completionUsdPerMTok: 0, perRequestUsd: 0 },
        costTier: "free",
        supportsToolUse: false,
        supportsStructuredJson: true,
        supportsMcp: false,
        provenance: { source: "static-file" },
      },
      {
        id: "openrouter/paid-model",
        providerId: "openrouter",
        label: "Paid model",
        pricing: { promptUsdPerMTok: 1, completionUsdPerMTok: 2, perRequestUsd: 0 },
        costTier: "economy",
        supportsToolUse: true,
        supportsStructuredJson: true,
        supportsMcp: false,
        provenance: { source: "static-file" },
      },
    ],
    adapters: [
      { id: "openai-codex-cli", label: "Codex CLI subscription", kind: "cli-subscription", providerId: "openai-codex", sentinelle: { defaultZone: "yellow", requiresApprovalForToolUse: true }, ledgerRequired: true },
      { id: "openrouter-http", label: "OpenRouter HTTP", kind: "http-api", providerId: "openrouter", sentinelle: { defaultZone: "green", requiresApprovalForToolUse: false }, ledgerRequired: true },
    ],
  });
  assert.equal(registryResult.ok, true);
  const registry = registryResult.registry;

  const codexConnectedSnapshot = {
    workspaceId: "workspace-a",
    checkedAtIso: "2026-10-02T00:00:00.000Z", // deliberately stale/irrelevant SNAPSHOT-level timestamp
    entries: [
      {
        providerId: "openai-codex",
        connectionState: "connected",
        source: "cli-subscription-login",
        // The entry's OWN, fresh timestamp — must be what the gate actually uses.
        checkedAtIso: "2026-10-02T12:00:00.000Z",
        evidence: ["hermes_cli auth status openai-codex -> openai-codex: logged in"],
      },
    ],
  };
  const authorized = { authorized: true, authorizedBy: "mission-approval-1", authorizedAtIso: "2026-10-02T12:15:00.000Z" };
  const nowMs = Date.parse("2026-10-02T12:30:00.000Z");

  const baseRequest = {
    workspaceId: "workspace-a",
    requestingWorkspaceId: "workspace-a",
    modelId: "codex/gpt-codex",
    requiresTools: true,
    registry,
    connectionSnapshot: codexConnectedSnapshot,
    authorization: authorized,
    tariff: null,
    // ApprovedServerBinding axes (server-capability-catalog.ts): real,
    // already-qualified identities a caller would actually have, not
    // fabricated per-test. accountId mirrors a qualified providerProfile.id;
    // catalogRevision mirrors its policySha256.
    accountId: "codex-default",
    catalogRevision: "a".repeat(64),
    nowMs,
  };

  await t.test("missing accountId or catalogRevision (ApprovedServerBinding axes) is invalid_request, never silently omitted", () => {
    const { accountId: _drop1, ...withoutAccountId } = baseRequest;
    void _drop1;
    assert.equal(evaluateModelEmissionGate(withoutAccountId).status, "invalid_request");
    const { catalogRevision: _drop2, ...withoutRevision } = baseRequest;
    void _drop2;
    assert.equal(evaluateModelEmissionGate(withoutRevision).status, "invalid_request");
  });

  await t.test("cross-workspace request is refused before the catalog is even built", () => {
    const result = evaluateModelEmissionGate({ ...baseRequest, requestingWorkspaceId: "workspace-b" });
    assert.deepEqual(result, { status: "cross_workspace_denied" });
  });

  await t.test("a connection snapshot scoped to ANOTHER workspace is refused, even if both request ids agree", () => {
    const foreignSnapshot = { ...codexConnectedSnapshot, workspaceId: "workspace-z" };
    const result = evaluateModelEmissionGate({ ...baseRequest, connectionSnapshot: foreignSnapshot });
    assert.deepEqual(result, { status: "connection_snapshot_workspace_mismatch" });
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

  await t.test("a subscription-connected, authorized model is non_api-authorized WITHOUT any tariff — never emit:true for a subscription", () => {
    // Cursor's assessServerEmission refuses to EMIT (metered-call) a
    // subscription/verified_free capability: disposition:"non_api" is the
    // correct outcome, not a failure. Callers whose own execution path IS
    // the subscription (an OpenHands launch, never a JSON API call) must
    // read this disposition as their own success condition - this module
    // itself still just forwards assessServerEmission's verdict unmodified.
    const result = evaluateModelEmissionGate(baseRequest); // tariff: null in baseRequest
    assert.equal(result.status, "ok");
    assert.equal(result.assessment.emit, false);
    assert.equal(result.assessment.disposition, "non_api");
    assert.equal(result.assessment.billingKind, "subscription");
    assert.equal("notToExceedCents" in result.assessment, false);
    assert.equal(result.assessment.capability.billingKind, "subscription");
    assert.equal(result.assessment.capability.tariff, null);
    assert.equal(result.assessment.capability.accountId, baseRequest.accountId);
    // The catalog's model pricing says "premium" — proof billingKind came from
    // the connection evidence, not from the model's own pricing descriptor.
  });

  await t.test("the entry's observedAt is the PROVIDER ENTRY's own timestamp, not the snapshot-level one", () => {
    const result = evaluateModelEmissionGate(baseRequest);
    assert.equal(result.status, "ok");
    assert.equal(result.assessment.capability.observedAt, "2026-10-02T12:00:00.000Z");
    assert.notEqual(result.assessment.capability.observedAt, codexConnectedSnapshot.checkedAtIso);
  });

  await t.test("a stale INDIVIDUAL provider entry is blocked even while the snapshot-level timestamp looks fresh", () => {
    const staleEntrySnapshot = {
      workspaceId: "workspace-a",
      checkedAtIso: "2026-10-02T12:29:59.000Z", // snapshot-level: looks fresh relative to nowMs
      entries: [
        {
          providerId: "openai-codex",
          connectionState: "connected",
          source: "cli-subscription-login",
          checkedAtIso: "2026-09-01T00:00:00.000Z", // but THIS entry is actually ancient
          evidence: ["hermes_cli auth status openai-codex -> openai-codex: logged in"],
        },
      ],
    };
    const result = evaluateModelEmissionGate({ ...baseRequest, connectionSnapshot: staleEntrySnapshot });
    assert.equal(result.status, "ok");
    assert.deepEqual(result.assessment, { emit: false, block: "capability_stale", requestedModelId: "codex/gpt-codex" });
  });

  await t.test("budget_missing is raised ONLY for billingKind 'api' — never for subscription or verified_free", () => {
    // Subscription path: no tariff supplied, must NOT be budget_missing.
    const subscriptionResult = evaluateModelEmissionGate({ ...baseRequest, tariff: null });
    assert.notEqual(subscriptionResult.status, "budget_missing");

    // Verified-free path (OpenRouter, catalog-proven zero pricing, api-key connection).
    const freeSnapshot = {
      workspaceId: "workspace-a",
      checkedAtIso: "2026-10-02T12:00:00.000Z",
      entries: [{ providerId: "openrouter", connectionState: "connected", source: "env-key-presence", checkedAtIso: "2026-10-02T12:00:00.000Z", evidence: ["OPENROUTER_API_KEY present"] }],
    };
    const freeResult = evaluateModelEmissionGate({
      ...baseRequest,
      modelId: "vendor/free-model:free",
      requiresTools: false,
      connectionSnapshot: freeSnapshot,
      tariff: null,
    });
    assert.notEqual(freeResult.status, "budget_missing");
    assert.equal(freeResult.status, "ok");
    assert.equal(freeResult.assessment.emit, false);
    assert.equal(freeResult.assessment.disposition, "non_api");
    assert.equal(freeResult.assessment.billingKind, "verified_free");
    assert.equal(freeResult.assessment.capability.tariff, null);
  });

  await t.test("budget_missing IS raised for a genuinely metered 'api' model with no tariff", () => {
    const paidSnapshot = {
      workspaceId: "workspace-a",
      checkedAtIso: "2026-10-02T12:00:00.000Z",
      entries: [{ providerId: "openrouter", connectionState: "connected", source: "env-key-presence", checkedAtIso: "2026-10-02T12:00:00.000Z", evidence: ["OPENROUTER_API_KEY present"] }],
    };
    const result = evaluateModelEmissionGate({
      ...baseRequest,
      modelId: "openrouter/paid-model",
      connectionSnapshot: paidSnapshot,
      tariff: null,
    });
    assert.deepEqual(result, { status: "budget_missing" });
  });

  await t.test("a genuinely metered 'api' model WITH a valid tariff emits with billingKind 'api' and notToExceedCents", () => {
    const paidSnapshot = {
      workspaceId: "workspace-a",
      checkedAtIso: "2026-10-02T12:00:00.000Z",
      entries: [{ providerId: "openrouter", connectionState: "connected", source: "env-key-presence", checkedAtIso: "2026-10-02T12:00:00.000Z", evidence: ["OPENROUTER_API_KEY present"] }],
    };
    const tariff = { currency: "USD", notToExceedCents: 500, source: "operator-set-budget", observedAt: "2026-10-02T12:00:00.000Z" };
    const result = evaluateModelEmissionGate({
      ...baseRequest,
      modelId: "openrouter/paid-model",
      connectionSnapshot: paidSnapshot,
      tariff,
    });
    assert.equal(result.status, "ok");
    assert.equal(result.assessment.emit, true);
    assert.equal(result.assessment.billingKind, "api");
    assert.equal(result.assessment.notToExceedCents, 500);
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
      entries: [{ providerId: "openai-codex", connectionState: "connection_required", source: "cli-subscription-login", checkedAtIso: "2026-10-02T12:00:00.000Z", evidence: [] }],
    };
    const result = evaluateModelEmissionGate({ ...baseRequest, connectionSnapshot: disconnectedSnapshot });
    assert.equal(result.status, "ok");
    assert.deepEqual(result.assessment, { emit: false, block: "public_catalog_only", requestedModelId: "codex/gpt-codex" });
  });

  await t.test("a declared-only (not execution-ready) connection also caps the entry at 'listed'", () => {
    const declaredOnlySnapshot = {
      workspaceId: "workspace-a",
      checkedAtIso: "2026-10-02T12:00:00.000Z",
      entries: [{ providerId: "openai-codex", connectionState: "connected", source: "declared-capability", checkedAtIso: "2026-10-02T12:00:00.000Z", evidence: [] }],
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

  await t.test("invokedProviderId is forwarded: a mismatched invoked provider is blocked by Cursor's own gate", () => {
    const result = evaluateModelEmissionGate({ ...baseRequest, invokedProviderId: "some-other-adapter-provider" });
    assert.equal(result.status, "ok");
    assert.deepEqual(result.assessment, { emit: false, block: "provider_mismatch", requestedModelId: "codex/gpt-codex" });
  });

  await t.test("invokedProviderId matching the entry's provider still resolves to non_api-authorized (subscription), not provider_mismatch", () => {
    const result = evaluateModelEmissionGate({ ...baseRequest, invokedProviderId: "openai-codex" });
    assert.equal(result.status, "ok");
    assert.equal(result.assessment.emit, false);
    assert.equal(result.assessment.disposition, "non_api");
    assert.equal(result.assessment.billingKind, "subscription");
  });

  await t.test("requiresTools true against a tool-incapable model is blocked by Cursor's own gate, unchanged by this caller", () => {
    const freeSnapshot = {
      workspaceId: "workspace-a",
      checkedAtIso: "2026-10-02T12:00:00.000Z",
      entries: [{ providerId: "openrouter", connectionState: "connected", source: "env-key-presence", checkedAtIso: "2026-10-02T12:00:00.000Z", evidence: ["OPENROUTER_API_KEY present"] }],
    };
    const result = evaluateModelEmissionGate({
      ...baseRequest,
      modelId: "vendor/free-model:free",
      requiresTools: true,
      connectionSnapshot: freeSnapshot,
    });
    assert.equal(result.status, "ok");
    assert.deepEqual(result.assessment, { emit: false, block: "tools_unavailable", requestedModelId: "vendor/free-model:free" });
  });

  await t.test("replaying the exact same request produces a deep-equal result (idempotent, no new side effect)", () => {
    const first = evaluateModelEmissionGate(baseRequest);
    const second = evaluateModelEmissionGate(baseRequest);
    assert.deepEqual(first, second);
  });
});
