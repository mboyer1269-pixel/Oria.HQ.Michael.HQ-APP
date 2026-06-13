// Runs → agent quality bridge tests. Proves concluded runs aggregate into the
// scorecard's observation shape and lift an agent off the blueprint baseline.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");

test("Runs → agent quality bridge", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const A = (p) => jiti.import(path.join(projectRoot, "src", p));
  const { buildAgentObservationsFromRuns } = await jiti.import(
    path.join(__dirname, "agent-quality-from-runs.ts"),
  );
  const { reduceWorkflowRuns } = await jiti.import(path.join(__dirname, "workflow-run-events.ts"));
  const { buildAgentQualityEvaluation } = await A("features/agents/agent-quality-evaluation.ts");
  const { buildAgentKnowledgePackCatalog } = await A("features/agents/agent-knowledge-packs.ts");
  const { buildAgentAutonomyCockpit } = await A("features/agents/agent-autonomy-cockpit.ts");
  const { getDefaultAgentAutonomyPolicy } = await A("features/agents/autonomy-policy.ts");
  const { agentRegistry } = await A("features/agents/seed.ts");
  const { skillsCatalog } = await A("features/skills/seed.ts");

  let n = 0;
  const concluded = (agentId, outcome) => {
    const runId = `r-${(n += 1)}`;
    return [
      { type: "run.started", runId, workflowId: "w", agentId, title: "t", trigger: "g", steps: [{ key: "x", label: "X", detail: "d" }], atMs: 1000 },
      outcome === "completed"
        ? { type: "run.completed", runId, atMs: 1100 }
        : { type: "run.failed", runId, atMs: 1100 },
    ];
  };
  const runsFor = (specs) =>
    reduceWorkflowRuns(specs.flatMap(([agentId, c, f]) => [
      ...Array.from({ length: c }, () => concluded(agentId, "completed")).flat(),
      ...Array.from({ length: f }, () => concluded(agentId, "failed")).flat(),
    ]));

  await t.test("aggregates concluded runs into per-agent observations", () => {
    const obs = buildAgentObservationsFromRuns(runsFor([["joris", 2, 1]]));
    assert.equal(obs.length, 1);
    assert.deepEqual(obs[0], {
      agentId: "joris",
      realizedProfitCents: 0,
      ceoMinutesSaved: 0,
      guardrailViolations: 1,
      usefulOutputs: 2,
      reviewedOutputs: 3,
    });
  });

  await t.test("non-terminal runs contribute nothing", () => {
    const runs = reduceWorkflowRuns([
      { type: "run.started", runId: "live", workflowId: "w", agentId: "joris", title: "t", trigger: "g", steps: [{ key: "x", label: "X", detail: "d" }], atMs: 1000 },
    ]);
    assert.deepEqual(buildAgentObservationsFromRuns(runs), []);
  });

  await t.test("real runs lift the agent off the blueprint baseline (health reflects reality)", () => {
    const catalog = buildAgentKnowledgePackCatalog({ agents: agentRegistry, skills: skillsCatalog });
    const cockpit = buildAgentAutonomyCockpit({
      agents: agentRegistry,
      skills: skillsCatalog,
      policy: getDefaultAgentAutonomyPolicy(),
    });

    const baseline = buildAgentQualityEvaluation({ knowledgeCatalog: catalog, autonomyCockpit: cockpit });
    const baseJoris = baseline.scorecards.find((s) => s.agentId === "joris");
    assert.equal(baseJoris.evidenceMode, "blueprint_baseline");

    const observations = buildAgentObservationsFromRuns(runsFor([["joris", 4, 0]]));
    const withRuns = buildAgentQualityEvaluation({
      knowledgeCatalog: catalog,
      autonomyCockpit: cockpit,
      observations,
    });
    const liveJoris = withRuns.scorecards.find((s) => s.agentId === "joris");
    assert.equal(liveJoris.evidenceMode, "observed");
    assert.ok(
      liveJoris.overallQualityScore >= baseJoris.overallQualityScore,
      "observed score should not drop below baseline for clean completed runs",
    );
  });
});
