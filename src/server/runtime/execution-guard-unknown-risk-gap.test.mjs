#!/usr/bin/env node
// GAP (red on purpose) — Architecte ruling (4): the legacy risk switch
// (execution-guard.ts ledgerEventsForRisk, `case "unknown": default:` ~l.208)
// and canPrepareExecution treat an UNKNOWN risk class as harmless: planning
// mode only blocks "effectful"/"external", so a skill whose sideEffects the
// classifier does not recognise is ALLOWED with a single "decision" ledger
// event. Fail-closed (R-RISK-ROUND-UP) requires it to be refused.
// The test flips one seed skill's sideEffects IN MEMORY (no seed/prod file
// changed) and restores it afterwards.
// SIMULATED: pure guard, in-memory catalog, no network.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(projectRoot, "src"), "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs") },
});
const guard = await jiti.import("@/server/runtime/execution-guard");
const { skillsCatalog } = await jiti.import("@/features/skills/seed");
const { agentRegistry } = await jiti.import("@/features/agents/seed");

function withUnknownRiskSkill(fn) {
  // Temporarily give a real, agent-assigned read-only seed skill an
  // unrecognised sideEffects value (in memory only), so the ONLY change is
  // the risk class; restored in finally.
  const skill = skillsCatalog.find((s) => s.assignedRoles.length > 0 && s.sideEffects === "none"
    && agentRegistry.some((a) => a.skillIds.includes(s.id)));
  assert.ok(skill, "need an agent-assigned read-only seed skill");
  const agent = agentRegistry.find((a) => a.skillIds.includes(skill.id));
  const saved = skill.sideEffects;
  try {
    assert.equal(guard.canPrepareExecution({ skillId: skill.id, agentId: agent.id, requestedMode: "dry-run", autonomyLevel: 1 }).allowed, true,
      "control: the untouched read-only skill is allowed");
    skill.sideEffects = "teleport";
    assert.equal(guard.classifyExecutionRisk(skill), "unknown");
    return fn({ skill, agent });
  } finally { skill.sideEffects = saved; }
}

test("unknown risk class is refused in dry-run (fail-closed), not allowed", () => {
  withUnknownRiskSkill(({ skill, agent }) => {
    const d = guard.canPrepareExecution({ skillId: skill.id, agentId: agent.id, requestedMode: "dry-run", autonomyLevel: 1 });
    assert.equal(d.allowed, false, JSON.stringify(d));
    assert.notEqual(d.reasonCode, "unauthorized_action", "must be refused for its risk, not for an unrelated reason");
  });
});

test("unknown risk class never yields a plan that would proceed with a single 'decision' ledger event", () => {
  withUnknownRiskSkill(({ skill, agent }) => {
    const plan = guard.buildDryRunExecutionPlan({ skillId: skill.id, agentId: agent.id, requestedMode: "dry-run", autonomyLevel: 1 });
    assert.equal(plan.decision?.allowed ?? plan.allowed, false, JSON.stringify(plan.decision ?? plan).slice(0, 300));
  });
});
