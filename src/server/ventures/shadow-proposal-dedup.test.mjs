#!/usr/bin/env node

// src/server/ventures/shadow-proposal-dedup.test.mjs
//
// V7 Phase 1 step 4c-2 — daily deduplication. Reader injected; no I/O.

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

const { findVenturesProposedToday, startOfUtcDay } = await jiti.import(
  path.join(__dirname, "shadow-proposal-dedup.ts"),
);
const { SHADOW_PROPOSAL_ACTION_TYPE } = await jiti.import(
  path.join(__dirname, "venture-score-shadow-runner.ts"),
);

const ctx = { workspace: { id: "workspace_test" }, userId: "owner_1", storagePreference: "local" };
const NOW = new Date("2026-08-05T14:30:00.000Z");

function clientReturning(result, capture = {}) {
  let calls = 0;
  const builder = {
    select: () => builder,
    eq: (col, val) => {
      capture[col] = val;
      return builder;
    },
    gte: (col, val) => {
      capture.since = val;
      calls += 1;
      capture.queryCount = calls;
      return Promise.resolve(result);
    },
  };
  return () => ({ from: (table) => { capture.table = table; return builder; } });
}

const rows = (...ventureIds) => ({
  data: ventureIds.map((id) => ({ metadata: { ventureId: id } })),
  error: null,
});

test("Shadow proposal dedup (V7 step 4c-2)", async (t) => {
  await t.test("the UTC calendar day is the boundary", () => {
    assert.equal(startOfUtcDay(NOW), "2026-08-05T00:00:00.000Z");
    assert.equal(
      startOfUtcDay(new Date("2026-08-05T00:00:00.000Z")),
      "2026-08-05T00:00:00.000Z",
      "midnight belongs to its own day",
    );
    assert.equal(
      startOfUtcDay(new Date("2026-08-05T23:59:59.999Z")),
      "2026-08-05T00:00:00.000Z",
    );
  });

  await t.test("a venture proposed today is reported", async () => {
    const outcome = await findVenturesProposedToday(ctx, {
      createClient: clientReturning(rows("v1", "v2")),
      now: () => NOW,
    });

    assert.equal(outcome.alreadyProposed.has("v1"), true);
    assert.equal(outcome.alreadyProposed.has("v2"), true);
    assert.equal(outcome.degraded, false);
  });

  await t.test("yesterday's proposals fall outside the window", async () => {
    // Enforced by the query bound, so the assertion is on the bound itself.
    const capture = {};
    await findVenturesProposedToday(ctx, {
      createClient: clientReturning(rows(), capture),
      now: () => NOW,
    });

    assert.equal(capture.since, "2026-08-05T00:00:00.000Z");
    assert.ok(
      Date.parse(capture.since) > Date.parse("2026-08-04T23:59:59.999Z"),
      "the bound must exclude the previous day",
    );
  });

  await t.test("it queries the proposal action type, workspace-scoped", async () => {
    const capture = {};
    await findVenturesProposedToday(ctx, {
      createClient: clientReturning(rows("v1"), capture),
      now: () => NOW,
    });

    assert.equal(capture.table, "action_ledger");
    assert.equal(capture.action_type, SHADOW_PROPOSAL_ACTION_TYPE);
    assert.equal(capture.workspace_id, ctx.workspace.id);
  });

  await t.test("ONE query serves the whole batch", async () => {
    // Twenty reads to guard twenty ventures would cost more than the
    // duplicates they prevent.
    const capture = {};
    await findVenturesProposedToday(ctx, {
      createClient: clientReturning(rows("v1", "v2", "v3"), capture),
      now: () => NOW,
    });

    assert.equal(capture.queryCount, 1);
  });

  await t.test("a failed read does NOT deduplicate", async () => {
    // A duplicate costs one LLM call. Wrongly skipping a day loses measurement
    // that cannot be recovered — the owner's decisions that day would have
    // nothing to pair against.
    for (const createClient of [
      () => null,
      () => ({ from: () => { throw new Error("boom"); } }),
      clientReturning({ data: null, error: { message: "down" } }),
      clientReturning({ data: "not an array", error: null }),
    ]) {
      const outcome = await findVenturesProposedToday(ctx, { createClient, now: () => NOW });

      assert.equal(outcome.degraded, true, "the caller must be told the guard was off");
      assert.equal(outcome.alreadyProposed.size, 0, "nothing may be treated as already proposed");
    }
  });

  await t.test("malformed rows are ignored without failing the read", async () => {
    const outcome = await findVenturesProposedToday(ctx, {
      createClient: clientReturning({
        data: [
          { metadata: { ventureId: "v1" } },
          { metadata: null },
          { metadata: { ventureId: "" } },
          { metadata: { ventureId: 42 } },
          {},
        ],
        error: null,
      }),
      now: () => NOW,
    });

    assert.deepEqual([...outcome.alreadyProposed], ["v1"]);
    assert.equal(outcome.degraded, false);
  });

  await t.test("it never throws", async () => {
    const outcome = await findVenturesProposedToday(ctx, {
      createClient: () => {
        throw new Error("client construction failed");
      },
      now: () => NOW,
    });

    assert.equal(outcome.degraded, true);
  });
});
