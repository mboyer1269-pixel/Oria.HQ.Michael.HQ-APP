#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Gated OpenHands launch tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const {
    createGatedOpenHandsLaunch,
    resolveExecutorProviderBinding,
    DEFAULT_EXECUTOR_PROVIDER_REGISTRY,
  } = await jiti.import(path.join(__dirname, "model-emission-launch-gate.ts"));
  const { createStaticProviderRegistry } = await jiti.import(
    path.join(__dirname, "..", "agents", "models", "provider-registry-contract.ts"),
  );

  const CONTEXT = { workspaceId: "workspace-a", actorId: "actor-1" };
  const MISSION_ID = "11111111-1111-1111-1111-111111111111";
  const CONFIRMATION = { expectedLaunchHash: "a".repeat(64), confirm: true };
  const FIXED_NOW_MS = Date.parse("2026-10-02T12:30:00.000Z");

  const baseMission = {
    id: MISSION_ID,
    workspaceId: "workspace-a",
    status: "draft",
    requiresApproval: true,
    autonomyLevel: 0,
    riskLevel: "medium",
  };

  const approvedRecord = {
    id: "rec-1", missionId: MISSION_ID, status: "approved",
    approvalScope: ["transition_to_running"], approvedBy: "owner-1", approvedAt: "2026-10-02T11:00:00.000Z",
    createdAt: "2026-10-02T10:00:00.000Z",
  };

  // The real, confirmed plan this codebase can actually produce today:
  // providerProfile.provider is a schema-fixed literal "claude".
  const claudeLaunchConfig = {
    imageDigest: `sha256:${"a".repeat(64)}`,
    executorVersion: "1.50.0",
    runnerId: "runner-1",
    permissionPolicy: "deny",
    maxCostCents: 500,
    maxTokens: 50000,
    maxIterations: 10,
    timeoutSeconds: 600,
    hardTokenLimitEnforced: false,
    providerProfile: {
      id: "claude-default",
      policySha256: "b".repeat(64),
      provider: "claude",
      authentication: "subscription",
      network: "restricted-proxy",
      accountConnectors: "disabled",
    },
  };

  function makeRealLaunchSpy(result = { status: "claimed", externalEffectAllowed: false }) {
    let calls = 0;
    const fn = async () => {
      calls += 1;
      return result;
    };
    return { fn, callCount: () => calls };
  }

  function countingProbe(outcome) {
    let calls = 0;
    const fn = async () => {
      calls += 1;
      return outcome;
    };
    return { fn, callCount: () => calls };
  }

  // ---------------------------------------------------------------------
  // resolveExecutorProviderBinding — pure, independently testable
  // ---------------------------------------------------------------------

  await t.test("no launch config at all -> no_provider_binding", () => {
    const result = resolveExecutorProviderBinding(null, DEFAULT_EXECUTOR_PROVIDER_REGISTRY);
    assert.deepEqual(result, { status: "no_provider_binding" });
  });

  await t.test("a config with no providerProfile at all -> no_provider_binding, never assumed", () => {
    const { providerProfile: _drop, ...withoutProfile } = claudeLaunchConfig;
    void _drop;
    const result = resolveExecutorProviderBinding(withoutProfile, DEFAULT_EXECUTOR_PROVIDER_REGISTRY);
    assert.deepEqual(result, { status: "no_provider_binding" });
  });

  await t.test("a resolved provider the given registry does not contain -> plan_executor_mismatch, never silently substituted", () => {
    const emptyRegistry = createStaticProviderRegistry({ providers: [], models: [], adapters: [] }).registry;
    const result = resolveExecutorProviderBinding(claudeLaunchConfig, emptyRegistry);
    assert.deepEqual(result, { status: "plan_executor_mismatch", registryProviderId: "claude-code-cli" });
  });

  await t.test("a registry that wires the WRONG account (openai-codex instead of the plan's claude) also mismatches", () => {
    // This is exactly the bug caught in review: a registry/probe scoped to
    // the Hermes/Codex account has no relationship to a "claude" plan.
    const wrongAccountRegistry = createStaticProviderRegistry({
      providers: [{ id: "openai-codex", label: "OpenAI Codex (unrelated account)", kind: "api", trustLevel: "reviewed", supportsMcp: false, supportsToolUse: true }],
      models: [{ id: "codex/gpt-codex", providerId: "openai-codex", label: "x", pricing: { promptUsdPerMTok: 0, completionUsdPerMTok: 0, perRequestUsd: 0 }, costTier: "free", supportsToolUse: true, supportsStructuredJson: true, supportsMcp: false, provenance: { source: "manual" } }],
      adapters: [{ id: "openai-codex-cli", label: "x", kind: "cli-subscription", providerId: "openai-codex", sentinelle: { defaultZone: "yellow", requiresApprovalForToolUse: true }, ledgerRequired: true }],
    }).registry;
    const result = resolveExecutorProviderBinding(claudeLaunchConfig, wrongAccountRegistry);
    assert.deepEqual(result, { status: "plan_executor_mismatch", registryProviderId: "claude-code-cli" });
  });

  await t.test("the plan's provider resolved against the matching registry -> bound", () => {
    const result = resolveExecutorProviderBinding(claudeLaunchConfig, DEFAULT_EXECUTOR_PROVIDER_REGISTRY);
    assert.deepEqual(result, { status: "bound", providerId: "claude", registryProviderId: "claude-code-cli" });
  });

  // ---------------------------------------------------------------------
  // createGatedOpenHandsLaunch — the real wrapper
  // ---------------------------------------------------------------------

  await t.test("prepare_launch (no confirmation) is never gated — passes straight through", async () => {
    const spy = makeRealLaunchSpy({ status: "prepared", externalEffectAllowed: false });
    const gated = createGatedOpenHandsLaunch({
      launch: spy.fn,
      loadMission: async () => { throw new Error("loadMission must not be called for a dry preview"); },
      loadApprovalRecord: async () => { throw new Error("loadApprovalRecord must not be called for a dry preview"); },
      loadLaunchConfig: () => { throw new Error("loadLaunchConfig must not be called for a dry preview"); },
    });
    const result = await gated(CONTEXT, MISSION_ID, undefined);
    assert.deepEqual(result, { status: "prepared", externalEffectAllowed: false });
    assert.equal(spy.callCount(), 1);
  });

  await t.test("a missing mission is passed through untouched — the real service's own not_found stands", async () => {
    const spy = makeRealLaunchSpy({ status: "not_found" });
    const gated = createGatedOpenHandsLaunch({
      launch: spy.fn,
      loadMission: async () => null,
      loadApprovalRecord: async () => { throw new Error("must not be called when there is no mission"); },
      loadLaunchConfig: () => { throw new Error("must not be called when there is no mission"); },
    });
    const result = await gated(CONTEXT, MISSION_ID, CONFIRMATION);
    assert.deepEqual(result, { status: "not_found" });
    assert.equal(spy.callCount(), 1);
  });

  await t.test("no launch config available: refused as no_provider_binding BEFORE any approval/connection read, launch never called", async () => {
    const spy = makeRealLaunchSpy();
    const gated = createGatedOpenHandsLaunch({
      launch: spy.fn,
      loadMission: async () => baseMission,
      loadApprovalRecord: async () => { throw new Error("must not be reached: no provider binding yet"); },
      loadLaunchConfig: () => null,
      now: () => FIXED_NOW_MS,
    });
    const result = await gated(CONTEXT, MISSION_ID, CONFIRMATION);
    assert.deepEqual(result, { status: "no_provider_binding", externalEffectAllowed: false });
    assert.equal(spy.callCount(), 0);
  });

  await t.test("config names a provider this gate's registry does not contain: plan_executor_mismatch, launch never called", async () => {
    const spy = makeRealLaunchSpy();
    const emptyRegistry = createStaticProviderRegistry({ providers: [], models: [], adapters: [] }).registry;
    const gated = createGatedOpenHandsLaunch({
      launch: spy.fn,
      loadMission: async () => baseMission,
      loadApprovalRecord: async () => { throw new Error("must not be reached: mismatch resolved first"); },
      loadLaunchConfig: () => claudeLaunchConfig,
      registry: emptyRegistry,
      now: () => FIXED_NOW_MS,
    });
    const result = await gated(CONTEXT, MISSION_ID, CONFIRMATION);
    assert.deepEqual(result, { status: "plan_executor_mismatch", externalEffectAllowed: false, registryProviderId: "claude-code-cli" });
    assert.equal(spy.callCount(), 0);
  });

  await t.test("DEFAULT behavior with no connectionProbe supplied: every confirm is honestly blocked — no real probe is claimed to exist", async () => {
    const spy = makeRealLaunchSpy();
    const gated = createGatedOpenHandsLaunch({
      launch: spy.fn,
      loadMission: async () => baseMission,
      loadApprovalRecord: async () => approvedRecord,
      loadLaunchConfig: () => claudeLaunchConfig,
      now: () => FIXED_NOW_MS,
    });
    const result = await gated(CONTEXT, MISSION_ID, CONFIRMATION);
    assert.equal(result.status, "model_emission_blocked");
    assert.equal(result.gate.status, "ok");
    assert.equal(result.gate.assessment.emit, false);
    assert.equal(result.gate.assessment.block, "public_catalog_only");
    assert.equal(spy.callCount(), 0);
  });

  await t.test("no approval record at all (with a hypothetical connected probe): blocked on authorization, not connection", async () => {
    const spy = makeRealLaunchSpy();
    const connected = countingProbe({ connectionState: "connected", source: "cli-subscription-login", evidence: ["illustrative"] });
    const gated = createGatedOpenHandsLaunch({
      launch: spy.fn,
      loadMission: async () => baseMission,
      loadApprovalRecord: async () => null,
      loadLaunchConfig: () => claudeLaunchConfig,
      connectionProbe: connected.fn,
      now: () => FIXED_NOW_MS,
    });
    const result = await gated(CONTEXT, MISSION_ID, CONFIRMATION);
    assert.equal(result.status, "model_emission_blocked");
    assert.deepEqual(result.gate, { status: "authorization_missing" });
    assert.equal(spy.callCount(), 0);
  });

  await t.test("a rejected approval record (with a hypothetical connected probe): blocked not_authorized, launch never called", async () => {
    const spy = makeRealLaunchSpy();
    const connected = countingProbe({ connectionState: "connected", source: "cli-subscription-login", evidence: ["illustrative"] });
    const gated = createGatedOpenHandsLaunch({
      launch: spy.fn,
      loadMission: async () => baseMission,
      loadApprovalRecord: async () => ({ ...approvedRecord, status: "rejected" }),
      loadLaunchConfig: () => claudeLaunchConfig,
      connectionProbe: connected.fn,
      now: () => FIXED_NOW_MS,
    });
    const result = await gated(CONTEXT, MISSION_ID, CONFIRMATION);
    assert.equal(result.status, "model_emission_blocked");
    assert.equal(result.gate.status, "ok");
    assert.deepEqual(result.gate.assessment, { emit: false, block: "not_authorized", requestedModelId: "openhands-executor/claude-code-cli" });
    assert.equal(spy.callCount(), 0);
  });

  await t.test("bound plan + verified approval + a hypothetical connected probe: the REAL launch function is actually called, unchanged", async () => {
    const spy = makeRealLaunchSpy({ status: "claimed", externalEffectAllowed: false, claim: { launchId: "launch-xyz" } });
    const connected = countingProbe({ connectionState: "connected", source: "cli-subscription-login", evidence: ["illustrative — no real probe wired yet"] });
    const gated = createGatedOpenHandsLaunch({
      launch: spy.fn,
      loadMission: async (workspaceId, missionId) => {
        assert.equal(workspaceId, CONTEXT.workspaceId);
        assert.equal(missionId, MISSION_ID);
        return baseMission;
      },
      loadApprovalRecord: async (missionId) => {
        assert.equal(missionId, MISSION_ID);
        return approvedRecord;
      },
      loadLaunchConfig: () => claudeLaunchConfig,
      connectionProbe: connected.fn,
      now: () => FIXED_NOW_MS,
    });
    const result = await gated(CONTEXT, MISSION_ID, CONFIRMATION);
    assert.deepEqual(result, { status: "claimed", externalEffectAllowed: false, claim: { launchId: "launch-xyz" } });
    assert.equal(spy.callCount(), 1, "the real launch must be called exactly once when the gate clears");
  });

  await t.test("TOCTOU: config, approval, and connection are all re-read fresh on every call — nothing is cached across calls", async () => {
    const spy = makeRealLaunchSpy();
    const connected = countingProbe({ connectionState: "connected", source: "cli-subscription-login", evidence: [] });
    let approvalCalls = 0;
    let configCalls = 0;
    const gated = createGatedOpenHandsLaunch({
      launch: spy.fn,
      loadMission: async () => baseMission,
      loadApprovalRecord: async () => { approvalCalls += 1; return null; },
      loadLaunchConfig: () => { configCalls += 1; return claudeLaunchConfig; },
      connectionProbe: connected.fn,
      now: () => FIXED_NOW_MS,
    });
    await gated(CONTEXT, MISSION_ID, CONFIRMATION);
    await gated(CONTEXT, MISSION_ID, CONFIRMATION);
    assert.equal(approvalCalls, 2, "approval must be re-read on every call, never cached from a prior gate decision");
    assert.equal(configCalls, 2, "launch config must be re-read on every call, same as createConfiguredOpenHandsLaunch's own re-read");
    assert.equal(connected.callCount(), 2, "connection must be re-checked on every call, never cached");
  });

  await t.test("replaying the exact same confirm with the same inputs produces a deep-equal blocked result (idempotent, no new side effect)", async () => {
    const spy = makeRealLaunchSpy();
    const deps = {
      launch: spy.fn,
      loadMission: async () => baseMission,
      loadApprovalRecord: async () => null,
      loadLaunchConfig: () => claudeLaunchConfig,
      now: () => FIXED_NOW_MS,
    };
    const gated = createGatedOpenHandsLaunch(deps);
    const first = await gated(CONTEXT, MISSION_ID, CONFIRMATION);
    const second = await gated(CONTEXT, MISSION_ID, CONFIRMATION);
    assert.deepEqual(first, second);
    assert.equal(spy.callCount(), 0);
  });

  await t.test("DEFAULT_EXECUTOR_PROVIDER_REGISTRY is a single real-plan-aligned DTO, not a general catalog", () => {
    assert.equal(DEFAULT_EXECUTOR_PROVIDER_REGISTRY.listProviders().length, 1);
    assert.equal(DEFAULT_EXECUTOR_PROVIDER_REGISTRY.listModels().length, 1);
    assert.equal(DEFAULT_EXECUTOR_PROVIDER_REGISTRY.getProvider("claude-code-cli")?.id, "claude-code-cli");
  });
});
