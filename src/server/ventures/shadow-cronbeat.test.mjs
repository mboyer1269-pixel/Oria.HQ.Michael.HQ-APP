#!/usr/bin/env node

// src/server/ventures/shadow-cronbeat.test.mjs
//
// V7 Phase 1 step 4c-1 — the cronbeat.
//
// What is worth testing in a probe is mostly what it refuses to claim: it must
// not report health it cannot verify, must not confuse its own blindness with a
// failure of the thing it watches, and must not throw.

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

const {
  CRONBEAT_DEAD_MIN_HOURS,
  CRONBEAT_HEALTHY_MAX_HOURS,
  CRONBEAT_LOOKBACK_DAYS,
  classifyCronbeat,
  readCronbeat,
} = await jiti.import(path.join(__dirname, "shadow-cronbeat.ts"));

const { SHADOW_TICK_ACTION_TYPE } = await jiti.import(
  path.join(__dirname, "venture-score-shadow-runner.ts"),
);

const ctx = { workspace: { id: "workspace_test" }, userId: "owner_1", storagePreference: "local" };
const NOW = new Date("2026-08-05T12:00:00.000Z");

const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600_000).toISOString();

/** Supabase query builder stub capturing the filters the probe applies. */
function clientReturning(rows, capture = {}) {
  const builder = {
    select: () => builder,
    eq: (col, val) => {
      capture[col] = val;
      return builder;
    },
    gte: (col, val) => {
      capture.since = val;
      return builder;
    },
    order: () => builder,
    limit: () => Promise.resolve({ data: rows, error: null }),
  };
  return () => ({ from: (table) => { capture.table = table; return builder; } });
}

test("Cronbeat — classification (V7 Phase 1 step 4c-1)", async (t) => {
  await t.test("a recent tick is healthy", () => {
    const reading = classifyCronbeat(hoursAgo(3), NOW);
    assert.equal(reading.status, "healthy");
    assert.equal(reading.hoursSinceLastTick, 3);
  });

  await t.test("the healthy window allows a late run without alarming", () => {
    // 24h plus slack: a run that merely drifts must not read as a failure.
    assert.equal(classifyCronbeat(hoursAgo(25), NOW).status, "healthy");
    assert.ok(CRONBEAT_HEALTHY_MAX_HOURS > 24, "the window must exceed the cadence");
  });

  await t.test("one missed run is stale, two are dead", () => {
    assert.equal(classifyCronbeat(hoursAgo(CRONBEAT_HEALTHY_MAX_HOURS), NOW).status, "stale");
    assert.equal(classifyCronbeat(hoursAgo(40), NOW).status, "stale");
    assert.equal(classifyCronbeat(hoursAgo(CRONBEAT_DEAD_MIN_HOURS), NOW).status, "dead");
    assert.equal(classifyCronbeat(hoursAgo(200), NOW).status, "dead");
  });

  await t.test("never run is distinct from dead", () => {
    // A system that has not started and one that has stopped need different
    // responses; collapsing them would alarm on every fresh deployment.
    const reading = classifyCronbeat(null, NOW);
    assert.equal(reading.status, "never_run");
    assert.notEqual(reading.status, "dead");
  });

  await t.test("a future timestamp is unknown, never healthy", () => {
    // Clock skew is real. Reporting health from an impossible reading is how a
    // probe lies confidently.
    const reading = classifyCronbeat(new Date(NOW.getTime() + 3600_000).toISOString(), NOW);
    assert.equal(reading.status, "unknown");
    assert.match(reading.reason, /skew/);
  });

  await t.test("an unparseable timestamp is unknown, not dead", () => {
    assert.equal(classifyCronbeat("not-a-date", NOW).status, "unknown");
  });

  await t.test("every reading explains itself", () => {
    for (const value of [null, hoursAgo(1), hoursAgo(30), hoursAgo(100), "garbage"]) {
      const reading = classifyCronbeat(value, NOW);
      assert.ok(reading.reason.length > 0, `${value} must carry a reason`);
    }
  });
});

test("Cronbeat — reading the ledger (V7 Phase 1 step 4c-1)", async (t) => {
  await t.test("it queries the tick action type, scoped and bounded", async () => {
    const capture = {};
    await readCronbeat(ctx, {
      createClient: clientReturning([{ created_at: hoursAgo(2) }], capture),
      now: () => NOW,
    });

    assert.equal(capture.table, "action_ledger");
    assert.equal(capture.action_type, SHADOW_TICK_ACTION_TYPE);
    assert.equal(capture.workspace_id, ctx.workspace.id);
    assert.ok(capture.since, "the query must be bounded by an age window");
  });

  await t.test("the window comfortably exceeds the dead threshold", async () => {
    // The bound is semantic, not a tuned number: past the dead threshold the
    // exact age changes nothing, so there is nothing to learn further back.
    const capture = {};
    await readCronbeat(ctx, {
      createClient: clientReturning([{ created_at: hoursAgo(2) }], capture),
      now: () => NOW,
    });

    const windowHours = (NOW.getTime() - Date.parse(capture.since)) / 3600_000;
    assert.ok(
      windowHours > CRONBEAT_DEAD_MIN_HOURS,
      `window ${windowHours}h must exceed the ${CRONBEAT_DEAD_MIN_HOURS}h dead threshold`,
    );
    assert.equal(Math.round(windowHours / 24), CRONBEAT_LOOKBACK_DAYS);
  });

  await t.test("a recent tick reads healthy end to end", async () => {
    const reading = await readCronbeat(ctx, {
      createClient: clientReturning([{ created_at: hoursAgo(5) }]),
      now: () => NOW,
    });

    assert.equal(reading.status, "healthy");
    assert.equal(reading.hoursSinceLastTick, 5);
  });

  await t.test("an unreadable ledger is unknown, never dead", async () => {
    // The probe's own blindness is not evidence about the cron. Reporting it as
    // dead would raise an outage for a database hiccup.
    for (const createClient of [
      () => null,
      () => ({ from: () => { throw new Error("boom"); } }),
      clientReturning(null),
    ]) {
      const reading = await readCronbeat(ctx, { createClient, now: () => NOW });
      assert.equal(reading.status, "unknown", "a failed read must not accuse the cron");
    }
  });

  await t.test("an empty window is dead, and names the ambiguity", async () => {
    // A bounded read cannot tell "never started" from "stopped before the
    // window". It errs toward dead — understating a real outage costs more than
    // a needless flag — and says so rather than inventing a distinction.
    const reading = await readCronbeat(ctx, {
      createClient: clientReturning([]),
      now: () => NOW,
    });

    assert.equal(reading.status, "dead");
    assert.match(reading.reason, /never run|stopped longer ago/);
  });

  await t.test("it never throws, whatever the client does", async () => {
    const reading = await readCronbeat(ctx, {
      createClient: () => {
        throw new Error("client construction failed");
      },
      now: () => NOW,
    });

    assert.equal(reading.status, "unknown");
  });
});
