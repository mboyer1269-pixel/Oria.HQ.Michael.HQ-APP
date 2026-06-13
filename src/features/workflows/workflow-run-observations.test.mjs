// Closed-loop tests: concluded runs become observations that light up KPIs,
// plus the refined evaluate() at-risk band on 100%-style targets.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");

test("Runs → observations → KPIs", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const { deriveObservationsFromRuns } = await jiti.import(
    path.join(__dirname, "workflow-run-observations.ts"),
  );
  const { reduceWorkflowRuns } = await jiti.import(path.join(__dirname, "workflow-run-events.ts"));
  const { buildKpiObservationReport } = await jiti.import(
    path.join(__dirname, "kpi-observations.ts"),
  );
  const { kpiObservationBindings } = await jiti.import(
    path.join(__dirname, "kpi-observation-bindings.ts"),
  );
  const { charterRegistry } = await jiti.import(
    path.join(projectRoot, "src/features/agents/charter-seed.ts"),
  );

  const oneStep = [{ key: "x", label: "X", detail: "d" }];
  let n = 0;
  const concludedRun = (agentId, outcome) => {
    const runId = `r-${(n += 1)}`;
    return [
      { type: "run.started", runId, workflowId: "w", agentId, title: "t", trigger: "g", steps: oneStep, atMs: 1000 },
      outcome === "completed"
        ? { type: "run.completed", runId, atMs: 1100 }
        : { type: "run.failed", runId, atMs: 1100 },
    ];
  };

  const runsFor = (agentId, completed, failed) => {
    const events = [];
    for (let i = 0; i < completed; i += 1) events.push(...concludedRun(agentId, "completed"));
    for (let i = 0; i < failed; i += 1) events.push(...concludedRun(agentId, "failed"));
    return reduceWorkflowRuns(events);
  };

  await t.test("non-terminal runs produce no observation; terminal ones do", () => {
    const runs = reduceWorkflowRuns([
      { type: "run.started", runId: "live", workflowId: "w", agentId: "joris", title: "t", trigger: "g", steps: oneStep, atMs: 1000 },
    ]);
    assert.deepEqual(deriveObservationsFromRuns(runs), []);

    const done = runsFor("joris", 1, 0);
    const obs = deriveObservationsFromRuns(done);
    assert.equal(obs.length, 1);
    assert.equal(obs[0].status, "completed");
    assert.equal(obs[0].metrics.usefulOutputs, 1);
    assert.equal(obs[0].metrics.guardrailViolations, 0);
  });

  await t.test("a failed run records a guardrail issue", () => {
    const obs = deriveObservationsFromRuns(runsFor("sentinel", 0, 1));
    assert.equal(obs[0].status, "failed");
    assert.equal(obs[0].metrics.usefulOutputs, 0);
    assert.equal(obs[0].metrics.guardrailViolations, 1);
  });

  await t.test("relay completion KPI lights up from real runs", () => {
    const obs = deriveObservationsFromRuns(runsFor("hermes", 4, 0)); // 100% completion
    const report = buildKpiObservationReport(charterRegistry, obs, kpiObservationBindings);
    const completion = report.rows.find((r) => r.kpiId === "relay-mission-completion");
    assert.equal(completion.measure, "useful_output_rate");
    assert.equal(completion.actual, 100);
    assert.equal(completion.status, "met"); // target ≥ 95 %
  });

  await t.test("refined evaluate: 95% against a 100% target is at_risk, not missed", () => {
    // 19 completed + 1 failed → guardrail_clean_rate 95% against joris-ledger-coverage "100 %".
    const obs = deriveObservationsFromRuns(runsFor("joris", 19, 1));
    const report = buildKpiObservationReport(charterRegistry, obs, kpiObservationBindings);
    const ledger = report.rows.find((r) => r.kpiId === "joris-ledger-coverage");
    assert.equal(ledger.actual, 95);
    assert.equal(ledger.status, "at_risk");
  });

  await t.test("an exact 0 target stays strict (1 incident = missed)", () => {
    const obs = deriveObservationsFromRuns(runsFor("sentinel", 0, 1)); // 1 guardrail violation
    const report = buildKpiObservationReport(charterRegistry, obs, kpiObservationBindings);
    const incidents = report.rows.find((r) => r.kpiId === "sentinel-incident-count");
    assert.equal(incidents.actual, 1);
    assert.equal(incidents.status, "missed");
  });
});
