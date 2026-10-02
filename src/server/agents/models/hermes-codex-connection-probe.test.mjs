#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");

test("Hermes/Codex connection probe tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const {
    classifyHermesOpenAiCodexAuthStatus,
    resolveSshProbeEnvironment,
    createHermesCodexConnectionProbe,
    composeProviderConnectionProbes,
    HERMES_CODEX_PROBE_APPROVAL,
  } = await jiti.import(path.join(__dirname, "hermes-codex-connection-probe.ts"));
  const { resolveProviderConnectionDiscovery, isExecutionReady } = await jiti.import(
    path.join(__dirname, "provider-connection-discovery.ts"),
  );

  await t.test("the exact real output observed on the VPS (2026-10-02) classifies as connected, cli-subscription-login", () => {
    // Captured verbatim via: ssh -i $ORIA_HERMES_SSH_IDENTITY_FILE root@2.24.118.156
    //   "docker exec hermes-agent-cmho-hermes-agent-1 \
    //      /opt/hermes/.venv/bin/python -m hermes_cli.main auth status openai-codex"
    // Output: "openai-codex: logged in" — no secret value, exit 0.
    const outcome = classifyHermesOpenAiCodexAuthStatus({
      kind: "completed",
      exitCode: 0,
      stdout: "openai-codex: logged in\n",
      stderr: "",
    });
    assert.deepEqual(outcome, {
      connectionState: "connected",
      source: "cli-subscription-login",
      evidence: ["hermes_cli auth status openai-codex -> openai-codex: logged in"],
    });
    assert.equal(isExecutionReady(outcome), true, "cli-subscription-login must be execution-ready, unlike declared-capability");
  });

  await t.test('"logged in" alone never becomes source "declared-capability"', () => {
    const outcome = classifyHermesOpenAiCodexAuthStatus({ kind: "completed", exitCode: 0, stdout: "openai-codex: logged in", stderr: "" });
    assert.notEqual(outcome.source, "declared-capability");
  });

  await t.test("not logged in classifies as connection_required with an operator-facing required action", () => {
    const outcome = classifyHermesOpenAiCodexAuthStatus({ kind: "completed", exitCode: 0, stdout: "openai-codex: not logged in", stderr: "" });
    assert.equal(outcome.connectionState, "connection_required");
    assert.ok(outcome.requiredAction.includes("login"));
  });

  await t.test("timeout, spawn error, and rejection all become unknown — never a guessed connection_required", () => {
    for (const outcome of [
      { kind: "timeout", timeoutMs: 15000 },
      { kind: "spawn_error", message: "ENOENT" },
      { kind: "rejected", reason: "not approved" },
    ]) {
      const classified = classifyHermesOpenAiCodexAuthStatus(outcome);
      assert.equal(classified.connectionState, "unknown");
    }
  });

  await t.test("unexpected / malformed stdout classifies as unknown, not a false positive", () => {
    const outcome = classifyHermesOpenAiCodexAuthStatus({ kind: "completed", exitCode: 0, stdout: "some unrelated banner text", stderr: "" });
    assert.equal(outcome.connectionState, "unknown");
  });

  await t.test("a non-zero exit is never read as logged in, even if stdout happens to contain the phrase", () => {
    const outcome = classifyHermesOpenAiCodexAuthStatus({ kind: "completed", exitCode: 1, stdout: "openai-codex: logged in", stderr: "" });
    assert.notEqual(outcome.connectionState, "connected");
  });

  await t.test("environment gate: cloud markers always refuse, even with production unset", () => {
    assert.equal(resolveSshProbeEnvironment({ VERCEL: "1" }).allowed, false);
    assert.equal(resolveSshProbeEnvironment({ AWS_LAMBDA_FUNCTION_NAME: "fn" }).allowed, false);
  });

  await t.test("environment gate: production requires the explicit opt-in flag", () => {
    assert.equal(resolveSshProbeEnvironment({ NODE_ENV: "production" }).allowed, false);
    assert.equal(resolveSshProbeEnvironment({ NODE_ENV: "production", ORIA_ENABLE_HERMES_SSH_PROBE: "1" }).allowed, true);
  });

  await t.test("environment gate: a non-production operator shell is sanctioned by default", () => {
    assert.equal(resolveSshProbeEnvironment({}).allowed, true);
  });

  await t.test("the probe honestly abstains on a provider it does not cover, instead of claiming knowledge", async () => {
    const probe = createHermesCodexConnectionProbe(async () => ({
      kind: "completed",
      exitCode: 0,
      stdout: "openai-codex: logged in",
      stderr: "",
    }));
    const outcome = await probe({ id: "openrouter", label: "OpenRouter", kind: "router", trustLevel: "allowlisted", supportsMcp: false, supportsToolUse: true }, []);
    assert.equal(outcome.connectionState, "unknown");
    assert.equal(outcome.source, "declared-capability");
    assert.ok(outcome.requiredAction.startsWith("this probe only checks"));
  });

  await t.test("end-to-end with the real captured evidence: discovery resolves openai-codex as connected and execution-ready", async () => {
    const realRunner = async () => ({ kind: "completed", exitCode: 0, stdout: "openai-codex: logged in\n", stderr: "" });
    const probe = createHermesCodexConnectionProbe(realRunner);

    const { createStaticProviderRegistry } = await jiti.import(path.join(__dirname, "provider-registry-contract.ts"));
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

    const discovery = await resolveProviderConnectionDiscovery(registryResult.registry, {
      workspaceId: "workspace-a",
      requestingWorkspaceId: "workspace-a",
      probe,
    });
    assert.equal(discovery.status, "ok");
    const entry = discovery.snapshot.entries.find((e) => e.providerId === "openai-codex");
    assert.equal(entry.connectionState, "connected");
    assert.equal(entry.source, "cli-subscription-login");
    assert.equal(isExecutionReady(entry), true);
  });

  await t.test("composeProviderConnectionProbes falls through to the next probe on an honest abstention", async () => {
    const abstaining = createHermesCodexConnectionProbe(async () => ({ kind: "completed", exitCode: 0, stdout: "openai-codex: logged in", stderr: "" }));
    const fallback = async (provider) =>
      provider.id === "openrouter"
        ? { connectionState: "connected", source: "env-key-presence", evidence: ["OPENROUTER_API_KEY present"] }
        : { connectionState: "unknown", source: "declared-capability", requiredAction: "no probe", evidence: [] };
    const composed = composeProviderConnectionProbes([abstaining, fallback]);

    const codexOutcome = await composed({ id: "openai-codex", label: "x", kind: "api", trustLevel: "reviewed", supportsMcp: false, supportsToolUse: true }, []);
    assert.equal(codexOutcome.connectionState, "connected");
    assert.equal(codexOutcome.source, "cli-subscription-login");

    const openRouterOutcome = await composed({ id: "openrouter", label: "x", kind: "router", trustLevel: "allowlisted", supportsMcp: false, supportsToolUse: true }, []);
    assert.equal(openRouterOutcome.connectionState, "connected");
    assert.equal(openRouterOutcome.source, "env-key-presence");
  });

  await t.test("approval reference sanity: HERMES_CODEX_PROBE_APPROVAL names the exact scope it was given, not a blanket grant", () => {
    assert.equal(HERMES_CODEX_PROBE_APPROVAL.status, "approved");
    assert.ok(HERMES_CODEX_PROBE_APPROVAL.approvalReference.includes("no paid API spend"));
  });
});
