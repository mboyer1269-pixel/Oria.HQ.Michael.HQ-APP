#!/usr/bin/env node

// src/server/jobs/shadow-score-cron.test.mjs
//
// V7 Phase 1 step 4c-2 — the shadow trigger.
//
// The Inngest function itself is orchestration; its decisions live in pure
// modules tested elsewhere. What is asserted here is the contract the file
// must hold no matter how it is refactored: daily cadence, one isolated step
// per venture, a tick emitted unconditionally, and no proposalId minted.
//
// Structural assertions read the source with comments stripped, so a header
// describing a rule is never mistaken for the rule being applied.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const CRON_FILE = path.join(__dirname, "shadow-score-cron.ts");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const { SHADOW_BATCH_CAP, buildTickReport, selectShadowBatch } = await jiti.import(
  path.join(projectRoot, "src/server/ventures/shadow-tick-report.ts"),
);

const raw = await readFile(CRON_FILE, "utf8");
const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("Shadow cron — cadence and registration (V7 step 4c-2)", async (t) => {
  await t.test("it runs once daily", () => {
    const schedule = code.match(/SHADOW_CRON_SCHEDULE\s*=\s*["']([^"']+)["']/)?.[1];

    assert.ok(schedule, "the schedule must be declared");
    const [, hour, dayOfMonth, month, dayOfWeek] = schedule.split(/\s+/);
    assert.notEqual(hour, "*", "an hourly cron would burn budget for no signal");
    assert.equal(dayOfMonth, "*");
    assert.equal(month, "*");
    assert.equal(dayOfWeek, "*");
  });

  await t.test("it is registered on the Inngest route", async () => {
    // A function nobody registers never runs, and nothing would fail to say so.
    const route = await readFile(
      path.join(projectRoot, "src/app/api/inngest/route.ts"),
      "utf8",
    );

    assert.match(route, /shadowScoreCron/);
    assert.match(route, /functions:\s*\[[^\]]*shadowScoreCron/);
  });

  await t.test("it declares a cron trigger, not an event trigger", () => {
    assert.match(code, /\{\s*cron:\s*SHADOW_CRON_SCHEDULE\s*\}/);
  });
});

test("Shadow cron — isolation and identity (V7 step 4c-2)", async (t) => {
  await t.test("each proposal gets its own step", () => {
    // One step per venture is what keeps a single failure from taking the
    // batch with it.
    assert.match(
      code,
      /step\.run\(`propose-\$\{ventureId\}`/,
      "each venture must be proposed inside its own named step",
    );
  });

  await t.test("a failing venture is recorded as skipped, not thrown", () => {
    // The step returns an ok/reason result instead of throwing, so the loop
    // continues and the reason reaches the tick report.
    assert.match(code, /ok:\s*false\s*as\s*const,\s*reason/);
    assert.match(code, /tally\.skipped\.push/);
  });

  await t.test("the cron never mints a proposalId", () => {
    // Two authorities over one key would make the pairing unprovable, and the
    // pairing is the only thing shadow mode produces.
    assert.ok(!/randomUUID|uuidv4|crypto\.randomUUID/.test(code), "no id generation here");
    assert.ok(!/proposalId\s*[:=]/.test(code), "the cron must not assign a proposalId");
  });

  await t.test("it does not touch venture lifecycle", () => {
    for (const mutator of ["scoreVenture", "promoteVenture", "archiveVenture", "killVenture"]) {
      assert.ok(!new RegExp(`\\b${mutator}\\s*\\(`).test(code), `${mutator} is out of bounds`);
    }
  });
});

test("Shadow cron — the tick is unconditional (V7 step 4c-2)", async (t) => {
  await t.test("the tick step is not inside a conditional", () => {
    // "Ran and found no candidates" and "did not run" are different facts, and
    // only this row tells them apart. It is also what moves the cronbeat probe
    // to healthy.
    const tickIndex = code.indexOf('step.run("tick-report"');
    assert.ok(tickIndex > 0, "the tick step must exist");

    const preceding = code.slice(0, tickIndex);
    const lastIf = preceding.lastIndexOf("if (");
    const lastClose = preceding.lastIndexOf("}");
    assert.ok(
      lastIf < lastClose,
      "the tick must not sit inside an if-block — it is emitted unconditionally",
    );
  });

  await t.test("a failed tick write does not throw the run", () => {
    const tickBlock = code.slice(code.indexOf('step.run("tick-report"'));
    assert.match(tickBlock, /catch\s*\{/, "the ledger write must be guarded");
  });

  await t.test("the tick carries the full account", () => {
    const tickBlock = code.slice(code.indexOf('step.run("tick-report"'));
    for (const field of [
      "considered",
      "proposed",
      "skipped",
      "deduped",
      "deferred",
      "dedupDegraded",
      "balanced",
    ]) {
      assert.match(tickBlock, new RegExp(`${field}:`), `${field} must reach the ledger`);
    }
  });

  await t.test("an empty batch still yields a balanced report", () => {
    // The shape the cron emits when nothing is eligible.
    const report = buildTickReport({
      selection: selectShadowBatch([], new Set()),
      tally: { proposed: 0, skipped: [] },
      dedupDegraded: false,
    });

    assert.equal(report.considered, 0);
    assert.equal(report.proposed, 0);
    assert.equal(report.balanced, true);
  });

  await t.test("no proposal step runs when the batch is empty", () => {
    // The loop iterates plan.ventureIds, so an empty selection means zero LLM
    // calls — the budget guard of last resort.
    assert.match(code, /for\s*\(const ventureId of plan\.ventureIds\)/);
  });
});

test("Shadow cron — batching contract (V7 step 4c-2)", async (t) => {
  await t.test("the cap is enforced by the shared pure selector", () => {
    // The cron must not re-implement the cap; one authority, tested once.
    assert.match(code, /selectShadowBatch\(/);
    assert.equal(SHADOW_BATCH_CAP, 20);
  });

  await t.test("selection happens in a single step", () => {
    assert.match(code, /step\.run\("select-batch"/);
  });

  await t.test("deferred ventures are carried into the report", () => {
    assert.match(code, /deferred:\s*plan\.selection\.deferred/);
  });
});
