#!/usr/bin/env node
/**
 * smoke:agent-execute
 *
 * Tests the Green Lane Executor end-to-end in local mode:
 *   1. Sentinelle gate (evaluateLiveExecution)
 *   2. Skill dispatcher -- content.generate (mock or real LLM)
 *   3. AgentOutcome repository (local fallback)
 *
 * Runs without a Supabase connection or API keys.
 * With ANTHROPIC_API_KEY set, uses the real LLM.
 */

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/__server-only-noop.js"),
  },
});

const { evaluateLiveExecution } = await jiti.import(
  path.join(projectRoot, "src/server/runtime/execution-guard.ts")
);
const { dispatchSkillExecution } = await jiti.import(
  path.join(projectRoot, "src/server/runtime/skill-dispatcher.ts")
);
const { createAgentOutcome, listAgentOutcomes, __clearAgentOutcomesForTests } =
  await jiti.import(
    path.join(projectRoot, "src/server/ventures/agent-outcome-repository.ts")
  );

const WORKSPACE_ID = "michael-hq";
const USER_ID = "local-michael";
const AGENT_ID = "marketing";
const SKILL_ID = "content.generate";
const VENTURE_ID = "suivia";

console.log("[smoke:agent-execute] Starting Green Lane Executor test");
console.log(`[smoke:agent-execute] Agent: ${AGENT_ID} | Skill: ${SKILL_ID} | Venture: ${VENTURE_ID}`);

// ── 1. Sentinelle gate ────────────────────────────────────────────────────────
const sentinelle = evaluateLiveExecution({
  agentId: AGENT_ID,
  skillId: SKILL_ID,
  requestedMode: "live",
  autonomyLevel: 2,
});

console.log(`[sentinelle] outcome: ${sentinelle.outcome} | zone: ${sentinelle.zone}`);
assert.equal(sentinelle.outcome, "ALLOW", "Sentinelle should ALLOW marketing + content.generate");
assert.equal(sentinelle.zone, "green", "Zone should be green");
assert.equal(sentinelle.requiresLedger, true, "Ledger required");
assert.equal(sentinelle.requiresSentinel, true, "Sentinel required");
console.log("[sentinelle] PASS");

// ── 2. Hard-blocked action is BLOCKED ────────────────────────────────────────
const blocked = evaluateLiveExecution({
  agentId: AGENT_ID,
  skillId: "billing.modify",
  requestedMode: "live",
  autonomyLevel: 2,
});
assert.equal(blocked.outcome, "BLOCK", "billing.modify must be BLOCKED for marketing agent");
console.log("[sentinelle:hard-block] PASS");

// ── 3. Skill dispatch -- content.generate (mock path) ────────────────────────
const proposedAt = new Date().toISOString();
const dispatchResult = await dispatchSkillExecution({
  agentId: AGENT_ID,
  skillId: SKILL_ID,
  workspaceId: WORKSPACE_ID,
  input: {
    topic: "Pourquoi Suivia simplifie la comptabilite pour les PME",
    format: "post",
    tone: "professionnel et direct",
  },
});

console.log(`[dispatcher] strategy: ${dispatchResult.strategy}`);
console.log(`[dispatcher] actionRef: ${dispatchResult.actionRef}`);
assert.ok(dispatchResult.actionRef, "actionRef must be present");
assert.ok(dispatchResult.result, "result must be present");

if (dispatchResult.strategy === "builtin") {
  const draft = dispatchResult.result["draft"];
  assert.ok(draft, "Draft must be present from LLM");
  assert.equal(dispatchResult.result["internalOnly"], true, "Must be internal-only");
  console.log(`[dispatcher] LLM draft (${String(draft).length} chars):`);
  console.log("---");
  console.log(String(draft).slice(0, 200) + "...");
  console.log("---");
} else {
  console.log(`[dispatcher] Dry-run mode (no API key) -- message: ${dispatchResult.result["message"]}`);
}
console.log("[dispatcher] PASS");

// ── 4. AgentOutcome repository (local) ───────────────────────────────────────
__clearAgentOutcomesForTests();

const created = await createAgentOutcome({
  workspaceId: WORKSPACE_ID,
  createdByUserId: USER_ID,
  agentId: AGENT_ID,
  skillId: SKILL_ID,
  ventureId: VENTURE_ID,
  actionRef: dispatchResult.actionRef,
  proposedAt,
  executedAt: new Date().toISOString(),
  outcome: "pending",
  revenueCad: 0,
});

assert.ok(created.id, "Outcome record must have id");
assert.equal(created.agentId, AGENT_ID);
assert.equal(created.skillId, SKILL_ID);
assert.equal(created.outcome, "pending");
assert.equal(created.noExecutionAuthorized, true, "Safety invariant must hold");
console.log(`[outcome-repo] Created outcome: ${created.id}`);

const listed = await listAgentOutcomes(WORKSPACE_ID);
assert.equal(listed.length, 1, "Should have 1 outcome");
assert.equal(listed[0].ventureId, VENTURE_ID);
console.log("[outcome-repo] PASS");

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("");
console.log("[smoke:agent-execute] checks:");
console.log("  [ok] Sentinelle ALLOW for marketing + content.generate (green zone)");
console.log("  [ok] Sentinelle BLOCK for billing.modify (hard-blocked)");
console.log("  [ok] Skill dispatcher executed content.generate");
console.log("  [ok] AgentOutcome record created (local fallback)");
console.log("  [ok] noExecutionAuthorized invariant holds");
console.log("[smoke:agent-execute] PASS");
