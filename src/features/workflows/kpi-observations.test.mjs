// KPI ↔ observations linker tests — target parsing across every seed format,
// per-agent aggregation, the bound/awaiting/unbound/met/at_risk/missed verdict
// matrix, and a grounding check that every binding points at a real KPI.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");

test("KPI observations linker", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: { "@": path.join(projectRoot, "src") },
  });

  const { parseKpiTarget, aggregateObservationsByAgent, buildKpiObservationReport } =
    await jiti.import(path.join(__dirname, "kpi-observations.ts"));
  const { kpiObservationBindings } = await jiti.import(
    path.join(__dirname, "kpi-observation-bindings.ts"),
  );
  const { charterRegistry } = await jiti.import(
    path.join(projectRoot, "src/features/agents/charter-seed.ts"),
  );

  const outcome = (agentId, metrics, status = "completed") => ({
    id: `o-${agentId}-${Math.random().toString(36).slice(2)}`,
    agentId,
    source: "test",
    objective: "obj",
    expectedOutcome: "exp",
    actualOutcome: "act",
    status,
    riskLevel: "low",
    artifacts: [],
    evidence: ["e"],
    createdAt: "2026-06-12T00:00:00.000Z",
    metrics,
  });

  await t.test("parses every comparator/unit used in the seed", () => {
    assert.deepEqual(parseKpiTarget("≥ 90 %"), {
      raw: "≥ 90 %",
      comparator: ">=",
      value: 90,
      unit: "percent",
      parsed: true,
    });
    assert.equal(parseKpiTarget("< 30 s").comparator, "<");
    assert.equal(parseKpiTarget("< 30 s").unit, "seconds");
    assert.equal(parseKpiTarget("< 24 h").unit, "hours");
    assert.equal(parseKpiTarget("< 7 jours").unit, "days");
    assert.equal(parseKpiTarget("≥ 3").unit, "count");
    assert.equal(parseKpiTarget("≥ 3").comparator, ">=");
    assert.deepEqual(
      { c: parseKpiTarget("100 %").comparator, v: parseKpiTarget("100 %").value },
      { c: "==", v: 100 },
    );
    // "0 (gelé)" must still yield an exact 0 target.
    assert.deepEqual(
      { c: parseKpiTarget("0 (gelé)").comparator, v: parseKpiTarget("0 (gelé)").value },
      { c: "==", v: 0 },
    );
    assert.equal(parseKpiTarget("n/a").parsed, false);
  });

  await t.test("aggregates only measured (completed/failed) outcomes per agent", () => {
    const map = aggregateObservationsByAgent([
      outcome("joris", { realizedProfitCents: 100, ceoMinutesSaved: 10, guardrailViolations: 0, usefulOutputs: 9, reviewedOutputs: 10 }),
      outcome("joris", { realizedProfitCents: 50, ceoMinutesSaved: 5, guardrailViolations: 1, usefulOutputs: 4, reviewedOutputs: 10 }),
      outcome("joris", { realizedProfitCents: 999, ceoMinutesSaved: 99, guardrailViolations: 9, usefulOutputs: 0, reviewedOutputs: 9 }, "draft"),
    ]);
    const j = map.get("joris");
    assert.equal(j.runCount, 2); // draft excluded
    assert.equal(j.realizedProfitCents, 150);
    assert.equal(j.usefulOutputs, 13);
    assert.equal(j.reviewedOutputs, 20);
    assert.equal(j.usefulOutputRatePct, 65); // 13/20
    assert.equal(j.guardrailCleanRatePct, 95); // 1 violation / 20
  });

  await t.test("no observations: bound KPIs await, unbound KPIs stay unbound", () => {
    const report = buildKpiObservationReport(charterRegistry, [], kpiObservationBindings);
    assert.equal(report.boundCount, kpiObservationBindings.length);
    assert.equal(report.measuredCount, 0);
    const routing = report.rows.find((r) => r.kpiId === "joris-routing-accuracy");
    assert.equal(routing.status, "awaiting_observations");
    assert.equal(routing.measure, "useful_output_rate");
    const latency = report.rows.find((r) => r.kpiId === "joris-intent-latency");
    assert.equal(latency.status, "unbound");
    assert.equal(report.awaitingCount, kpiObservationBindings.length);
  });

  await t.test("real observations light up bound KPIs (met)", () => {
    const report = buildKpiObservationReport(
      charterRegistry,
      [
        outcome("joris", { realizedProfitCents: 0, ceoMinutesSaved: 0, guardrailViolations: 0, usefulOutputs: 9, reviewedOutputs: 10 }),
        outcome("sentinel", { realizedProfitCents: 0, ceoMinutesSaved: 0, guardrailViolations: 0, usefulOutputs: 5, reviewedOutputs: 5 }),
      ],
      kpiObservationBindings,
    );
    const routing = report.rows.find((r) => r.kpiId === "joris-routing-accuracy");
    assert.equal(routing.actual, 90);
    assert.equal(routing.status, "met");
    const ledger = report.rows.find((r) => r.kpiId === "joris-ledger-coverage");
    assert.equal(ledger.actual, 100);
    assert.equal(ledger.status, "met");
    const incidents = report.rows.find((r) => r.kpiId === "sentinel-incident-count");
    assert.equal(incidents.actual, 0);
    assert.equal(incidents.status, "met"); // target "0", 0 violations
  });

  await t.test("at_risk band and missed verdicts", () => {
    const atRisk = buildKpiObservationReport(
      charterRegistry,
      [outcome("joris", { realizedProfitCents: 0, ceoMinutesSaved: 0, guardrailViolations: 0, usefulOutputs: 85, reviewedOutputs: 100 })],
      kpiObservationBindings,
    ).rows.find((r) => r.kpiId === "joris-routing-accuracy");
    assert.equal(atRisk.actual, 85); // target ≥90 → within 10% → at_risk
    assert.equal(atRisk.status, "at_risk");

    const missed = buildKpiObservationReport(
      charterRegistry,
      [outcome("sentinel", { realizedProfitCents: 0, ceoMinutesSaved: 0, guardrailViolations: 3, usefulOutputs: 2, reviewedOutputs: 5 })],
      kpiObservationBindings,
    ).rows.find((r) => r.kpiId === "sentinel-incident-count");
    assert.equal(missed.actual, 3); // target "0" → missed
    assert.equal(missed.status, "missed");
  });

  await t.test("every binding targets a KPI that exists in the charter set", () => {
    const kpiIds = new Set(charterRegistry.flatMap((c) => c.kpis.map((k) => k.id)));
    for (const binding of kpiObservationBindings) {
      assert.ok(kpiIds.has(binding.kpiId), `binding ${binding.kpiId} must match a real KPI`);
    }
  });

  await t.test("report row count equals total charter KPI count", () => {
    const total = charterRegistry.reduce((sum, c) => sum + c.kpis.length, 0);
    const report = buildKpiObservationReport(charterRegistry, [], kpiObservationBindings);
    assert.equal(report.rows.length, total);
  });
});
