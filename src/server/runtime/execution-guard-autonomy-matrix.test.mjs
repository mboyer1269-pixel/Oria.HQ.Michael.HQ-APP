#!/usr/bin/env node

// src/server/runtime/execution-guard-autonomy-matrix.test.mjs
//
// PR #229 — test(runtime): execution guard autonomy matrix
//
// Adds the full 36-case autonomy matrix for canExecuteAutonomously() and proves
// the execution-guard safety invariant:
//
//   No "blocked" decision from canExecuteAutonomously() may surface as an
//   ALLOW outcome in evaluateLiveExecution(). A blocked gate stays blocked.
//
// Matrix dimensions (2 × 3 × 6 = 36):
//   agent  ∈ { known, unknown }
//   action ∈ { green (known), yellow (known), unknown }
//   level  ∈ { 0, 1, 2, 3, 4, 5 }
//
// The "known action" requirement is split into its two real sub-cases — a
// green-listed action and a yellow-listed action — because the gate routes
// them to different tiers. Together with "unknown", that is the 3rd dimension.
//
// This PR is TEST ONLY. Neither autonomy-tier.ts nor execution-guard.ts is
// modified. Expected outcomes are derived purely from the documented
// invariants in those files (see INVARIANTS block below).

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(projectRoot, "src") },
});

const autonomyPath = path.join(projectRoot, "src/server/agents/autonomy-tier.ts");
const guardPath = path.join(projectRoot, "src/server/runtime/execution-guard.ts");
const licensePath = path.join(projectRoot, "src/server/agents/agent-execution-license.ts");

const { canExecuteAutonomously } = await jiti.import(autonomyPath);
const { evaluateLiveExecution } = await jiti.import(guardPath);
const { getAgentLicense } = await jiti.import(licensePath);

// ---------------------------------------------------------------------------
// Fixtures — pinned to the live licence registry (joris).
// ---------------------------------------------------------------------------

const KNOWN_AGENT = "joris";
const UNKNOWN_AGENT = "ghost-agent-unregistered-zzz";

const GREEN_ACTION = "brief.generate"; // joris.greenActions
const YELLOW_ACTION = "mission.confirm"; // joris.yellowActions
const UNKNOWN_ACTION = "totally.unlisted.action.zzz"; // not green/yellow/hardBlocked

// A real runtime skill assigned to joris, used only to populate skillId for the
// execution-guard cross-check. Blocked decisions short-circuit before skill
// resolution, so its risk class is irrelevant to the invariant under test.
const CROSSCHECK_SKILL_ID = "brief.generate";

const LEVELS = [0, 1, 2, 3, 4, 5];
const ACTION_CLASSES = ["green", "yellow", "unknown"];
const AGENT_KINDS = ["known", "unknown"];

function actionIdFor(actionClass) {
  switch (actionClass) {
    case "green":
      return GREEN_ACTION;
    case "yellow":
      return YELLOW_ACTION;
    case "unknown":
      return UNKNOWN_ACTION;
    default:
      throw new Error(`unknown action class: ${actionClass}`);
  }
}

function agentIdFor(agentKind) {
  return agentKind === "known" ? KNOWN_AGENT : UNKNOWN_AGENT;
}

// ---------------------------------------------------------------------------
// Expected outcome, derived from the documented invariant ORDER in
// autonomy-tier.ts. The ORDER is load-bearing: the licence check (INV1) and the
// red-boundary check (INV5) both run BEFORE action-class routing, so they
// dominate when they apply.
//
//   INV1  no licence            → blocked / unauthorized_action   (before level)
//   INV5  level 0 or 5          → blocked / requested_level_blocked
//   INV6  unknown action        → blocked / unknown_action_policy
//   INV9  yellow action         → supervised / action_policy_requires_approval
//   INV8  green, level ≤ 2      → full_autonomous / allowed_by_policy
//   INV8  green, level 3–4      → supervised / action_policy_requires_approval
// ---------------------------------------------------------------------------

function expectedDecision(agentKind, actionClass, level) {
  // Unknown agent: no licence fires first, before level or action class.
  if (agentKind === "unknown") {
    return { tier: "blocked", reasonCode: "unauthorized_action" };
  }
  // Red autonomy boundary runs before action-class routing.
  if (level === 0 || level === 5) {
    return { tier: "blocked", reasonCode: "requested_level_blocked" };
  }
  // Levels 1–4, known agent.
  if (actionClass === "unknown") {
    return { tier: "blocked", reasonCode: "unknown_action_policy" };
  }
  if (actionClass === "yellow") {
    return { tier: "supervised", reasonCode: "action_policy_requires_approval" };
  }
  // green action
  if (level <= 2) {
    return { tier: "full_autonomous", reasonCode: "allowed_by_policy" };
  }
  return { tier: "supervised", reasonCode: "action_policy_requires_approval" };
}

// ---------------------------------------------------------------------------
// Registry guard — fail loudly if fixtures drift from the licence registry, so
// the matrix can never silently test the wrong thing.
// ---------------------------------------------------------------------------

test("matrix fixtures match the live licence registry", () => {
  const license = getAgentLicense(KNOWN_AGENT);
  assert.ok(license, `${KNOWN_AGENT} must have a registered licence`);
  assert.ok(
    license.greenActions.includes(GREEN_ACTION),
    `${GREEN_ACTION} must be a green action for ${KNOWN_AGENT}`,
  );
  assert.ok(
    license.yellowActions.includes(YELLOW_ACTION),
    `${YELLOW_ACTION} must be a yellow action for ${KNOWN_AGENT}`,
  );
  assert.ok(
    !license.greenActions.includes(UNKNOWN_ACTION) &&
      !license.yellowActions.includes(UNKNOWN_ACTION) &&
      !license.hardBlocks.includes(UNKNOWN_ACTION),
    `${UNKNOWN_ACTION} must be unlisted (not green, yellow, or hard-blocked)`,
  );
  assert.equal(
    getAgentLicense(UNKNOWN_AGENT),
    undefined,
    `${UNKNOWN_AGENT} must NOT have a licence (unknown-agent fixture)`,
  );
});

// ---------------------------------------------------------------------------
// Build the 36 cells.
// ---------------------------------------------------------------------------

const MATRIX = [];
for (const agentKind of AGENT_KINDS) {
  for (const actionClass of ACTION_CLASSES) {
    for (const level of LEVELS) {
      MATRIX.push({ agentKind, actionClass, level });
    }
  }
}

test("matrix covers exactly 36 cases (6 levels × 2 agents × 3 action classes)", () => {
  assert.equal(MATRIX.length, 36, "matrix must contain 36 cells");
  const keys = new Set(MATRIX.map((c) => `${c.agentKind}|${c.actionClass}|${c.level}`));
  assert.equal(keys.size, 36, "all 36 cells must be unique");
});

// ---------------------------------------------------------------------------
// 1) canExecuteAutonomously() — full 36-case matrix.
//    Verifies every (agent known/unknown) × (action known/unknown) × (level 0–5)
//    combination resolves to the documented tier + reason code.
// ---------------------------------------------------------------------------

for (const cell of MATRIX) {
  const { agentKind, actionClass, level } = cell;
  const expected = expectedDecision(agentKind, actionClass, level);

  test(`gate[${agentKind} agent | ${actionClass} action | L${level}] -> ${expected.tier}`, () => {
    const result = canExecuteAutonomously(
      agentIdFor(agentKind),
      actionIdFor(actionClass),
      level,
    );

    assert.equal(result.tier, expected.tier);
    assert.equal(result.reasonCode, expected.reasonCode);

    if (expected.tier === "blocked") {
      assert.equal(result.zone, "red");
      assert.equal(result.executionTier, "red");
      assert.deepEqual(result.clearedBy, [], "blocked decisions clear no gate");
    } else {
      assert.deepEqual(result.clearedBy, ["general"], "passing decisions clear the general gate");
    }
  });
}

// ---------------------------------------------------------------------------
// 2) SAFETY INVARIANT — no blocked gate decision becomes ALLOW in the guard.
//    For every matrix cell where canExecuteAutonomously() blocks,
//    evaluateLiveExecution() must return BLOCK (categorically never ALLOW).
// ---------------------------------------------------------------------------

const BLOCKED_CELLS = MATRIX.filter(
  (c) => expectedDecision(c.agentKind, c.actionClass, c.level).tier === "blocked",
);

test("blocked cells account for 28 of the 36 matrix cases", () => {
  // 18 unknown-agent (no licence, every level/action)
  //  + 6 known-agent red-boundary (L0/L5 × 3 action classes)
  //  + 4 known-agent unknown-action (L1–L4)
  //  = 28
  assert.equal(BLOCKED_CELLS.length, 28);
});

for (const cell of BLOCKED_CELLS) {
  const { agentKind, actionClass, level } = cell;

  test(`guard[${agentKind} agent | ${actionClass} action | L${level}] blocked gate never ALLOWs`, () => {
    const decision = evaluateLiveExecution({
      skillId: CROSSCHECK_SKILL_ID,
      actionId: actionIdFor(actionClass),
      agentId: agentIdFor(agentKind),
      requestedMode: "live",
      autonomyLevel: level,
    });

    assert.notEqual(
      decision.outcome,
      "ALLOW",
      "a blocked autonomy decision must never surface as ALLOW in the execution guard",
    );
    assert.equal(decision.outcome, "BLOCK");
    assert.equal(decision.zone, "red");
    assert.equal(decision.requiresHumanApproval, false);
  });
}
