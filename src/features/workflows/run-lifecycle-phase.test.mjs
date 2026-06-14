#!/usr/bin/env node

// Run lifecycle phase contract — see docs/HQ_RUN_GLOSSARY.md (coherence P2).
//
// Locks the single status→phase vocabulary: every status enum value maps to a
// canonical phase, the phase set stays closed, and the documented equivalences
// hold. The compile-time Record<Union, Phase> typing is the primary
// exhaustiveness guard (adding an enum value without a phase breaks typecheck);
// this runtime test pins the key sets and the semantics so an accidental
// edit fails loudly here too.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

// The known values of each source enum. Mirrors the type unions; drift between
// these and the maps is exactly what we want to catch.
const EXPECTED_KEYS = {
  mission: ["draft", "queued", "running", "needs_approval", "completed", "failed", "cancelled"],
  workflowRun: ["queued", "running", "completed", "failed", "blocked"],
  workflowStep: ["pending", "active", "done", "failed", "skipped"],
  councilRun: ["draft", "running", "waiting_for_agent", "ready_for_ceo", "blocked", "completed", "failed"],
  councilTurn: ["pending", "completed", "failed", "skipped"],
};

test("Run lifecycle phase contract (P2)", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "run-lifecycle-phase.ts"));
  const {
    RUN_LIFECYCLE_PHASES,
    phaseLabel,
    isPhaseTerminal,
    MISSION_STATUS_PHASE,
    WORKFLOW_RUN_STATUS_PHASE,
    WORKFLOW_STEP_STATUS_PHASE,
    COUNCIL_RUN_STATUS_PHASE,
    COUNCIL_TURN_STATUS_PHASE,
    councilRunStatusPhase,
  } = mod;

  const ALL_MAPS = {
    mission: MISSION_STATUS_PHASE,
    workflowRun: WORKFLOW_RUN_STATUS_PHASE,
    workflowStep: WORKFLOW_STEP_STATUS_PHASE,
    councilRun: COUNCIL_RUN_STATUS_PHASE,
    councilTurn: COUNCIL_TURN_STATUS_PHASE,
  };
  const PHASE_SET = new Set(RUN_LIFECYCLE_PHASES);

  await t.test("the phase set is exactly the 7 canonical phases", () => {
    assert.deepEqual(
      [...RUN_LIFECYCLE_PHASES].sort(),
      ["blocked", "cancelled", "done", "failed", "in_progress", "not_started", "waiting"],
    );
  });

  await t.test("each enum map covers exactly its known values", () => {
    for (const [name, map] of Object.entries(ALL_MAPS)) {
      assert.deepEqual(
        Object.keys(map).sort(),
        [...EXPECTED_KEYS[name]].sort(),
        `status→phase map "${name}" drifted from its enum`,
      );
    }
  });

  await t.test("every mapped phase is a canonical phase", () => {
    for (const [name, map] of Object.entries(ALL_MAPS)) {
      for (const [status, phase] of Object.entries(map)) {
        assert.ok(PHASE_SET.has(phase), `${name}.${status} → "${phase}" is not a canonical phase`);
      }
    }
  });

  await t.test("every canonical phase is reachable from at least one enum", () => {
    const reached = new Set();
    for (const map of Object.values(ALL_MAPS)) {
      for (const phase of Object.values(map)) reached.add(phase);
    }
    for (const phase of RUN_LIFECYCLE_PHASES) {
      assert.ok(reached.has(phase), `canonical phase "${phase}" is unreachable from any enum`);
    }
  });

  await t.test("phaseLabel + isPhaseTerminal cover all phases", () => {
    for (const phase of RUN_LIFECYCLE_PHASES) {
      const label = phaseLabel(phase);
      assert.ok(typeof label === "string" && label.trim().length > 0, `phase "${phase}" has no label`);
    }
    const terminal = RUN_LIFECYCLE_PHASES.filter(isPhaseTerminal).sort();
    assert.deepEqual(terminal, ["cancelled", "done", "failed"]);
  });

  await t.test("documented equivalence: queued ≡ draft ≡ pending = not_started", () => {
    assert.equal(MISSION_STATUS_PHASE.draft, "not_started");
    assert.equal(MISSION_STATUS_PHASE.queued, "not_started");
    assert.equal(WORKFLOW_RUN_STATUS_PHASE.queued, "not_started");
    assert.equal(COUNCIL_RUN_STATUS_PHASE.draft, "not_started");
    assert.equal(WORKFLOW_STEP_STATUS_PHASE.pending, "not_started");
    assert.equal(COUNCIL_TURN_STATUS_PHASE.pending, "not_started");
  });

  await t.test("documented equivalence: done ≡ completed = done", () => {
    assert.equal(WORKFLOW_STEP_STATUS_PHASE.done, "done");
    assert.equal(MISSION_STATUS_PHASE.completed, "done");
    assert.equal(WORKFLOW_RUN_STATUS_PHASE.completed, "done");
    assert.equal(COUNCIL_RUN_STATUS_PHASE.completed, "done");
    assert.equal(COUNCIL_TURN_STATUS_PHASE.completed, "done");
  });

  await t.test("waiting states fold into 'waiting'; skipped folds into 'cancelled'", () => {
    assert.equal(MISSION_STATUS_PHASE.needs_approval, "waiting");
    assert.equal(COUNCIL_RUN_STATUS_PHASE.waiting_for_agent, "waiting");
    assert.equal(COUNCIL_RUN_STATUS_PHASE.ready_for_ceo, "waiting");
    assert.equal(WORKFLOW_STEP_STATUS_PHASE.skipped, "cancelled");
    assert.equal(COUNCIL_TURN_STATUS_PHASE.skipped, "cancelled");
  });

  await t.test("councilRunStatusPhase maps known statuses, null for unknown (P4b helper)", () => {
    assert.equal(councilRunStatusPhase("ready_for_ceo"), "waiting");
    assert.equal(councilRunStatusPhase("completed"), "done");
    assert.equal(councilRunStatusPhase("running"), "in_progress");
    assert.equal(councilRunStatusPhase("not-a-status"), null);
  });
});
