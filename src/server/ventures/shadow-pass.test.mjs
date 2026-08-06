#!/usr/bin/env node

// src/server/ventures/shadow-pass.test.mjs
//
// One shadow pass, shared by the daily cron and the manual trigger.
//
// Both callers run the SAME selection, cap and deduplication — the tests below
// exercise that shared path with a pass-through step runner, so what holds here
// holds for the cron too.

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

const { runShadowPass } = await jiti.import(path.join(__dirname, "shadow-pass.ts"));
const { SHADOW_MANUAL_PASS_ACTION_TYPE, SHADOW_TICK_ACTION_TYPE } = await jiti.import(
  path.join(__dirname, "venture-score-shadow-runner.ts"),
);

const ctx = { workspace: { id: "workspace_test" }, userId: "owner_1", storagePreference: "local" };
const venture = (id, status = "candidate") => ({ id, name: id, status, decisions: [] });
const ventures = (n) => Array.from({ length: n }, (_, i) => venture(`v${i + 1}`));

function deps(overrides = {}) {
  const events = [];
  return {
    events,
    deps: {
      tickActionType: SHADOW_MANUAL_PASS_ACTION_TYPE,
      listVentures: async () => ventures(3),
      findProposedToday: async () => ({ alreadyProposed: new Set(), degraded: false }),
      proposeForVenture: async () => ({ status: "proposed" }),
      recordEvent: async (_ctx, event) => {
        events.push(event);
        return {};
      },
      ...overrides,
    },
  };
}

test("Shadow pass — shared orchestration (V7)", async (t) => {
  await t.test("it proposes for every eligible candidate", async () => {
    const { deps: d, events } = deps();
    const { report } = await runShadowPass(ctx, d);

    assert.equal(report.considered, 3);
    assert.equal(report.proposed, 3);
    assert.equal(report.balanced, true);
    assert.equal(events.length, 1, "one tick row per pass");
  });

  await t.test("the batch cap is enforced through the shared path", async () => {
    const { deps: d } = deps({ listVentures: async () => ventures(25) });
    const { report } = await runShadowPass(ctx, d);

    assert.equal(report.proposed, 20);
    assert.equal(report.deferred, 5);
  });

  await t.test("today's proposals are skipped without an LLM call", async () => {
    let calls = 0;
    const { deps: d } = deps({
      findProposedToday: async () => ({ alreadyProposed: new Set(["v1", "v2"]), degraded: false }),
      proposeForVenture: async () => {
        calls += 1;
        return { status: "proposed" };
      },
    });

    const { report } = await runShadowPass(ctx, d);

    assert.equal(calls, 1, "only the un-proposed venture costs a call");
    assert.equal(report.deduped, 2);
  });

  await t.test("one failing venture leaves the rest proposed", async () => {
    let n = 0;
    const { deps: d } = deps({
      proposeForVenture: async () => {
        n += 1;
        if (n === 2) throw new Error("llm exploded");
        return { status: "proposed" };
      },
    });

    const { report } = await runShadowPass(ctx, d);

    assert.equal(report.proposed, 2);
    assert.equal(report.skipped, 1);
    assert.match(report.skippedReasons[0].reason, /llm exploded/);
  });

  await t.test("a declined proposal is recorded with its reason", async () => {
    const { deps: d } = deps({
      listVentures: async () => [venture("v1")],
      proposeForVenture: async () => ({ status: "skipped", reason: "evidence collection failed" }),
    });

    const { report } = await runShadowPass(ctx, d);
    assert.deepEqual(report.skippedReasons, [
      { ventureId: "v1", reason: "evidence collection failed" },
    ]);
  });

  await t.test("the tick is emitted even when nothing was proposed", async () => {
    // "Ran and found no candidates" and "did not run" are different facts.
    const { deps: d, events } = deps({ listVentures: async () => [] });
    const { report } = await runShadowPass(ctx, d);

    assert.equal(report.considered, 0);
    assert.equal(events.length, 1);
    assert.equal(events[0].actionType, SHADOW_MANUAL_PASS_ACTION_TYPE);
  });

  await t.test("a failed tick write does not fail the pass", async () => {
    const { deps: d } = deps({
      recordEvent: async () => {
        throw new Error("ledger down");
      },
    });

    const { report } = await runShadowPass(ctx, d);
    assert.equal(report.proposed, 3, "the work still happened and is reported");
  });

  await t.test("an unreadable venture list yields an empty, balanced pass", async () => {
    const { deps: d } = deps({
      listVentures: async () => {
        throw new Error("db down");
      },
    });

    const { report } = await runShadowPass(ctx, d);
    assert.equal(report.considered, 0);
    assert.equal(report.balanced, true);
  });

  await t.test("a degraded dedup guard reaches the tick", async () => {
    const { deps: d, events } = deps({
      findProposedToday: async () => ({ alreadyProposed: new Set(), degraded: true }),
    });

    await runShadowPass(ctx, d);
    assert.equal(events[0].metadata.dedupDegraded, true);
  });
});

test("Shadow pass — proposals are returned only when asked for (V7)", async (t) => {
  const fakeProposal = (ventureId) => ({
    proposalId: `prop-${ventureId}`,
    ventureId,
    score: { overallScore: 60, recommendation: "test_small" },
    gates: { allPassed: true, gates: [] },
    evidence: [{ dimension: "risk", value: 4, rationale: "long enough to matter", source: { kind: "none" } }],
  });

  await t.test("the cron path carries no proposals", async () => {
    // Nobody reads a scheduled run's proposals from its return value — they are
    // in the ledger — so carrying eleven rationales through every Inngest step
    // would pay durable storage for output that is thrown away.
    const { deps: d } = deps({
      listVentures: async () => ventures(2),
      proposeForVenture: async (_ctx, v) => ({ status: "proposed", proposal: fakeProposal(v.id) }),
    });

    const { report, proposals } = await runShadowPass(ctx, d);

    assert.equal(report.proposed, 2, "the work still happened");
    assert.deepEqual(proposals, [], "but the payload stays lean");
  });

  await t.test("the manual path returns them", async () => {
    const { deps: d } = deps({
      listVentures: async () => ventures(2),
      proposeForVenture: async (_ctx, v) => ({ status: "proposed", proposal: fakeProposal(v.id) }),
      collectProposals: true,
    });

    const { proposals } = await runShadowPass(ctx, d);

    assert.equal(proposals.length, 2);
    assert.deepEqual(proposals.map((p) => p.proposalId), ["prop-v1", "prop-v2"]);
  });

  await t.test("a skipped venture contributes no proposal", async () => {
    const { deps: d } = deps({
      listVentures: async () => ventures(2),
      proposeForVenture: async (_ctx, v) =>
        v.id === "v1"
          ? { status: "proposed", proposal: fakeProposal(v.id) }
          : { status: "skipped", reason: "llm failed" },
      collectProposals: true,
    });

    const { report, proposals } = await runShadowPass(ctx, d);

    assert.equal(proposals.length, 1);
    assert.equal(report.skipped, 1);
  });

  await t.test("the route asks for them and serves full rationales", async () => {
    // A judgement made on a clipped sentence is not a judgement of what the
    // agent actually said, so the route must not reuse the ledger's 240-char cap.
    const routeSource = await import("node:fs/promises").then((fs) =>
      fs.readFile(path.join(projectRoot, "src/app/api/ventures/shadow-pass/route.ts"), "utf8"),
    );

    assert.match(routeSource, /collectProposals:\s*true/);
    assert.match(routeSource, /rationale:\s*item\.rationale/);
    assert.ok(!/slice\(0,\s*240\)/.test(routeSource), "rationales must not be truncated here");
  });
});

test("Shadow pass — manual and scheduled runs stay distinguishable (V7)", async (t) => {
  await t.test("the two tick types differ", () => {
    // A hand-triggered run must never make the cronbeat probe report the
    // schedule healthy. Sharing the type would let someone keep the probe green
    // by hand while the cron had been dead for a week.
    assert.notEqual(SHADOW_MANUAL_PASS_ACTION_TYPE, SHADOW_TICK_ACTION_TYPE);
  });

  await t.test("the caller decides which type the tick carries", async () => {
    for (const tickActionType of [SHADOW_TICK_ACTION_TYPE, SHADOW_MANUAL_PASS_ACTION_TYPE]) {
      const { deps: d, events } = deps({ tickActionType });
      await runShadowPass(ctx, d);
      assert.equal(events[0].actionType, tickActionType);
    }
  });

  await t.test("the manual route does not emit the cron's tick type", async () => {
    const routeSource = await import("node:fs/promises").then((fs) =>
      fs.readFile(
        path.join(projectRoot, "src/app/api/ventures/shadow-pass/route.ts"),
        "utf8",
      ),
    );
    const code = routeSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    assert.match(code, /SHADOW_MANUAL_PASS_ACTION_TYPE/);
    assert.ok(
      !/SHADOW_TICK_ACTION_TYPE/.test(code),
      "the manual route must not be able to satisfy the cronbeat probe",
    );
  });

  await t.test("the manual route is POST and owner-gated", async () => {
    // It spends LLM budget and appends to the ledger: not a safe method, and a
    // prefetch must not be able to trigger it.
    const routeSource = await import("node:fs/promises").then((fs) =>
      fs.readFile(
        path.join(projectRoot, "src/app/api/ventures/shadow-pass/route.ts"),
        "utf8",
      ),
    );

    assert.match(routeSource, /export async function POST\(/);
    assert.ok(!/export async function GET\(/.test(routeSource), "no GET trigger");
    assert.match(routeSource, /requireOwnerApiSession\(\)/);
  });
});
