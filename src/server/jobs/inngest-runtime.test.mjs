#!/usr/bin/env node

// src/server/jobs/inngest-runtime.test.mjs
//
// Runtime contract for the Inngest SDK under the patched zod.
//
// inngest@3 validates its own wire protocol (introspection, execution bodies,
// step memoization) with `zod/v3`. package.json forces every zod in the tree to
// the root zod (>= 4.6.6, the version GHSA-mrhx-c7xc-m3w5 is fixed in) through
// `overrides`, so the SDK now runs on the `zod/v3` compatibility layer shipped
// inside zod 4. These tests drive the same `inngest/next` serve handler as
// src/app/api/inngest, end to end through real Request/Response objects, so a
// zod API break inside the SDK fails here instead of in production deliveries.
//
// RESIDUAL RISK, stated plainly: the upstream fix changed the v4 parser only.
// The `zod/v3` layer the SDK uses still evaluates every element of an
// over-length constrained collection, exactly as zod 3.25.76 did. The override
// removes the vulnerable package version from the tree; it does not harden the
// SDK's v3 parsing. Inngest only parses bodies from the Inngest platform, which
// are signature-checked in production (INNGEST_SIGNING_KEY). The version check
// below is a dependency-hygiene assertion, not a security regression test.
//
// Covered: registration/introspection, first execution of a durable step,
// replay from memoized step state (resume), and a non-step return.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

process.env.INNGEST_DEV = "1";

const { Inngest } = await import("inngest");
const { serve } = await import("inngest/next");

const BASE = "http://localhost:3000/api/inngest";
const headers = { host: "localhost:3000", "content-type": "application/json" };

const inngest = new Inngest({ id: "runtime-test", isDev: true });
let stepCalls = 0;
const durable = inngest.createFunction(
  { id: "durable", retries: 0 },
  { event: "test/durable" },
  async ({ event, step }) => {
    const first = await step.run("first", async () => {
      stepCalls += 1;
      return { echoed: event.data.message };
    });
    return { done: true, first };
  },
);
const cron = inngest.createFunction(
  { id: "cron", retries: 0 },
  { cron: "0 6 * * *" },
  async () => ({ ticked: true }),
);
const { GET, POST } = serve({ client: inngest, functions: [durable, cron] });

function execBody(name, data, steps = {}) {
  const event = { name, data };
  return JSON.stringify({
    event,
    events: [event],
    steps,
    ctx: { run_id: "run-1", attempt: 0, stack: { stack: Object.keys(steps), current: 0 } },
    version: 1,
    use_api: false,
  });
}

function post(fnId, body) {
  return POST(new Request(`${BASE}?fnId=${fnId}&stepId=step`, { method: "POST", headers, body }));
}

test("Inngest runtime on patched zod", async (t) => {
  await t.test("the SDK resolves zod/v3 from the single patched root zod", () => {
    const require = createRequire(import.meta.resolve("inngest"));
    const sdkZod = require("zod/package.json");
    const rootZod = createRequire(import.meta.url)("zod/package.json");
    assert.equal(sdkZod.version, rootZod.version);
    const [major, minor, patch] = sdkZod.version.split(".").map(Number);
    assert.ok(major > 4 || (major === 4 && (minor > 6 || (minor === 6 && patch >= 6))),
      `zod ${sdkZod.version} is below the patched 4.6.6`);
  });

  await t.test("introspection reports both functions", async () => {
    const res = await GET(new Request(BASE, { headers }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.function_count, 2);
    assert.equal(body.mode, "dev");
  });

  let stepOp;
  await t.test("first execution runs the durable step and reports it", async () => {
    const res = await post("runtime-test-durable", execBody("test/durable", { message: "bonjour" }));
    assert.equal(res.status, 206);
    const ops = await res.json();
    assert.equal(ops.length, 1);
    stepOp = ops[0];
    assert.equal(stepOp.op, "StepRun");
    assert.equal(stepOp.name, "first");
    assert.deepEqual(stepOp.data, { echoed: "bonjour" });
    assert.equal(stepCalls, 1);
  });

  await t.test("replay from memoized state resumes without re-running the step", async () => {
    const res = await post(
      "runtime-test-durable",
      execBody("test/durable", { message: "bonjour" }, { [stepOp.id]: { data: stepOp.data } }),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { done: true, first: { echoed: "bonjour" } });
    assert.equal(stepCalls, 1, "a memoized step must not execute again");
  });

  await t.test("a cron function without steps completes in one call", async () => {
    const res = await post("runtime-test-cron", execBody("inngest/scheduled.timer", { cron: "0 6 * * *" }));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ticked: true });
  });
});
