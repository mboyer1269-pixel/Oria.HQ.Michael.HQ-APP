#!/usr/bin/env node

// Memory Evidence Pack v1 — see docs/AGENT_EVIDENCE_PACKS_V1.md.
//
// Pins the memory black-box rules before any live Memex connector exists:
// provenance or nothing, deprecated excluded, zone discipline, traversal
// rejection, routing hints stay advisory, memory never authorizes tools or
// touches Sentinelle/Ledger, conflicts are marked, budgets are walls, secret
// values are redacted, and v1 stays read-only.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");

test("Memory Evidence Pack v1", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "memory-evidence-pack.ts"));
  const {
    validateMemoryEvidencePack,
    applyMemoryRoutingHint,
    toolUseAuthorizationFromMemory,
    redactMemoryText,
    isSafeMemoryId,
    findForbiddenMemoryFields,
  } = mod;

  const NOW = "2026-07-03T18:00:00.000Z";
  const EARLIER = "2026-06-20T09:00:00.000Z";

  const provenanceFor = (memoryId, overrides = {}) => ({
    memoryId,
    sourceTool: "agentmemory_context_pack",
    namespace: "michael.oria",
    retrievedAtIso: NOW,
    ...overrides,
  });

  const pack = (overrides = {}) => ({
    packVersion: 1,
    source: "memex",
    sourceTool: "agentmemory_context_pack",
    namespace: "michael.oria",
    zone: "human",
    agentZonePolicyReference: null,
    memoryIds: ["mem-1", "mem-2"],
    provenance: [provenanceFor("mem-1"), provenanceFor("mem-2")],
    deprecatedExcluded: true,
    trustLevel: "verified",
    freshness: { oldestIso: EARLIER, newestIso: NOW },
    conflictPolicy: "mark_conflicts",
    conflicts: [],
    contextBudget: 4000,
    injectedCharCount: 1200,
    redactionsApplied: 0,
    routingHintAdvisoryOnly: true,
    oriaAuthority: true,
    createdAtIso: NOW,
    ...overrides,
  });

  await t.test("0. a valid pack passes", () => {
    assert.deepEqual(validateMemoryEvidencePack(pack()), { ok: true });
  });

  await t.test("1. provenance is required, both directions", () => {
    const none = validateMemoryEvidencePack(pack({ provenance: [] }));
    assert.equal(none.ok, false);
    assert.ok(none.errors.some((e) => e.includes("no injection without provenance")));

    const orphanId = validateMemoryEvidencePack(
      pack({ memoryIds: ["mem-1", "mem-2", "mem-ghost"] }),
    );
    assert.equal(orphanId.ok, false);
    assert.ok(orphanId.errors.some((e) => e.includes("mem-ghost")));

    const foreignNamespace = validateMemoryEvidencePack(
      pack({ provenance: [provenanceFor("mem-1", { namespace: "someone.else" }), provenanceFor("mem-2")] }),
    );
    assert.equal(foreignNamespace.ok, false);
  });

  await t.test("2. deprecated memories are excluded — no opt-in", () => {
    const optedIn = validateMemoryEvidencePack(pack({ deprecatedExcluded: false }));
    assert.equal(optedIn.ok, false);
    assert.ok(optedIn.errors.some((e) => e.includes("no opt-in")));
  });

  await t.test("3. unknown zones are rejected", () => {
    for (const zone of ["unknown", "cosmic", "", null]) {
      const result = validateMemoryEvidencePack(pack({ zone }));
      assert.equal(result.ok, false, `zone ${zone} must be rejected`);
    }
    assert.deepEqual(validateMemoryEvidencePack(pack({ zone: "system" })), { ok: true });
  });

  await t.test("4. the agent zone requires an explicit policy reference", () => {
    const ungated = validateMemoryEvidencePack(pack({ zone: "agent" }));
    assert.equal(ungated.ok, false);
    assert.ok(ungated.errors.some((e) => e.includes("agentZonePolicyReference")));

    const gated = validateMemoryEvidencePack(
      pack({ zone: "agent", agentZonePolicyReference: "MEMEX_BRIDGE policy allowAgentZone v1" }),
    );
    assert.deepEqual(gated, { ok: true });
  });

  await t.test("5. path traversal is rejected", () => {
    for (const bad of ["../etc/passwd", "a/../b", "/absolute", "C:evil", "a\\b", "a//b"]) {
      assert.equal(isSafeMemoryId(bad), false, `${bad} must be unsafe`);
      const result = validateMemoryEvidencePack(
        pack({ memoryIds: [bad], provenance: [provenanceFor(bad)] }),
      );
      assert.equal(result.ok, false);
    }
    assert.equal(isSafeMemoryId("skills/deploy-checklist.md"), true);
  });

  await t.test("6. a routing hint can never override an Oria decision", () => {
    const decision = { modelId: "claude-sonnet", decidedBy: "oria_model_policy" };
    const pushy = { suggestedModelId: "free-model-9000", estimatedCostTier: "free" };
    assert.deepEqual(applyMemoryRoutingHint(decision, pushy), decision);
    assert.deepEqual(applyMemoryRoutingHint(decision, null), decision);
    // The literals cannot be flipped in a valid pack.
    assert.equal(validateMemoryEvidencePack(pack({ routingHintAdvisoryOnly: false })).ok, false);
    assert.equal(validateMemoryEvidencePack(pack({ oriaAuthority: false })).ok, false);
  });

  await t.test("7. memory cannot authorize tool use", () => {
    const verdict = toolUseAuthorizationFromMemory(pack(), "calendar.book");
    assert.equal(verdict.authorized, false);
    assert.ok(verdict.reason.includes("Sentinelle"));
    // Authority-grab field names are inexpressible.
    const grab = validateMemoryEvidencePack(pack({ allowed_tools: ["calendar.book"] }));
    assert.equal(grab.ok, false);
  });

  await t.test("8. memory cannot disable Sentinelle or mutate the Ledger", () => {
    const bypass = validateMemoryEvidencePack(pack({ sentinelle_bypass: true }));
    assert.equal(bypass.ok, false);
    assert.ok(bypass.errors.some((e) => e.includes("sentinelle_bypass")));

    const ledgerGrab = validateMemoryEvidencePack(pack({ ledger_write: { event: "fake" } }));
    assert.equal(ledgerGrab.ok, false);

    assert.deepEqual(findForbiddenMemoryFields({ nested: { routing_authority: "memex" } }), [
      "nested.routing_authority",
    ]);
  });

  await t.test("9. conflicts are marked, never silently merged", () => {
    const silent = validateMemoryEvidencePack(pack({ conflictPolicy: "silent_merge" }));
    assert.equal(silent.ok, false);
    assert.ok(silent.errors.some((e) => e.includes("inexpressible")));

    const marked = validateMemoryEvidencePack(
      pack({
        conflicts: [{ memoryIds: ["mem-1", "mem-2"], reason: "SOP versions disagree on step 3" }],
      }),
    );
    assert.deepEqual(marked, { ok: true });

    const lonelyConflict = validateMemoryEvidencePack(
      pack({ conflicts: [{ memoryIds: ["mem-1"], reason: "conflict with itself?" }] }),
    );
    assert.equal(lonelyConflict.ok, false);
  });

  await t.test("10. the context budget is enforced", () => {
    const overBudget = validateMemoryEvidencePack(
      pack({ contextBudget: 1000, injectedCharCount: 1001 }),
    );
    assert.equal(overBudget.ok, false);
    assert.ok(overBudget.errors.some((e) => e.includes("wall, not a suggestion")));

    assert.equal(validateMemoryEvidencePack(pack({ contextBudget: 0 })).ok, false);
    assert.equal(validateMemoryEvidencePack(pack({ contextBudget: 999999 })).ok, false);
  });

  await t.test("11. secret-like values are redacted", () => {
    const { text, redactions } = redactMemoryText(
      "contact michael@example.com, handle amh1.eyJzdWIi.abc, Bearer xyz.123",
    );
    assert.ok(!text.includes("michael@example.com"));
    assert.ok(!text.includes("amh1."));
    assert.ok(redactions >= 3);
  });

  await t.test("12. v1 is read-only — no write/propose/consolidation source", () => {
    for (const writeShaped of ["memex_write", "propose", "consolidation", "vault_write"]) {
      const result = validateMemoryEvidencePack(pack({ source: writeShaped }));
      assert.equal(result.ok, false, `source ${writeShaped} must be rejected`);
      assert.ok(result.errors.some((e) => e.includes("read source")));
    }
  });
});
