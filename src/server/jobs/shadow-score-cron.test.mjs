#!/usr/bin/env node

// src/server/jobs/shadow-score-cron.test.mjs
//
// The scheduled trigger.
//
// Selection, cap, deduplication, per-venture isolation and the tick report all
// live in runShadowPass, shared with the manual trigger and covered by
// shadow-pass.test.mjs. What this file asserts is the narrow set of things the
// CRON owns, and that behaviour is not restated here — a second copy of those
// assertions would drift from the first.
//
// The cron's own responsibility is four decisions:
//   1. it runs daily, not hourly;
//   2. it is registered, or it never runs at all;
//   3. it supplies Inngest's step.run, which is what buys isolation and resume;
//   4. it emits the tick type the cronbeat probe watches — and only it does.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const raw = await readFile(path.join(__dirname, "shadow-score-cron.ts"), "utf8");
const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("Shadow cron — cadence (V7 step 4c-2)", async (t) => {
  await t.test("it runs once daily", () => {
    const schedule = code.match(/SHADOW_CRON_SCHEDULE\s*=\s*["']([^"']+)["']/)?.[1];

    assert.ok(schedule, "the schedule must be declared");
    const [, hour, dayOfMonth, month, dayOfWeek] = schedule.split(/\s+/);
    assert.notEqual(hour, "*", "an hourly cron would burn budget for no signal");
    assert.equal(dayOfMonth, "*");
    assert.equal(month, "*");
    assert.equal(dayOfWeek, "*");
  });

  await t.test("it declares a cron trigger, not an event trigger", () => {
    assert.match(code, /\{\s*cron:\s*SHADOW_CRON_SCHEDULE\s*\}/);
  });

  await t.test("it does not retry", () => {
    // A retried tick re-proposes for ventures the first attempt handled. Dedup
    // guards it, but a tick is cheap to miss and expensive to double.
    assert.match(code, /retries:\s*0/);
  });
});

test("Shadow cron — registration (V7 step 4c-2)", async (t) => {
  await t.test("it is registered on the Inngest route", async () => {
    // A function nobody registers never runs, and nothing would fail to say so.
    const route = await readFile(
      path.join(projectRoot, "src/app/api/inngest/route.ts"),
      "utf8",
    );

    assert.match(route, /shadowScoreCron/);
    assert.match(route, /functions:\s*\[[^\]]*shadowScoreCron/);
  });
});

test("Shadow cron — what it delegates and what it owns (V7 step 4c-2)", async (t) => {
  await t.test("orchestration is delegated, not duplicated", () => {
    // Two copies of the batching logic would drift until only one of them
    // respected the cap.
    assert.match(code, /runShadowPass\(/);
    assert.ok(
      !/selectShadowBatch\(|buildTickReport\(/.test(code),
      "the cron must not re-implement selection or reporting",
    );
  });

  await t.test("it supplies Inngest's step.run for isolation", () => {
    // This is what buys per-venture isolation and mid-run resume, and it is the
    // only reason the scheduled path differs from the manual one.
    assert.match(code, /runStep:/);
    assert.match(code, /step\.run\(/);
  });

  await t.test("it emits the tick type the probe watches", () => {
    assert.match(code, /tickActionType:\s*SHADOW_TICK_ACTION_TYPE/);
  });

  await t.test("it never mints a proposalId", () => {
    // Two authorities over one key would make the pairing unprovable, and the
    // pairing is the only thing shadow mode produces.
    assert.ok(!/randomUUID|uuidv4|crypto\.randomUUID/.test(code));
    assert.ok(!/proposalId\s*[:=]/.test(code));
  });

  await t.test("it does not touch venture lifecycle", () => {
    for (const mutator of ["scoreVenture", "promoteVenture", "archiveVenture", "killVenture"]) {
      assert.ok(!new RegExp(`\\b${mutator}\\s*\\(`).test(code), `${mutator} is out of bounds`);
    }
  });
});
