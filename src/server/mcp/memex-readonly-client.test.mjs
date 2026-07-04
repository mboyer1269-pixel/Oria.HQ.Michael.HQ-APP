#!/usr/bin/env node

// Memex Read-Only Client v1 — handshake gate + read-only corridor.
// Design: docs/MEMEX_READONLY_CONTEXT_SOURCE_V1.md

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Memex Read-Only Client v1", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "memex-readonly-client.ts"));
  const bridge = await jiti.import(path.join(__dirname, "memex-bridge-contract.ts"));
  const evidence = await jiti.import(
    path.join(projectRoot, "src/server/agents/evidence/memory-evidence-pack.ts"),
  );

  const {
    resolveMemexExecutionEnvironment,
    isMemexReadToolPermitted,
    validateMemexToolDiscovery,
    runMemexHandshake,
    callMemexReadTool,
    buildMemexContextInjection,
    defaultMemexBridgePolicy,
    workspaceIdToMemexNamespace,
    MEMEX_CORE_ROOT_ENV_VAR,
    MEMEX_READONLY_OPT_IN_ENV_VAR,
  } = mod;

  const { MEMEX_V1_READ_ALLOWLIST, MEMEX_V1_FORBIDDEN_TOOLS, applyMemexRoutingHint } = bridge;
  const { validateMemoryEvidencePack, applyMemoryRoutingHint } = evidence;

  const NOW = "2026-07-03T21:00:00.000Z";
  const namespace = "michael.oria";
  const policy = defaultMemexBridgePolicy(namespace);

  const fakeTransport = (overrides = {}) => ({
    listTools: async () => [...MEMEX_V1_READ_ALLOWLIST],
    callTool: async (_name, _args) => "Brief SOP du matin — docs/MASTER_BRIEF.md",
    close: async () => {},
    ...overrides,
  });

  await t.test("4. only read-only tools are allowlisted for calls", () => {
    for (const tool of MEMEX_V1_READ_ALLOWLIST) {
      assert.equal(isMemexReadToolPermitted(tool), true, tool);
    }
    for (const tool of MEMEX_V1_FORBIDDEN_TOOLS) {
      assert.equal(isMemexReadToolPermitted(tool), false, tool);
    }
  });

  await t.test("5. wildcard tools are rejected", () => {
    assert.equal(isMemexReadToolPermitted("agentmemory_*"), false);
    const discovery = validateMemexToolDiscovery(["agentmemory_*", "agentmemory_librarian_brief"]);
    assert.equal(discovery.ok, false);
    assert.ok(discovery.errors.some((e) => e.includes("wildcard")));
  });

  await t.test("6. write/propose/consolidate/delete tools are rejected", async () => {
    const forbiddenNames = [
      "agentmemory_submit_proposal",
      "agentmemory_write_vault_file",
      "agentmemory_consolidate_memories",
      "agentmemory_delete_memory",
      "agentmemory_deprecate_memory",
    ];
    for (const tool of forbiddenNames) {
      assert.equal(isMemexReadToolPermitted(tool), false);
      const call = await callMemexReadTool(fakeTransport(), tool, {}, policy);
      assert.equal(call.ok, false);
    }
  });

  await t.test("handshake discovers allowlisted read tools", async () => {
    const result = await runMemexHandshake(fakeTransport(), policy);
    assert.equal(result.ok, true);
    assert.ok(result.allowedTools.includes("agentmemory_librarian_brief"));
  });

  await t.test("2. handshake timeout fails closed", async () => {
    const slow = fakeTransport({
      listTools: () => new Promise(() => {}),
    });
    const result = await runMemexHandshake(slow, policy, { timeoutMs: 50 });
    assert.equal(result.ok, false);
    assert.ok(result.reason.includes("timed out"));
  });

  await t.test("3. bad MCP output fails closed on call", async () => {
    const bad = fakeTransport({
      callTool: async () => ({ not: "text" }),
    });
    const call = await callMemexReadTool(
      bad,
      "agentmemory_librarian_brief",
      { namespace },
      policy,
    );
    assert.equal(call.ok, false);
  });

  await t.test("7. Memory Evidence Pack produced on successful injection", () => {
    const injection = buildMemexContextInjection(
      "existing vault context",
      "Le brief SOP du matin.",
      policy,
      NOW,
      0,
    );
    assert.ok(injection);
    assert.deepEqual(validateMemoryEvidencePack(injection.evidencePack), { ok: true });
    assert.equal(injection.evidencePack.source, "memex");
    assert.equal(injection.evidencePack.oriaAuthority, true);
  });

  await t.test("8. provenance is required — empty brief yields no pack", () => {
    const injection = buildMemexContextInjection("existing", "   ", policy, NOW, 0);
    assert.equal(injection, null);
  });

  await t.test("10. context budget enforced", () => {
    const huge = "x".repeat(policy.maxContextChars + 500);
    const injection = buildMemexContextInjection("existing", huge, policy, NOW, 0);
    assert.equal(injection, null);
  });

  await t.test("11. memory routing hints cannot override Oria model policy", () => {
    const decision = { modelId: "oria-base", decidedBy: "oria_model_policy" };
    const hinted = applyMemexRoutingHint(decision, {
      suggestedModelId: "premium-model",
      estimatedCostTier: "high",
      localRuntimeAvailable: true,
    });
    assert.deepEqual(hinted, decision);
    const memoryHinted = applyMemoryRoutingHint(decision, {
      suggestedModelId: "premium-model",
      estimatedCostTier: "high",
      localRuntimeAvailable: true,
    });
    assert.deepEqual(memoryHinted, decision);
  });

  await t.test("12. cloud mode never spawns local Memex by default", () => {
    const cloud = resolveMemexExecutionEnvironment({
      VERCEL: "1",
      [MEMEX_CORE_ROOT_ENV_VAR]: "/tmp/memex-core",
    });
    assert.equal(cloud.spawnAllowed, false);
    assert.equal(cloud.kind, "cloud");
  });

  await t.test("13. no secrets required — unconfigured env is unavailable not error", () => {
    const env = resolveMemexExecutionEnvironment({});
    assert.equal(env.spawnAllowed, false);
    assert.equal(env.kind, "unconfigured");
  });

  await t.test("14. Memex merge adds to existing context — does not replace vault", () => {
    const existing = "Memory Vault verified block";
    const injection = buildMemexContextInjection(existing, "Memex advisory brief.", policy, NOW, 0);
    assert.ok(injection);
    assert.ok(injection.context.includes(existing));
    assert.ok(injection.context.includes("Contexte Memex"));
  });

  await t.test("15. no writes enabled — forbidden tools fail before transport", async () => {
    let called = false;
    const transport = fakeTransport({
      callTool: async () => {
        called = true;
        return "should not run";
      },
    });
    const call = await callMemexReadTool(
      transport,
      "agentmemory_write_vault_file",
      { path: "secrets.env" },
      policy,
    );
    assert.equal(call.ok, false);
    assert.equal(called, false);
  });

  await t.test("workspace id maps to valid Memex namespace", () => {
    assert.equal(workspaceIdToMemexNamespace("michael-hq"), "michael.hq");
    assert.match(workspaceIdToMemexNamespace("550e8400-e29b-41d4-a716-446655440000"), /^w\./);
  });
});
