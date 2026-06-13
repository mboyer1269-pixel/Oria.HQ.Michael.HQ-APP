// Agent Charter contract tests — registry coverage, skill alignment,
// validation rules and the charter health report (supervision layer).
// See docs/AGENT_ORCHESTRATION.md.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");

test("Agent charter contract", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const { agentRegistry } = await jiti.import(path.join(__dirname, "seed.ts"));
  const { charterRegistry } = await jiti.import(path.join(__dirname, "charter-seed.ts"));
  const { validateAgentCharters, buildCharterHealthReport, getAgentCharter } =
    await jiti.import(path.join(__dirname, "agent-charter.ts"));

  await t.test("every registry agent has exactly one valid charter", () => {
    const report = validateAgentCharters(agentRegistry, charterRegistry);
    assert.deepEqual(report.missingCharters, [], "agents without charter");
    assert.deepEqual(report.orphanCharters, [], "charters without agent");
    const errors = report.issues.filter((i) => i.severity === "error");
    assert.deepEqual(errors, [], "charter errors must be empty");
    assert.equal(report.valid, true);
  });

  await t.test("workflow skillIds are always a subset of registry skillIds", () => {
    const byId = new Map(agentRegistry.map((a) => [a.id, a]));
    for (const charter of charterRegistry) {
      const granted = new Set(byId.get(charter.agentId).skillIds);
      for (const wf of charter.workflows) {
        for (const skillId of wf.skillIds) {
          assert.ok(
            granted.has(skillId),
            `${charter.agentId}/${wf.id} uses ungranted skill ${skillId}`,
          );
        }
      }
    }
  });

  await t.test(
    "every workflow declares trigger, business reason, output, validation, next action",
    () => {
      for (const charter of charterRegistry) {
        for (const wf of charter.workflows) {
          assert.ok(wf.trigger.trim(), `${wf.id}: trigger`);
          assert.ok(wf.businessReason.trim(), `${wf.id}: businessReason`);
          assert.ok(wf.outputs.length > 0, `${wf.id}: outputs`);
          assert.ok(wf.validation.trim(), `${wf.id}: validation`);
          assert.ok(wf.nextAction.trim(), `${wf.id}: nextAction`);
        }
      }
    },
  );

  await t.test("workflow ids are globally unique", () => {
    const seen = new Set();
    for (const charter of charterRegistry) {
      for (const wf of charter.workflows) {
        assert.ok(!seen.has(wf.id), `duplicate workflow id ${wf.id}`);
        seen.add(wf.id);
      }
    }
  });

  await t.test("every charter declares mission, ROI lever, KPI and escalation", () => {
    for (const charter of charterRegistry) {
      assert.ok(charter.mission.trim(), `${charter.agentId}: mission`);
      assert.ok(charter.roiLevers.length >= 1, `${charter.agentId}: roiLevers`);
      assert.ok(charter.kpis.length >= 1, `${charter.agentId}: kpis`);
      assert.ok(charter.escalation.trim(), `${charter.agentId}: escalation`);
      assert.ok(
        charter.dna.operatingPrinciples.length >= 2,
        `${charter.agentId}: needs >= 2 operating principles`,
      );
      assert.ok(
        charter.dna.prioritization.length >= 1,
        `${charter.agentId}: needs prioritization logic`,
      );
    }
  });

  await t.test("frozen Closer charter never authorizes direct sends", () => {
    const closer = getAgentCharter(charterRegistry, "closer");
    assert.ok(closer, "closer charter exists");
    const kpi = closer.kpis.find((k) => k.id === "closer-external-sends");
    assert.ok(kpi, "closer tracks external sends");
    assert.match(kpi.target, /0/);
    assert.match(closer.escalation.toLowerCase(), /gel|sentinel/);
  });

  await t.test("health report: all seeded charters score operational", () => {
    const report = buildCharterHealthReport(agentRegistry, charterRegistry);
    assert.equal(report.rows.length, agentRegistry.length);
    assert.equal(report.decorativeCount, 0, "no decorative agents");
    assert.equal(report.thinCount, 0, "no thin charters in seed");
    assert.equal(report.operationalCount, agentRegistry.length);
    assert.ok(report.averageScore >= 85);
    // Deterministic: rows follow registry order.
    assert.deepEqual(
      report.rows.map((r) => r.agentId),
      agentRegistry.map((a) => a.id),
    );
  });

  await t.test("health report flags an agent without charter as decorative", () => {
    const report = buildCharterHealthReport(agentRegistry, charterRegistry.slice(1));
    const missing = report.rows.find((r) => r.agentId === charterRegistry[0].agentId);
    assert.equal(missing.score, 0);
    assert.equal(missing.verdict, "decorative");
    assert.equal(missing.topGap, "Créer la charte");
    assert.equal(report.decorativeCount, 1);
  });

  await t.test("validation flags ungranted skills and duplicate charters", () => {
    const agent = agentRegistry[0];
    const bogus = {
      agentId: agent.id,
      mission: "x",
      dna: { identity: "x", operatingPrinciples: ["a", "b"], prioritization: ["1"] },
      roiLevers: ["time_saving"],
      workflows: [
        {
          id: "bogus-wf",
          title: "Bogus",
          trigger: "t",
          businessReason: "b",
          inputs: [],
          outputs: ["o"],
          validation: "v",
          nextAction: "n",
          skillIds: ["skill.that.does.not.exist"],
        },
      ],
      successCriteria: ["s"],
      kpis: [{ id: "k", label: "l", target: "t" }],
      escalation: "e",
    };
    const report = validateAgentCharters([agent], [bogus, bogus]);
    assert.equal(report.valid, false);
    assert.ok(report.issues.some((i) => i.message.includes("not granted")));
    assert.ok(report.issues.some((i) => i.message.includes("Duplicate charter")));
  });
});
