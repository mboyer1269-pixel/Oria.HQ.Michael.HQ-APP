// src/server/agents/work-order-autonomy-envelope-response.test.mjs

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Work Order Autonomy Envelope Response Formatter tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const responseMod = await jiti.import(path.join(__dirname, "work-order-autonomy-envelope-response.ts"));
  const { formatAutonomyEnvelopeResponse } = responseMod;

  function createMockEnvelope(overrides = {}) {
    return {
      id: "env_test_001",
      workOrderId: "wo_venture_456",
      agentId: "joris",
      autonomyLevel: "delegated",
      allowedAutonomousActions: ["research", "analyze"],
      approvalRequiredActions: ["publish", "spend_money"],
      blockedActions: ["runtime_dispatch", "live_execution"],
      escalationTriggers: [
        { condition: "budget_limit", description: "Budget max atteint", severity: "warning" },
      ],
      budgetLimit: 500,
      riskThreshold: "medium",
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
      createdAt: new Date().toISOString(),
      ...overrides,
    };
  }

  await t.test("formats a complete envelope successfully", () => {
    const envelope = createMockEnvelope();
    const result = formatAutonomyEnvelopeResponse(envelope);

    assert.ok(result.includes("env_test_001"));
    assert.ok(result.includes("wo_venture_456"));
    assert.ok(result.includes("joris"));
    assert.ok(result.includes("Délégué"));
    
    assert.ok(result.includes("research"));
    assert.ok(result.includes("analyze"));
    
    assert.ok(result.includes("publish"));
    assert.ok(result.includes("spend_money"));
    
    assert.ok(result.includes("runtime_dispatch"));
    assert.ok(result.includes("live_execution"));
    
    assert.ok(result.includes("budget_limit"));
    assert.ok(result.includes("Budget max atteint"));
    
    assert.ok(result.includes("500 EUR"));
    assert.ok(result.includes("medium"));
    
    assert.ok(result.includes("Note Human-on-the-Loop"));
  });

  await t.test("handles missing fields safely without throwing", () => {
    // Partial envelope matching the minimal contract types at runtime
    const envelope = {
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
    };
    
    // Typecast to bypass TS errors in tests, we want to test runtime safety
    const result = formatAutonomyEnvelopeResponse(envelope);

    assert.ok(result.includes("(inconnu)"), "Should default missing ID to (inconnu)");
    assert.ok(result.includes("Aucune action autonome autorisée"));
    assert.ok(result.includes("Aucune action nécessitant approbation"));
    assert.ok(result.includes("Aucune action bloquée explicitement"));
    assert.ok(result.includes("Aucun déclencheur d'escalade défini"));
    assert.ok(result.includes("Aucune contrainte additionnelle"));
  });

  await t.test("formats all autonomy levels correctly", () => {
    const supervised = formatAutonomyEnvelopeResponse(createMockEnvelope({ autonomyLevel: "supervised" }));
    assert.ok(supervised.includes("Supervisé"));

    const delegated = formatAutonomyEnvelopeResponse(createMockEnvelope({ autonomyLevel: "delegated" }));
    assert.ok(delegated.includes("Délégué"));

    const dryrun = formatAutonomyEnvelopeResponse(createMockEnvelope({ autonomyLevel: "autonomous_dry_run" }));
    assert.ok(dryrun.includes("Dry-run autonome"));

    const unknown = formatAutonomyEnvelopeResponse(createMockEnvelope({ autonomyLevel: "unknown_level" }));
    assert.ok(unknown.includes("Inconnu (unknown_level)"));
  });

  await t.test("formats escalation trigger severities correctly", () => {
    const envelope = createMockEnvelope({
      escalationTriggers: [
        { condition: "minor", description: "minor issue", severity: "warning" },
        { condition: "major", description: "major issue", severity: "critical" },
      ],
    });
    
    const result = formatAutonomyEnvelopeResponse(envelope);
    assert.ok(result.includes("🟡 **minor**"));
    assert.ok(result.includes("🔴 **major**"));
  });

  await t.test("formats all constraints when present", () => {
    const envelope = createMockEnvelope({
      budgetLimit: 100,
      timeLimitMinutes: 120,
      riskThreshold: "high",
      maxToolCost: 10,
    });
    
    const result = formatAutonomyEnvelopeResponse(envelope);
    assert.ok(result.includes("Budget max : 100 EUR"));
    assert.ok(result.includes("Temps max : 120 min"));
    assert.ok(result.includes("Seuil de risque : high"));
    assert.ok(result.includes("Coût max par outil : 10 EUR"));
  });
});
