#!/usr/bin/env node

// Memex Read-Only Bridge contract — see docs/MEMEX_BRIDGE_REALITY_GATE.md.
//
// Pins the bridge's GOVERNANCE rules before any live connector exists:
// read-only allowlist, provenance-or-nothing, deprecated exclusion, zone
// discipline, fail-closed fallback, bounded context, and the executable
// proof that Memex routing hints can never override Oria's model policy.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Memex Read-Only Bridge contract", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "memex-bridge-contract.ts"));
  const {
    MEMEX_V1_READ_ALLOWLIST,
    MEMEX_V1_FORBIDDEN_TOOLS,
    isValidMemexNamespace,
    isSafeVaultRelativePath,
    validateMemexBridgePolicy,
    selectInjectableMemexItems,
    mergeMemexContext,
    applyMemexRoutingHint,
  } = mod;

  const NOW = "2026-07-03T04:00:00.000Z";

  const validPolicy = {
    mode: "read_only",
    toolAllowlist: ["agentmemory_context_pack", "agentmemory_librarian_brief"],
    namespace: "michael.oria",
    timeoutMs: 3000,
    maxContextChars: 4000,
    allowAgentZone: false,
    failClosed: true,
    routingAuthority: "oria",
    sentinelleRequiredForWrites: true,
    tenantExposureForbidden: true,
  };

  const item = (overrides = {}) => ({
    id: overrides.id ?? "mem-1",
    zone: "human",
    deprecated: false,
    content: "Le brief SOP du matin vit dans docs/MASTER_BRIEF.md.",
    provenance: {
      sourceTool: "agentmemory_context_pack",
      namespace: "michael.oria",
      retrievedAtIso: NOW,
      memexVersion: "0.7.0",
    },
    ...overrides,
  });

  await t.test("1. a valid read-only policy passes", () => {
    assert.deepEqual(validateMemexBridgePolicy(validPolicy), { ok: true });
  });

  await t.test("2. no write/propose/vault tool is expressible in v1", () => {
    for (const tool of MEMEX_V1_FORBIDDEN_TOOLS) {
      const result = validateMemexBridgePolicy({
        ...validPolicy,
        toolAllowlist: ["agentmemory_context_pack", tool],
      });
      assert.equal(result.ok, false, `${tool} must be rejected`);
      assert.ok(result.errors.some((e) => e.includes(tool)));
    }
    assert.ok(MEMEX_V1_FORBIDDEN_TOOLS.includes("agentmemory_submit_proposal"));
    assert.ok(MEMEX_V1_FORBIDDEN_TOOLS.includes("agentmemory_write_vault_file"));
    // The read allowlist and forbidden list never overlap.
    for (const tool of MEMEX_V1_READ_ALLOWLIST) {
      assert.ok(!MEMEX_V1_FORBIDDEN_TOOLS.includes(tool));
    }
  });

  await t.test("3. wildcard and unknown tools are rejected", () => {
    const wildcard = validateMemexBridgePolicy({ ...validPolicy, toolAllowlist: ["agentmemory_*"] });
    assert.equal(wildcard.ok, false);
    assert.ok(wildcard.errors.some((e) => e.includes("wildcard") || e.includes("not on the v1")));
    const unknown = validateMemexBridgePolicy({
      ...validPolicy,
      toolAllowlist: ["agentmemory_delete_everything"],
    });
    assert.equal(unknown.ok, false);
    const empty = validateMemexBridgePolicy({ ...validPolicy, toolAllowlist: [] });
    assert.equal(empty.ok, false);
  });

  await t.test("4. routing authority stays with Oria — untyped data too", () => {
    const hijacked = validateMemexBridgePolicy({ ...validPolicy, routingAuthority: "memex" });
    assert.equal(hijacked.ok, false);
    assert.ok(hijacked.errors.some((e) => e.includes("Oria governs")));
    const writeMode = validateMemexBridgePolicy({ ...validPolicy, mode: "read_write" });
    assert.equal(writeMode.ok, false);
    const noFailClosed = validateMemexBridgePolicy({ ...validPolicy, failClosed: false });
    assert.equal(noFailClosed.ok, false);
    const tenantExposed = validateMemexBridgePolicy({
      ...validPolicy,
      tenantExposureForbidden: false,
    });
    assert.equal(tenantExposed.ok, false);
  });

  await t.test("5. timeout and context size are bounded", () => {
    assert.equal(validateMemexBridgePolicy({ ...validPolicy, timeoutMs: 0 }).ok, false);
    assert.equal(validateMemexBridgePolicy({ ...validPolicy, timeoutMs: 120000 }).ok, false);
    assert.equal(validateMemexBridgePolicy({ ...validPolicy, maxContextChars: 0 }).ok, false);
    assert.equal(
      validateMemexBridgePolicy({ ...validPolicy, maxContextChars: 1_000_000 }).ok,
      false,
    );
  });

  await t.test("6. deprecated memories are excluded by default", () => {
    const result = selectInjectableMemexItems(
      [item(), item({ id: "mem-2", deprecated: true })],
      validPolicy,
    );
    assert.equal(result.injectable.length, 1);
    assert.equal(result.injectable[0].id, "mem-1");
    assert.ok(result.rejected.some((r) => r.id === "mem-2" && /deprecated/.test(r.reason)));
  });

  await t.test("7. zone discipline: human ok, agent gated, unknown rejected", () => {
    const items = [
      item({ id: "h1", zone: "human" }),
      item({ id: "a1", zone: "agent" }),
      item({ id: "u1", zone: "unknown" }),
      item({ id: "x1", zone: "tenant_shared" }),
    ];
    const strict = selectInjectableMemexItems(items, validPolicy);
    assert.deepEqual(strict.injectable.map((i) => i.id), ["h1"]);
    assert.ok(strict.rejected.some((r) => r.id === "a1" && /allowAgentZone/.test(r.reason)));
    assert.ok(strict.rejected.some((r) => r.id === "u1"));
    assert.ok(strict.rejected.some((r) => r.id === "x1"));
    const permissive = selectInjectableMemexItems(items, { ...validPolicy, allowAgentZone: true });
    assert.deepEqual(permissive.injectable.map((i) => i.id), ["h1", "a1"]);
  });

  await t.test("8. provenance is mandatory and namespace-scoped", () => {
    const items = [
      item({ id: "p1", provenance: null }),
      item({
        id: "p2",
        provenance: {
          sourceTool: "agentmemory_write_vault_file",
          namespace: "michael.oria",
          retrievedAtIso: NOW,
          memexVersion: null,
        },
      }),
      item({
        id: "p3",
        provenance: {
          sourceTool: "agentmemory_context_pack",
          namespace: "someone.else",
          retrievedAtIso: NOW,
          memexVersion: null,
        },
      }),
      item({
        id: "p4",
        provenance: {
          sourceTool: "agentmemory_context_pack",
          namespace: "michael.oria",
          retrievedAtIso: "not-a-date",
          memexVersion: null,
        },
      }),
      item({ id: "p5" }),
    ];
    const result = selectInjectableMemexItems(items, validPolicy);
    assert.deepEqual(result.injectable.map((i) => i.id), ["p5"]);
    for (const id of ["p1", "p2", "p4"]) {
      assert.ok(
        result.rejected.some((r) => r.id === id && /provenance/.test(r.reason)),
        `${id} must be rejected on provenance`,
      );
    }
    assert.ok(result.rejected.some((r) => r.id === "p3" && /namespace/.test(r.reason)));
  });

  await t.test("9. context size is bounded by the policy budget", () => {
    const big = "x".repeat(3000);
    const items = [
      item({ id: "b1", content: big }),
      item({ id: "b2", content: big }),
      item({ id: "b3", content: "small" }),
    ];
    const result = selectInjectableMemexItems(items, validPolicy);
    assert.deepEqual(result.injectable.map((i) => i.id), ["b1", "b3"]);
    assert.ok(result.charCount <= validPolicy.maxContextChars);
    assert.ok(result.rejected.some((r) => r.id === "b2" && /budget/.test(r.reason)));
  });

  await t.test("10. Memex unavailable = existing context unchanged, no crash", () => {
    const existing = "--- Contexte Joris existant ---";
    assert.equal(mergeMemexContext(existing, null), existing);
    const emptySelection = selectInjectableMemexItems([], validPolicy);
    assert.equal(mergeMemexContext(existing, emptySelection), existing);
    // Malformed pack degrades to rejections, not a throw.
    const malformed = selectInjectableMemexItems([null, 42, "junk"], validPolicy);
    assert.equal(malformed.injectable.length, 0);
    assert.equal(mergeMemexContext(existing, malformed), existing);
  });

  await t.test("11. injected context cites zone + provenance inline", () => {
    const selection = selectInjectableMemexItems([item()], validPolicy);
    const merged = mergeMemexContext("BASE", selection);
    assert.match(merged, /^BASE\n/);
    assert.match(merged, /\[MEMEX:human\]/);
    assert.match(merged, /agentmemory_context_pack/);
    assert.match(merged, /advisory/);
  });

  await t.test("12. a routing hint can never override Oria's decision", () => {
    const decision = { modelId: "claude-haiku-4-5", decidedBy: "oria_model_policy" };
    const aggressiveHint = {
      suggestedModelId: "totally-free-model-9000",
      estimatedCostTier: "free",
      localRuntimeAvailable: true,
    };
    assert.deepEqual(applyMemexRoutingHint(decision, aggressiveHint), decision);
    assert.deepEqual(applyMemexRoutingHint(decision, null), decision);
    // Even a hint that impersonates a decision cannot change decidedBy.
    const forged = applyMemexRoutingHint(decision, { decidedBy: "memex", modelId: "evil" });
    assert.equal(forged.decidedBy, "oria_model_policy");
    assert.equal(forged.modelId, "claude-haiku-4-5");
  });

  await t.test("13. path traversal is rejected before any vault path exists", () => {
    const bad = [
      "../secrets.env",
      "notes/../../.ssh/id_rsa",
      "/etc/passwd",
      "C:/Windows/system32",
      "C:\\Users\\micha\\.env",
      "a\\b.md",
      "a//b.md",
      "",
      "x".repeat(300),
    ];
    for (const p of bad) {
      assert.equal(isSafeVaultRelativePath(p), false, `"${p}" must be rejected`);
    }
    assert.equal(isSafeVaultRelativePath("Human/briefs/morning.md"), true);
    assert.equal(isSafeVaultRelativePath("Agent/facts/2026-07-02.md"), true);
  });

  await t.test("14. namespace validation rejects paths and globs", () => {
    assert.equal(isValidMemexNamespace("michael.oria"), true);
    assert.equal(isValidMemexNamespace("michael"), true);
    for (const bad of ["", "Michael", "../x", "a/b", "a b", "*", "a".repeat(70), 42, null]) {
      assert.equal(isValidMemexNamespace(bad), false, `"${bad}" must be rejected`);
    }
  });
});
