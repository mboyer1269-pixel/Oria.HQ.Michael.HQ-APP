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
    approvalStillAuthorizes,
    attestedAccountStillMatches,
    DEFAULT_EXECUTOR_PROVIDER_REGISTRY,
  } = await jiti.import(path.join(__dirname, "model-emission-launch-gate.ts"));
  const { createStaticProviderRegistry } = await jiti.import(
    path.join(__dirname, "..", "agents", "models", "provider-registry-contract.ts"),
  );
  const { createRunnerClaudeCliConnectionProbe, RUNNER_CLAUDE_VERSION_COMMAND, RUNNER_CLAUDE_AUTH_STATUS_COMMAND } =
    await jiti.import(path.join(__dirname, "..", "agents", "models", "runner-executor-connection-probe.ts"));

  const CONTEXT = { workspaceId: "workspace-a", actorId: "actor-1" };
  const MISSION_ID = "11111111-1111-4111-8111-111111111111";
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
    approvalScope: ["transition_to_running"], approvedBy: CONTEXT.actorId, approvedAt: "2026-10-02T11:00:00.000Z",
    createdAt: "2026-10-02T10:00:00.000Z",
  };

  // The real, confirmed plan this codebase can actually produce today:
  // providerProfile.provider is a schema-fixed literal "claude".
  const claudeLaunchConfig = {
    foundationModelId: "claude-fixture-1",
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

  // A real connectionProbe would never attest an account on its own for
  // every test, but most tests here are not ABOUT the account-identity
  // axis — they need a stable, attested, server-side identity (never a
  // profile/config one) to even reach the logic they actually test.
  // ACCOUNT_ID is an arbitrary opaque string, same doctrine as the probe's
  // own doc comment: a safe, non-raw stand-in, never a real credential.
  const ACCOUNT_ID = "attested-account-1";
  baseMission.updatedAt = "2026-10-02T10:00:00.000Z";
  approvedRecord.binding = { version: 1, missionVersion: baseMission.updatedAt,
    launch: { workspaceId: CONTEXT.workspaceId, missionId: MISSION_ID,
      reservationId: "22222222-2222-4222-8222-222222222222", payloadHash: "b".repeat(64),
      commitSha: "c".repeat(40), config: claudeLaunchConfig, launchHash: CONFIRMATION.expectedLaunchHash },
    access: { workspaceId: CONTEXT.workspaceId, accountId: ACCOUNT_ID,
      modelId: "openhands-executor/claude-code-cli", providerId: "claude-code-cli",
      billingKind: "subscription", catalogRevision: claudeLaunchConfig.providerProfile.policySha256 } };
  function connectedWithAccount(accountId = ACCOUNT_ID) {
    return { connectionState: "connected", source: "cli-subscription-login", accountId, evidence: ["illustrative"] };
  }
  function assertAccountUnverifiable(result, providerId = "claude-code-cli") {
    assert.equal(result.status, "account_identity_unverifiable");
    assert.equal(result.externalEffectAllowed, false);
    assert.equal(result.providerId, providerId);
    assert.equal(result.configFileEnvVar, "ORIA_OPENHANDS_RUNNER_PROBE_CONFIG_FILE");
    assert.match(result.requiredAction, /ORIA_OPENHANDS_RUNNER_PROBE_CONFIG_FILE|auth status --json|operator binding/);
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

  await t.test("a mission this gate cannot see is refused on confirm — the real launch is called ZERO times, never passed through", async () => {
    // Regression guard for the exact bug caught in review: passing this
    // through to deps.launch would let the real service perform its OWN
    // fresh load and potentially find (or race) a mission that appeared
    // between the two reads — reaching a real launch commit having never
    // been evaluated by this gate at all.
    const spy = makeRealLaunchSpy({ status: "not_found" });
    const gated = createGatedOpenHandsLaunch({
      launch: spy.fn,
      loadMission: async () => null,
      loadApprovalRecord: async () => { throw new Error("must not be called when there is no mission"); },
      loadLaunchConfig: () => { throw new Error("must not be called when there is no mission"); },
    });
    const result = await gated(CONTEXT, MISSION_ID, CONFIRMATION);
    assert.deepEqual(result, { status: "mission_unavailable_for_gate", externalEffectAllowed: false });
    assert.equal(spy.callCount(), 0, "deps.launch must never be called when this gate's own load found nothing");
  });

  await t.test("a dry prepare_launch for a mission this gate cannot see is STILL passed through — nothing is committed by a preview", async () => {
    const spy = makeRealLaunchSpy({ status: "not_found" });
    const gated = createGatedOpenHandsLaunch({
      launch: spy.fn,
      loadMission: async () => { throw new Error("loadMission must not be called for a dry preview"); },
      loadApprovalRecord: async () => { throw new Error("must not be called for a dry preview"); },
      loadLaunchConfig: () => { throw new Error("must not be called for a dry preview"); },
    });
    const result = await gated(CONTEXT, MISSION_ID, undefined);
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

  await t.test("DEFAULT behavior with no connectionProbe supplied: every confirm is honestly blocked — no real probe or account identity is claimed to exist", async () => {
    // The real default probe never attests an account (see
    // runner-executor-connection-probe.ts) and no runner host is deployed,
    // so this now refuses on the account-identity axis BEFORE even reaching
    // Cursor's emission assessment — an earlier, more specific, equally
    // honest refusal than the generic "model_emission_blocked" this used to
    // reach.
    const spy = makeRealLaunchSpy();
    const gated = createGatedOpenHandsLaunch({
      launch: spy.fn,
      loadMission: async () => baseMission,
      loadApprovalRecord: async () => approvedRecord,
      loadLaunchConfig: () => claudeLaunchConfig,
      now: () => FIXED_NOW_MS,
    });
    const result = await gated(CONTEXT, MISSION_ID, CONFIRMATION);
    assertAccountUnverifiable(result);
    assert.equal(spy.callCount(), 0);
  });

  await t.test("no approval record at all (with a hypothetical connected, identity-attested probe): blocked on authorization, not connection or identity", async () => {
    const spy = makeRealLaunchSpy();
    const connected = countingProbe(connectedWithAccount());
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

  await t.test("a rejected approval record (with a hypothetical connected, identity-attested probe): blocked not_authorized, launch never called", async () => {
    const spy = makeRealLaunchSpy();
    const connected = countingProbe(connectedWithAccount());
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

  await t.test("bound plan + verified approval + a hypothetical connected, identity-attested probe: the REAL launch function is actually called, unchanged", async () => {
    const spy = makeRealLaunchSpy({ status: "claimed", externalEffectAllowed: false, claim: { launchId: "launch-xyz" } });
    const connected = countingProbe(connectedWithAccount());
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
    // One probe call per registered provider (now two: Claude and Codex),
    // per gated() call — not per-call-once, since discovery probes the
    // whole registry each time.
    assert.equal(connected.callCount(), 4, "connection must be re-checked for every provider on every call, never cached");
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

  await t.test("DEFAULT_EXECUTOR_PROVIDER_REGISTRY is two real-plan-aligned DTOs (Claude, Codex), not a general catalog", () => {
    assert.equal(DEFAULT_EXECUTOR_PROVIDER_REGISTRY.listProviders().length, 2);
    assert.equal(DEFAULT_EXECUTOR_PROVIDER_REGISTRY.listModels().length, 2);
    assert.equal(DEFAULT_EXECUTOR_PROVIDER_REGISTRY.getProvider("claude-code-cli")?.id, "claude-code-cli");
    assert.equal(DEFAULT_EXECUTOR_PROVIDER_REGISTRY.getProvider("codex-acp-cli")?.id, "codex-acp-cli");
  });

  // ---------------------------------------------------------------------
  // Codex variant — the schema/policy now allow it; the gate must bind it
  // exactly as strictly as Claude's, never through a shared/generic path.
  // ---------------------------------------------------------------------

  const codexLaunchConfig = {
    ...claudeLaunchConfig,
    providerProfile: {
      id: "codex-default",
      policySha256: "c".repeat(64),
      provider: "codex",
      authentication: "subscription",
      network: "restricted-proxy",
      accountConnectors: "disabled",
    },
  };

  await t.test("a Codex-profiled plan resolves against the real default registry -> bound, its own provider id", () => {
    const result = resolveExecutorProviderBinding(codexLaunchConfig, DEFAULT_EXECUTOR_PROVIDER_REGISTRY);
    assert.deepEqual(result, { status: "bound", providerId: "codex", registryProviderId: "codex-acp-cli" });
  });

  await t.test("with the REAL default registry: a Codex-profiled plan is honestly blocked too (no probe surface yet), never defaulted to Claude's", async () => {
    const spy = makeRealLaunchSpy();
    const gated = createGatedOpenHandsLaunch({
      launch: spy.fn,
      loadMission: async () => baseMission,
      loadApprovalRecord: async () => approvedRecord,
      loadLaunchConfig: () => codexLaunchConfig,
      now: () => FIXED_NOW_MS,
    });
    const result = await gated(CONTEXT, MISSION_ID, CONFIRMATION);
    // No real probe attests any account for codex-acp-cli either — blocked
    // on the same account-identity axis, before Cursor's emission gate.
    assertAccountUnverifiable(result, "codex-acp-cli");
    assert.equal(spy.callCount(), 0);
  });

  await t.test("wrong account, with the REAL default registry: a probe that only answers for Claude never resolves a Codex-profiled plan to 'bound' on the wrong provider", () => {
    // Full gate-level emission assessment for this exact scenario is
    // currently blocked by an unrelated, pre-existing, concurrent change —
    // see docs/CLAUDE-APPROVED-SERVER-BINDING-RACCORDEMENT-REQUIS-2026-10-02.md
    // (Orchestrator repo): Cursor's src/server/ai/server-capability-catalog.ts
    // now requires `accountId`/`revision` fields model-emission-gate.ts (out
    // of this lot's scope) does not supply yet, so EVERY entry fails
    // verifiedEntry() there regardless of connection state — proven by
    // model-emission-gate.test.mjs itself failing 11/11 of its own
    // assessment tests, none of which this lot touched. What IS exercised
    // here, at the pure binding layer this lot owns, is the exact
    // wrong-account shape: the registry resolution for Claude and Codex are
    // provider-id-scoped and never collapse into each other.
    const claudeBinding = resolveExecutorProviderBinding(claudeLaunchConfig, DEFAULT_EXECUTOR_PROVIDER_REGISTRY);
    const codexBinding = resolveExecutorProviderBinding(codexLaunchConfig, DEFAULT_EXECUTOR_PROVIDER_REGISTRY);
    assert.equal(claudeBinding.status, "bound");
    assert.equal(codexBinding.status, "bound");
    assert.equal(claudeBinding.registryProviderId, "claude-code-cli");
    assert.equal(codexBinding.registryProviderId, "codex-acp-cli");
    assert.notEqual(claudeBinding.registryProviderId, codexBinding.registryProviderId);
  });

  // ---------------------------------------------------------------------
  // approvalStillAuthorizes — the pure re-verification check run
  // immediately before the real commit. Independently testable (per its
  // own doc comment) without needing the rest of the gate — in particular
  // Cursor's assessServerEmission/ApprovedServerBinding contract, currently
  // mid-patch and failing its OWN pre-existing tests unrelated to this lot
  // (see the note above) — to resolve first. Revocation, substitution
  // ("wrong account"), and stability under concurrency are exactly the
  // three cases named by this lot's mandate.
  // ---------------------------------------------------------------------

  await t.test("approvalStillAuthorizes: an unchanged, identical re-read still authorizes", () => {
    assert.equal(approvalStillAuthorizes(baseMission, approvedRecord, approvedRecord), true);
  });

  await t.test("approvalStillAuthorizes: revocation (re-read is now rejected) refuses, even though the id is unchanged", () => {
    const revoked = { ...approvedRecord, status: "rejected" };
    assert.equal(approvalStillAuthorizes(baseMission, approvedRecord, revoked), false);
  });

  await t.test("approvalStillAuthorizes: no record at all on re-read (e.g. deleted) refuses", () => {
    assert.equal(approvalStillAuthorizes(baseMission, approvedRecord, null), false);
  });

  await t.test("approvalStillAuthorizes: expiry discovered on re-read refuses, even though status still says \"approved\"", () => {
    const nowExpired = { ...approvedRecord, expiresAt: "2020-01-01T00:00:00.000Z" };
    assert.equal(approvalStillAuthorizes(baseMission, approvedRecord, nowExpired), false);
  });

  await t.test("approvalStillAuthorizes: wrong account — a DIFFERENT record that still says \"approved\" is never accepted as the one originally authorized", () => {
    // Same status, same mission, same scope — only identity differs: a
    // revocation immediately followed by someone else's unrelated approval,
    // or a substitution, must never read as "nothing changed".
    const substituted = { ...approvedRecord, id: "rec-2", approvedBy: "someone-else" };
    assert.equal(approvalStillAuthorizes(baseMission, approvedRecord, substituted), false);
  });

  await t.test("approvalStillAuthorizes: concurrency — two reads of the SAME stable record both still authorize (no gate-level lock needed)", () => {
    // Mirrors what two "simultaneous" confirms actually rely on: when
    // nothing changed between the decision and the commit, re-verification
    // must not itself become a spurious refusal. Real serialization is the
    // launch service's own compareAndSwap (openhands-launch-store.ts), not
    // this check — this proves the check does not get in its way.
    const firstRead = { ...approvedRecord };
    const secondRead = { ...approvedRecord };
    assert.equal(approvalStillAuthorizes(baseMission, firstRead, secondRead), true);
  });

  await t.test("the approval AND account re-checks are not reached at all when the gate already blocked on account identity", async () => {
    // Regression guard: both re-checks must sit strictly AFTER the existing
    // gate decision (account identity included), never run speculatively
    // ahead of a refusal that was already going to happen for an unrelated
    // reason.
    const spy = makeRealLaunchSpy();
    let approvalCalls = 0;
    const gated = createGatedOpenHandsLaunch({
      launch: spy.fn,
      loadMission: async () => baseMission,
      loadApprovalRecord: async () => { approvalCalls += 1; return approvedRecord; },
      loadLaunchConfig: () => claudeLaunchConfig,
      // No connectionProbe supplied: the real default never attests an
      // account (no runner host deployed), so the gate blocks on account
      // identity before any re-check — including the approval re-check —
      // would matter.
      now: () => FIXED_NOW_MS,
    });
    const result = await gated(CONTEXT, MISSION_ID, CONFIRMATION);
    assertAccountUnverifiable(result);
    assert.equal(approvalCalls, 1, "only the first (decision) read happens — the gate never reaches either re-check once already blocked");
    assert.equal(spy.callCount(), 0);
  });

  // ---------------------------------------------------------------------
  // Account identity — the correction itself. The bug caught in
  // independent review: providerProfile.id (a POLICY identity) was used as
  // accountId. A profile does not identify the connected account; this
  // section proves the fix, not merely restates the pure function's own
  // isolated tests below.
  // ---------------------------------------------------------------------

  await t.test("a probe without an attested identity never falls back to providerProfile.id — explicit refusal, not a profile proxy", async () => {
    const spy = makeRealLaunchSpy();
    // Connected, but the probe attests NOTHING about which account — this
    // is runner-executor-connection-probe.ts's own honest real-world shape
    // today, reproduced here explicitly rather than only via the default.
    const noIdentity = countingProbe({ connectionState: "connected", source: "cli-subscription-login", evidence: ["illustrative"] });
    const gated = createGatedOpenHandsLaunch({
      launch: spy.fn,
      loadMission: async () => baseMission,
      loadApprovalRecord: async () => approvedRecord,
      loadLaunchConfig: () => claudeLaunchConfig,
      connectionProbe: noIdentity.fn,
      now: () => FIXED_NOW_MS,
    });
    const result = await gated(CONTEXT, MISSION_ID, CONFIRMATION);
    assertAccountUnverifiable(result);
    assert.equal(spy.callCount(), 0);
    // The decisive proof the bug is fixed: the profile id "claude-default"
    // is a real, available string right here, yet never satisfies the
    // check — if it had, this would be "claimed", not a refusal.
    assert.equal(claudeLaunchConfig.providerProfile.id, "claude-default");
  });

  await t.test("account change under the SAME profile, discovered right before commit: refused, launch never called", async () => {
    // The profile/workspace/model never change here — only the account the
    // probe attests to, between the decision read and the commit-time
    // re-probe. This is exactly what using providerProfile.id as accountId
    // could never detect (the profile id is static); the real attestation
    // catches it.
    const spy = makeRealLaunchSpy();
    let call = 0;
    // Each discovery round probes every registered provider in order
    // (claude-code-cli first) — call 1 is the decision round's claude
    // entry, call 3 is the commit-time recheck round's claude entry.
    const switchingProbe = async () => {
      call += 1;
      return connectedWithAccount(call === 1 ? ACCOUNT_ID : "acct-swapped");
    };
    const gated = createGatedOpenHandsLaunch({
      launch: spy.fn,
      loadMission: async () => baseMission,
      loadApprovalRecord: async () => approvedRecord,
      loadLaunchConfig: () => claudeLaunchConfig,
      connectionProbe: switchingProbe,
      now: () => FIXED_NOW_MS,
    });
    const result = await gated(CONTEXT, MISSION_ID, CONFIRMATION);
    assert.deepEqual(result, { status: "account_identity_changed_before_commit", externalEffectAllowed: false });
    assert.equal(spy.callCount(), 0, "a swapped account discovered right before commit must still stop the real launch");
  });

  await t.test("account revocation (disconnected) discovered right before commit: refused, launch never called", async () => {
    // Same account id both times, but the SECOND probe read shows the
    // connection itself is gone — isExecutionReady must still catch this,
    // not just accountId equality.
    const spy = makeRealLaunchSpy();
    let call = 0;
    const revoking = { fn: async () => {
      call += 1;
      return call === 1
        ? connectedWithAccount()
        : { connectionState: "connection_required", source: "cli-subscription-login", accountId: ACCOUNT_ID, requiredAction: "log in again", evidence: [] };
    } };
    const gated = createGatedOpenHandsLaunch({
      launch: spy.fn,
      loadMission: async () => baseMission,
      loadApprovalRecord: async () => approvedRecord,
      loadLaunchConfig: () => claudeLaunchConfig,
      connectionProbe: revoking.fn,
      now: () => FIXED_NOW_MS,
    });
    const result = await gated(CONTEXT, MISSION_ID, CONFIRMATION);
    assert.deepEqual(result, { status: "account_identity_changed_before_commit", externalEffectAllowed: false });
    assert.equal(spy.callCount(), 0);
  });

  // "Attestation périmée" (stale attestation): NOT re-tested here as its
  // own launch-gate scenario, deliberately. This gate always re-discovers
  // with a freshly-captured now() for both the entry's checkedAtIso and the
  // assessment's nowMs within one call — the two can never diverge inside a
  // single decision, so a stale DECISION-time read is structurally
  // impossible here, by construction, not by a staleness check that could
  // be bypassed. The staleness check itself already exists and is already
  // proven (model-emission-gate.test.mjs: "a stale INDIVIDUAL provider
  // entry is blocked even while the snapshot-level timestamp looks fresh"),
  // reused unmodified via the exact same connectionEntry.checkedAtIso this
  // gate stamps onto the capability it asks evaluateModelEmissionGate
  // about — no second staleness mechanism is invented here.

  await t.test("two simultaneous confirms with a stable, unchanged attested account: both clear the gate; the real launch's own CAS serializes them", async () => {
    const spy = makeRealLaunchSpy({ status: "claimed", externalEffectAllowed: false });
    const connected = countingProbe(connectedWithAccount());
    const gated = createGatedOpenHandsLaunch({
      launch: spy.fn,
      loadMission: async () => baseMission,
      loadApprovalRecord: async () => approvedRecord,
      loadLaunchConfig: () => claudeLaunchConfig,
      connectionProbe: connected.fn,
      now: () => FIXED_NOW_MS,
    });
    const [first, second] = await Promise.all([
      gated(CONTEXT, MISSION_ID, CONFIRMATION),
      gated(CONTEXT, MISSION_ID, CONFIRMATION),
    ]);
    assert.equal(first.status, "claimed");
    assert.equal(second.status, "claimed");
    assert.equal(spy.callCount(), 2, "the gate itself must not silently drop a concurrent confirm — serialization is the real CAS's job, not this gate's");
  });

  await t.test("FIXTURE PROOF (not runtime proof), CORRECTED: the REAL probe classifier, fed a fixture SSH answer with a real-shaped orgId, still refuses — org identity alone can never authorize a launch", async () => {
    // Wires the actual production code path — createRunnerClaudeCliConnectionProbe
    // -> classifyClaudeCodeProbe -> this gate's account check -> deps.launch
    // — through every real function involved. The ONLY injected part is the
    // SSH transport itself (no real runner host exists to SSH into),
    // returning a FIXTURE answer shaped like a real `claude auth status
    // --json` response, orgId included. An earlier version of this test
    // asserted this authorizes a launch (treating the hashed orgId as
    // accountId) — that was exactly the scope bug caught in independent
    // review: an organization identifier, however it is encoded, never
    // proves user identity. Corrected expectation: even a fully realistic,
    // logged-in, org-bearing response must still refuse
    // (account_identity_unverifiable) — this proves the MECHANISM now
    // refuses correctly, not that a real account was ever observed. This
    // response still carries no `email` (the field the real opaque
    // attestation below is keyed on), and no workspace is bound either, so
    // the newer email-based attestation path (see the next two tests) never
    // changes this outcome.
    const spy = makeRealLaunchSpy({ status: "claimed", externalEffectAllowed: false });
    const fixtureSshRunner = async (remoteCommand) => {
      if (remoteCommand === RUNNER_CLAUDE_VERSION_COMMAND) {
        return { kind: "completed", exitCode: 0, stdout: "2.1.261 (Claude Code)", stderr: "" };
      }
      if (remoteCommand === RUNNER_CLAUDE_AUTH_STATUS_COMMAND) {
        return {
          kind: "completed", exitCode: 0,
          stdout: JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", orgId: "fixture-org-id-placeholder", subscriptionType: "pro" }),
          stderr: "",
        };
      }
      return { kind: "spawn_error", message: "unexpected command in fixture" };
    };
    const realProbeOverFixtureTransport = createRunnerClaudeCliConnectionProbe(fixtureSshRunner);
    const gated = createGatedOpenHandsLaunch({
      launch: spy.fn,
      loadMission: async () => baseMission,
      loadApprovalRecord: async () => approvedRecord,
      loadLaunchConfig: () => claudeLaunchConfig,
      connectionProbe: realProbeOverFixtureTransport,
      now: () => FIXED_NOW_MS,
    });
    const result = await gated(CONTEXT, MISSION_ID, CONFIRMATION);
    assertAccountUnverifiable(result);
    assert.equal(spy.callCount(), 0);
  });

  await t.test("FIXTURE PROOF: two DIFFERENT users under the SAME organization, NO workspace bound at construction, end-to-end — neither is authorized, neither is conflated with the other", async () => {
    // Mandatory scenario from the independent review: if accountId were
    // ever (re-)derived from an organization-level field, two different
    // people sharing one org would attest identically and either could
    // silently authorize the other's launch. With no workspace bound at
    // construction (the probe never attempts the opaque-identity lookup at
    // all — see runner-executor-connection-probe.ts), both still honestly
    // refuse on account_identity_unverifiable — same org, same profile,
    // different (never-attested) people. The next test shows the SAME
    // scenario with a workspace bound, where both are now authorized on
    // their own distinct, non-conflated identity instead.
    const sshRunnerFor = (email) => async (remoteCommand) => {
      if (remoteCommand === RUNNER_CLAUDE_VERSION_COMMAND) {
        return { kind: "completed", exitCode: 0, stdout: "2.1.261 (Claude Code)", stderr: "" };
      }
      if (remoteCommand === RUNNER_CLAUDE_AUTH_STATUS_COMMAND) {
        return {
          kind: "completed", exitCode: 0,
          stdout: JSON.stringify({ loggedIn: true, authMethod: "claude.ai", email, orgId: "fixture-org-id-placeholder", orgName: "Shared Org", subscriptionType: "pro" }),
          stderr: "",
        };
      }
      return { kind: "spawn_error", message: "unexpected command in fixture" };
    };
    for (const email of ["alice@example.com", "bob@example.com"]) {
      const spy = makeRealLaunchSpy({ status: "claimed", externalEffectAllowed: false });
      const gated = createGatedOpenHandsLaunch({
        launch: spy.fn,
        loadMission: async () => baseMission,
        loadApprovalRecord: async () => approvedRecord,
        loadLaunchConfig: () => claudeLaunchConfig,
        connectionProbe: createRunnerClaudeCliConnectionProbe(sshRunnerFor(email)),
        now: () => FIXED_NOW_MS,
      });
      const result = await gated(CONTEXT, MISSION_ID, CONFIRMATION);
      assertAccountUnverifiable(result);
      assert.equal(spy.callCount(), 0);
    }
  });

  await t.test("FIXTURE PROOF, workspace bound (what createDefaultConnectionProbe does for real): two DIFFERENT users under the SAME organization are each authorized on their OWN distinct opaque account identity — never conflated", async () => {
    // Closes the exact gap the two tests above intentionally leave open.
    // Still wires the actual production code path end to end
    // (createRunnerClaudeCliConnectionProbe -> classifyClaudeCodeProbe ->
    // account-identity-repository's real resolveOpaqueAccountId -> this
    // gate's account check -> deps.launch); the only injected part is the
    // SSH transport. With the runner-shaped auth response carrying a real
    // `email` and subscriptionType, plus a workspace bound at construction — the one piece
    // createDefaultConnectionProbe supplies automatically from the
    // confirming call's own context.workspaceId — a genuinely attested,
    // per-user, server-persisted identity now exists. A shared
    // org/profile/workspace therefore no longer blocks every launch, while
    // the two people are still never conflated with each other: each gets
    // launched on their OWN account id, and the two ids differ.
    const sshRunnerFor = (email) => async (remoteCommand) => {
      if (remoteCommand === RUNNER_CLAUDE_VERSION_COMMAND) {
        return { kind: "completed", exitCode: 0, stdout: "2.1.261 (Claude Code)", stderr: "" };
      }
      if (remoteCommand === RUNNER_CLAUDE_AUTH_STATUS_COMMAND) {
        return {
          kind: "completed", exitCode: 0,
          stdout: JSON.stringify({ loggedIn: true, authMethod: "claude.ai", email, orgId: "fixture-org-id-placeholder", orgName: "Shared Org", subscriptionType: "pro" }),
          stderr: "",
        };
      }
      return { kind: "spawn_error", message: "unexpected command in fixture" };
    };
    const attestedAccountIds = {};
    for (const email of ["alice-gate@example.com", "bob-gate@example.com"]) {
      const spy = makeRealLaunchSpy({ status: "claimed", externalEffectAllowed: false });
      const baseProbe = createRunnerClaudeCliConnectionProbe(sshRunnerFor(email), { workspaceId: CONTEXT.workspaceId });
      const recordingProbe = async (provider, adapters) => {
        const outcome = await baseProbe(provider, adapters);
        // Only the claude-code-cli call carries this scenario's identity;
        // the registry's codex-acp-cli entry is probed too (every
        // provider is), but it never attests anything here and must never
        // overwrite the value this assertion cares about.
        if (provider.id === "claude-code-cli") attestedAccountIds[email] = outcome.accountId;
        return outcome;
      };
      await recordingProbe(DEFAULT_EXECUTOR_PROVIDER_REGISTRY.getProvider("claude-code-cli"), DEFAULT_EXECUTOR_PROVIDER_REGISTRY.listAdaptersForProvider("claude-code-cli"));
      const personalApproval = { ...approvedRecord, binding: { ...approvedRecord.binding,
        access: { ...approvedRecord.binding.access, accountId: attestedAccountIds[email] } } };
      const gated = createGatedOpenHandsLaunch({
        launch: spy.fn,
        loadMission: async () => baseMission,
        loadApprovalRecord: async () => personalApproval,
        loadLaunchConfig: () => claudeLaunchConfig,
        connectionProbe: recordingProbe,
        now: () => FIXED_NOW_MS,
      });
      const result = await gated(CONTEXT, MISSION_ID, CONFIRMATION);
      assert.equal(result.status, "claimed", `user ${email} must now be authorized on their own attested identity`);
      assert.equal(spy.callCount(), 1);
      assert.match(attestedAccountIds[email], /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    }
    assert.notEqual(
      attestedAccountIds["alice-gate@example.com"],
      attestedAccountIds["bob-gate@example.com"],
      "two different people sharing an org must never attest the same opaque account",
    );
  });

  // ---------------------------------------------------------------------
  // attestedAccountStillMatches — the pure re-verification check, same
  // doctrine as approvalStillAuthorizes: independently testable without
  // needing Cursor's contract or the rest of the gate to resolve first.
  // ---------------------------------------------------------------------

  const readyEntry = (accountId) => ({ accountId, connectionState: "connected", source: "cli-subscription-login" });

  await t.test("attestedAccountStillMatches: an unchanged, still-ready re-read still matches", () => {
    assert.equal(attestedAccountStillMatches(ACCOUNT_ID, readyEntry(ACCOUNT_ID)), true);
  });

  await t.test("attestedAccountStillMatches: no recheck entry at all (e.g. provider dropped from the snapshot) refuses", () => {
    assert.equal(attestedAccountStillMatches(ACCOUNT_ID, null), false);
  });

  await t.test("attestedAccountStillMatches: no accountId at all on the recheck refuses, even though connected", () => {
    assert.equal(attestedAccountStillMatches(ACCOUNT_ID, { connectionState: "connected", source: "cli-subscription-login" }), false);
  });

  await t.test("attestedAccountStillMatches: a DIFFERENT attested account refuses — the exact 'account change under the same profile' case", () => {
    assert.equal(attestedAccountStillMatches(ACCOUNT_ID, readyEntry("someone-elses-account")), false);
  });

  await t.test("attestedAccountStillMatches: same account id but no longer execution-ready (disconnected) refuses", () => {
    assert.equal(attestedAccountStillMatches(ACCOUNT_ID, { accountId: ACCOUNT_ID, connectionState: "connection_required", source: "cli-subscription-login" }), false);
  });

  await t.test("attestedAccountStillMatches: same account id but only declared-capability evidence (never execution-ready) refuses", () => {
    assert.equal(attestedAccountStillMatches(ACCOUNT_ID, { accountId: ACCOUNT_ID, connectionState: "connected", source: "declared-capability" }), false);
  });

  await t.test("attestedAccountStillMatches: concurrency — two reads of the SAME stable attestation both still match (no gate-level lock needed)", () => {
    assert.equal(attestedAccountStillMatches(ACCOUNT_ID, readyEntry(ACCOUNT_ID)), true);
    assert.equal(attestedAccountStillMatches(ACCOUNT_ID, readyEntry(ACCOUNT_ID)), true);
  });
});
