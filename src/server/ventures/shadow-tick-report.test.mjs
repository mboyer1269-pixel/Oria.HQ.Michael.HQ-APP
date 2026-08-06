#!/usr/bin/env node

// src/server/ventures/shadow-tick-report.test.mjs
//
// V7 Phase 1 step 4c-2 — batch selection and tick report. Pure, no I/O.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const { SHADOW_BATCH_CAP, buildTickReport, formatTickSummary, selectShadowBatch } =
  await jiti.import(path.join(__dirname, "shadow-tick-report.ts"));

const venture = (id, status = "candidate") => ({ id, name: id, status, decisions: [] });
const ventures = (n, prefix = "v") =>
  Array.from({ length: n }, (_, i) => venture(`${prefix}${i + 1}`));

const emptyTally = { proposed: 0, skipped: [] };

test("Shadow batch selection (V7 step 4c-2)", async (t) => {
  await t.test("only candidates are selected", () => {
    const selection = selectShadowBatch(
      [venture("a"), venture("b", "scored"), venture("c", "killed"), venture("d")],
      new Set(),
    );

    assert.equal(selection.considered, 2);
    assert.deepEqual(selection.selected.map((v) => v.id), ["a", "d"]);
  });

  await t.test("the cap is 20 and is enforced", () => {
    assert.equal(SHADOW_BATCH_CAP, 20);
    const selection = selectShadowBatch(ventures(25), new Set());

    assert.equal(selection.selected.length, 20);
    assert.equal(selection.deferred.length, 5);
  });

  await t.test("ventures beyond the cap are named, never dropped silently", () => {
    // A silent truncation reads as "we covered everything" when it did not.
    const selection = selectShadowBatch(ventures(23), new Set());

    assert.deepEqual(selection.deferred, ["v21", "v22", "v23"]);
  });

  await t.test("the cap applies AFTER dedup, so the queue cannot starve", () => {
    // Capping first would let 20 already-scored ventures consume the whole
    // budget while un-scored ones waited behind them.
    const all = ventures(25);
    const alreadyProposed = new Set(all.slice(0, 20).map((v) => v.id));

    const selection = selectShadowBatch(all, alreadyProposed);

    assert.equal(selection.deduped.length, 20);
    assert.deepEqual(
      selection.selected.map((v) => v.id),
      ["v21", "v22", "v23", "v24", "v25"],
      "the five un-scored ventures must be the ones proposed",
    );
    assert.equal(selection.deferred.length, 0);
  });

  await t.test("an empty input yields a valid empty selection", () => {
    const selection = selectShadowBatch([], new Set());

    assert.deepEqual(selection.selected, []);
    assert.equal(selection.considered, 0);
    assert.deepEqual(selection.deferred, []);
  });

  await t.test("a cap of zero selects nothing and defers everything", () => {
    const selection = selectShadowBatch(ventures(3), new Set(), 0);

    assert.equal(selection.selected.length, 0);
    assert.equal(selection.deferred.length, 3);
  });
});

test("Shadow tick report (V7 step 4c-2)", async (t) => {
  await t.test("every candidate is accounted for", () => {
    const selection = selectShadowBatch(ventures(25), new Set());
    const report = buildTickReport({
      selection,
      tally: { proposed: 18, skipped: [{ ventureId: "v19", reason: "llm failed" }, { ventureId: "v20", reason: "llm failed" }] },
      dedupDegraded: false,
    });

    assert.equal(report.considered, 25);
    assert.equal(report.proposed + report.skipped + report.deduped + report.deferred, 25);
    assert.equal(report.balanced, true);
  });

  await t.test("an unbalanced count is flagged, not hidden", () => {
    // A report that does not add up lost track of a venture, and the first
    // place that shows is a divergence history with unexplained holes.
    const selection = selectShadowBatch(ventures(5), new Set());
    const report = buildTickReport({
      selection,
      tally: { proposed: 2, skipped: [] },
      dedupDegraded: false,
    });

    assert.equal(report.balanced, false);
    assert.match(formatTickSummary(report), /COMPTE NON ÉQUILIBRÉ/);
  });

  await t.test("skip reasons survive into the report", () => {
    const selection = selectShadowBatch(ventures(2), new Set());
    const report = buildTickReport({
      selection,
      tally: { proposed: 1, skipped: [{ ventureId: "v2", reason: "evidence collection failed" }] },
      dedupDegraded: false,
    });

    assert.deepEqual(report.skippedReasons, [
      { ventureId: "v2", reason: "evidence collection failed" },
    ]);
  });

  await t.test("a degraded dedup guard is declared", () => {
    // An unexplained burst of duplicates is worse than a duplicate.
    const report = buildTickReport({
      selection: selectShadowBatch(ventures(1), new Set()),
      tally: { proposed: 1, skipped: [] },
      dedupDegraded: true,
    });

    assert.equal(report.dedupDegraded, true);
    assert.match(formatTickSummary(report), /dédup indisponible/);
  });

  await t.test("an empty batch still produces a valid, balanced report", () => {
    // "Ran and found nothing" must be recordable — it is what distinguishes a
    // working cron from a dead one.
    const report = buildTickReport({
      selection: selectShadowBatch([], new Set()),
      tally: emptyTally,
      dedupDegraded: false,
    });

    assert.equal(report.considered, 0);
    assert.equal(report.balanced, true);
    assert.ok(formatTickSummary(report).length > 0);
  });

  await t.test("deferred venture ids reach the report", () => {
    const report = buildTickReport({
      selection: selectShadowBatch(ventures(22), new Set()),
      tally: { proposed: 20, skipped: [] },
      dedupDegraded: false,
    });

    assert.deepEqual(report.deferredVentureIds, ["v21", "v22"]);
    assert.match(formatTickSummary(report), /2 reportée/);
  });
});
