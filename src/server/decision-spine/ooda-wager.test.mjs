#!/usr/bin/env node

// src/server/decision-spine/ooda-wager.test.mjs
//
// Tests for the OodaWager type foundation (PR-A). Pure module: every case is
// built from in-memory literals — no filesystem, network, or store mocks.
//
// Invariants proving the fail-safe doctrine:
//   INV-W1: no operating line              → requires_ceo_click
//   INV-W2: irreversible                   → requires_ceo_click at best;
//           blocked when no line allows proposing it
//   INV-W3: no kill criteria               → blocked (not a wager)
//   INV-W4: malformed confidence or stake  → blocked
//   INV-W5: zero-trust line                → nothing is within_line
//   INV-W6: unknown/terminal transitions   → refused
//   INV-W7: settlement requires active + non-empty evidence + valid settledAt
//   INV-W8: determinism — same input, same decision; ids never random
//   INV-W9: malformed kill criteria, line limits, or active count never open
//           the gate (blocked or requires_ceo_click, never within_line)

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const NOW = "2026-07-02T12:00:00.000Z";

function stake(over = {}) {
  return {
    kind: over.kind ?? "money",
    amount: over.amount ?? 50,
    unit: over.unit ?? "CAD",
  };
}

function killCriterion(over = {}) {
  return {
    metric: over.metric ?? "loi96 replies received",
    threshold: over.threshold ?? "= 0",
    reviewBy: over.reviewBy ?? "2026-07-16T12:00:00.000Z",
  };
}

function wager(over = {}) {
  return {
    id: over.id ?? "wager:loi96-relance-batch",
    hypothesis: over.hypothesis ?? "10 relances loi96 → ≥1 booked call in 14d",
    stake: over.stake ?? stake(),
    confidence: over.confidence ?? 0.6,
    upside: over.upside ?? "1 booked call with a tier-1 target",
    reversibility: over.reversibility ?? "reversible",
    killCriteria: over.killCriteria ?? [killCriterion()],
    status: over.status ?? "proposed",
    createdAt: over.createdAt ?? NOW,
    settlement: over.settlement ?? null,
  };
}

function line(over = {}) {
  return {
    id: over.id ?? "line:test-money",
    stakeKind: over.stakeKind ?? "money",
    unit: over.unit ?? "CAD",
    maxStakePerWager: over.maxStakePerWager ?? 100,
    maxConcurrentActive: over.maxConcurrentActive ?? 3,
    allowIrreversible: over.allowIrreversible ?? false,
  };
}

test("Decision Spine — OodaWager type foundation (pure)", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: { "@": path.join(projectRoot, "src") },
  });
  const mod = await jiti.import(path.join(__dirname, "ooda-wager.ts"));
  const {
    OODA_STAGE_ORDER,
    isForwardOodaTransition,
    makeWagerId,
    canTransitionWager,
    settleWager,
    zeroTrustLine,
    evaluateWagerAgainstLine,
    buildWagerEvent,
  } = mod;

  await t.test("OODA order is observe → orient → decide → act", () => {
    assert.deepEqual(OODA_STAGE_ORDER, ["observe", "orient", "decide", "act"]);
    assert.equal(isForwardOodaTransition("observe", "orient"), true);
    assert.equal(isForwardOodaTransition("decide", "act"), true);
    assert.equal(isForwardOodaTransition("orient", "act"), false);
    assert.equal(isForwardOodaTransition("act", "observe"), false);
    assert.equal(isForwardOodaTransition("act", "act"), false);
  });

  await t.test("makeWagerId is deterministic and rejects unstable slugs", () => {
    assert.equal(makeWagerId("loi96-relance-batch"), "wager:loi96-relance-batch");
    assert.throws(() => makeWagerId("Loi96"), TypeError);
    assert.throws(() => makeWagerId("-leading"), TypeError);
    assert.throws(() => makeWagerId("space here"), TypeError);
    assert.throws(() => makeWagerId(""), TypeError);
  });

  await t.test("INV-W6: lifecycle transitions — legal path and refusals", () => {
    assert.equal(canTransitionWager("draft", "proposed"), true);
    assert.equal(canTransitionWager("proposed", "approved"), true);
    assert.equal(canTransitionWager("proposed", "rejected"), true);
    assert.equal(canTransitionWager("approved", "active"), true);
    assert.equal(canTransitionWager("active", "settled"), true);
    assert.equal(canTransitionWager("active", "void"), true);

    assert.equal(canTransitionWager("draft", "active"), false, "no skipping approval");
    assert.equal(canTransitionWager("settled", "active"), false, "settled is terminal");
    assert.equal(canTransitionWager("rejected", "approved"), false, "rejected is terminal");
    assert.equal(canTransitionWager("void", "draft"), false, "void is terminal");
    assert.equal(canTransitionWager("nonsense", "active"), false, "unknown never transitions");
  });

  await t.test("INV-W7: settlement requires active status and evidence", () => {
    const active = wager({ status: "active" });
    const settlement = { outcome: "won", settledAt: NOW, evidence: "1 call booked 2026-07-10" };

    const ok = settleWager(active, settlement);
    assert.equal(ok.ok, true);
    assert.equal(ok.wager.status, "settled");
    assert.deepEqual(ok.wager.settlement, settlement);
    assert.equal(active.status, "active", "input wager is never mutated");

    const notActive = settleWager(wager({ status: "proposed" }), settlement);
    assert.deepEqual(notActive, { ok: false, reason: "illegal_transition" });

    const noEvidence = settleWager(active, { ...settlement, evidence: "   " });
    assert.deepEqual(noEvidence, { ok: false, reason: "missing_evidence" });

    for (const settledAt of [
      "",
      "   ",
      "not-a-date",
      "July 5, 2026",
      "2026-02-31T00:00:00.000Z",
      "2026-07-16T12:00:00Z",
      "2026-07-16",
    ]) {
      const badTimestamp = settleWager(active, { ...settlement, settledAt });
      assert.deepEqual(
        badTimestamp,
        { ok: false, reason: "invalid_settled_at" },
        `settledAt ${JSON.stringify(settledAt)}`,
      );
    }

    for (const outcome of ["draw", "WON", "", "cancelled"]) {
      const badOutcome = settleWager(active, { ...settlement, outcome });
      assert.deepEqual(
        badOutcome,
        { ok: false, reason: "invalid_outcome" },
        `outcome ${JSON.stringify(outcome)}`,
      );
    }
  });

  await t.test("INV-W1: no operating line → requires_ceo_click", () => {
    const d = evaluateWagerAgainstLine(wager(), null, { activeWagerCount: 0 });
    assert.equal(d.outcome, "requires_ceo_click");
    assert.equal(d.reason, "no_operating_line");
  });

  await t.test("INV-W2: irreversible routes to CEO; blocked without a permitting line", () => {
    const irr = wager({ reversibility: "irreversible" });

    const noLine = evaluateWagerAgainstLine(irr, null, { activeWagerCount: 0 });
    assert.equal(noLine.outcome, "blocked");
    assert.equal(noLine.reason, "irreversible_blocked_by_line");

    const forbidding = evaluateWagerAgainstLine(irr, line({ allowIrreversible: false }), {
      activeWagerCount: 0,
    });
    assert.equal(forbidding.outcome, "blocked");

    const permitting = evaluateWagerAgainstLine(irr, line({ allowIrreversible: true }), {
      activeWagerCount: 0,
    });
    assert.equal(permitting.outcome, "requires_ceo_click");
    assert.equal(permitting.reason, "irreversible_requires_ceo");
  });

  await t.test("INV-W3: no kill criteria → blocked", () => {
    const d = evaluateWagerAgainstLine(wager({ killCriteria: [] }), line(), {
      activeWagerCount: 0,
    });
    assert.equal(d.outcome, "blocked");
    assert.equal(d.reason, "no_kill_criteria");
  });

  await t.test("INV-W9: blank or malformed kill criteria → blocked", () => {
    for (const bad of [
      killCriterion({ metric: "   " }),
      killCriterion({ metric: "" }),
      killCriterion({ threshold: "   " }),
      killCriterion({ reviewBy: "" }),
      killCriterion({ reviewBy: "   " }),
      killCriterion({ reviewBy: "not-a-date" }),
      killCriterion({ reviewBy: "July 5, 2026" }),
      killCriterion({ reviewBy: "2026-02-31T00:00:00.000Z" }),
      killCriterion({ reviewBy: "2026-07-16T12:00:00Z" }),
    ]) {
      const d = evaluateWagerAgainstLine(wager({ killCriteria: [bad] }), line(), {
        activeWagerCount: 0,
      });
      assert.equal(d.outcome, "blocked", JSON.stringify(bad));
      assert.equal(d.reason, "malformed_kill_criteria");
    }

    const oneBadAmongValid = evaluateWagerAgainstLine(
      wager({ killCriteria: [killCriterion(), killCriterion({ metric: " " })] }),
      line(),
      { activeWagerCount: 0 },
    );
    assert.equal(oneBadAmongValid.outcome, "blocked", "one blank criterion taints the wager");
    assert.equal(oneBadAmongValid.reason, "malformed_kill_criteria");
  });

  await t.test("INV-W9: malformed operating-line limits escalate to CEO, never within_line", () => {
    for (const bad of [
      line({ maxStakePerWager: Number.NaN }),
      line({ maxStakePerWager: Number.POSITIVE_INFINITY }),
      line({ maxStakePerWager: -1 }),
      line({ maxConcurrentActive: Number.NaN }),
      line({ maxConcurrentActive: Number.POSITIVE_INFINITY }),
      line({ maxConcurrentActive: -2 }),
      line({ maxConcurrentActive: 0.5 }),
      line({ unit: "" }),
      line({ unit: "   " }),
    ]) {
      const d = evaluateWagerAgainstLine(wager(), bad, { activeWagerCount: 0 });
      assert.equal(d.outcome, "requires_ceo_click", JSON.stringify(bad));
      assert.equal(d.reason, "malformed_line");
    }
  });

  await t.test("INV-W9: blank stake unit → blocked, even when the line unit is also blank", () => {
    const blankUnit = evaluateWagerAgainstLine(
      wager({ stake: stake({ unit: "   " }) }),
      line(),
      { activeWagerCount: 0 },
    );
    assert.equal(blankUnit.outcome, "blocked");
    assert.equal(blankUnit.reason, "invalid_stake");

    const bothBlank = evaluateWagerAgainstLine(
      wager({ stake: stake({ unit: "" }) }),
      line({ unit: "" }),
      { activeWagerCount: 0 },
    );
    assert.equal(bothBlank.outcome, "blocked", "blank-on-blank must never reach within_line");
    assert.equal(bothBlank.reason, "invalid_stake");
  });

  await t.test("INV-W9: unknown reversibility → blocked", () => {
    for (const reversibility of ["permanent", "irreversible ", "REVERSIBLE", "", "unknown"]) {
      const d = evaluateWagerAgainstLine(wager({ reversibility }), line(), {
        activeWagerCount: 0,
      });
      assert.equal(d.outcome, "blocked", `reversibility ${JSON.stringify(reversibility)}`);
      assert.equal(d.reason, "invalid_reversibility");
    }
  });

  await t.test("INV-W9: malformed active-count context escalates to CEO", () => {
    for (const activeWagerCount of [Number.NaN, -1, Number.POSITIVE_INFINITY, -0.0001]) {
      const d = evaluateWagerAgainstLine(wager(), line(), { activeWagerCount });
      assert.equal(d.outcome, "requires_ceo_click", `activeWagerCount ${activeWagerCount}`);
      assert.equal(d.reason, "invalid_active_count");
    }
  });

  await t.test("INV-W4: malformed confidence or stake → blocked", () => {
    for (const confidence of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const d = evaluateWagerAgainstLine(wager({ confidence }), line(), { activeWagerCount: 0 });
      assert.equal(d.outcome, "blocked", `confidence ${confidence}`);
      assert.equal(d.reason, "invalid_confidence");
    }
    for (const amount of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const d = evaluateWagerAgainstLine(wager({ stake: stake({ amount }) }), line(), {
        activeWagerCount: 0,
      });
      assert.equal(d.outcome, "blocked", `amount ${amount}`);
      assert.equal(d.reason, "invalid_stake");
    }
  });

  await t.test("line limits: kind, unit, stake, concurrency each escalate to CEO", () => {
    const kind = evaluateWagerAgainstLine(
      wager({ stake: stake({ kind: "time", unit: "hours" }) }),
      line(),
      { activeWagerCount: 0 },
    );
    assert.equal(kind.reason, "stake_kind_mismatch");
    assert.equal(kind.outcome, "requires_ceo_click");

    const unit = evaluateWagerAgainstLine(wager({ stake: stake({ unit: "USD" }) }), line(), {
      activeWagerCount: 0,
    });
    assert.equal(unit.reason, "stake_unit_mismatch");

    const over = evaluateWagerAgainstLine(wager({ stake: stake({ amount: 101 }) }), line(), {
      activeWagerCount: 0,
    });
    assert.equal(over.reason, "stake_over_line");

    const crowded = evaluateWagerAgainstLine(wager(), line(), { activeWagerCount: 3 });
    assert.equal(crowded.reason, "concurrency_over_line");
    assert.equal(crowded.outcome, "requires_ceo_click");
  });

  await t.test("nominal: reversible wager inside its line is within_line", () => {
    const d = evaluateWagerAgainstLine(wager(), line(), { activeWagerCount: 2 });
    assert.equal(d.outcome, "within_line");
    assert.equal(d.reason, "within_line");
    assert.match(d.detail, /Sentinelle/);
  });

  await t.test("zeroTrustLine ids never collide across stake kinds or units", () => {
    assert.equal(zeroTrustLine("money", "CAD").id, "line:zero-trust:money:CAD");
    assert.equal(zeroTrustLine("time", "hours").id, "line:zero-trust:time:hours");
    assert.notEqual(zeroTrustLine("money", "CAD").id, zeroTrustLine("money", "USD").id);
    assert.notEqual(zeroTrustLine("money", "CAD").id, zeroTrustLine("time", "CAD").id);
  });

  await t.test("INV-W5: zero-trust line lets nothing through", () => {
    const zt = zeroTrustLine("money", "CAD");
    assert.equal(zt.maxStakePerWager, 0);
    assert.equal(zt.maxConcurrentActive, 0);
    assert.equal(zt.allowIrreversible, false);

    const anyStake = evaluateWagerAgainstLine(wager({ stake: stake({ amount: 1 }) }), zt, {
      activeWagerCount: 0,
    });
    assert.equal(anyStake.outcome, "requires_ceo_click");

    const zeroStake = evaluateWagerAgainstLine(wager({ stake: stake({ amount: 0 }) }), zt, {
      activeWagerCount: 0,
    });
    assert.equal(zeroStake.outcome, "requires_ceo_click", "concurrency cap 0 still escalates");
    assert.equal(zeroStake.reason, "concurrency_over_line");
  });

  await t.test("INV-W8: determinism — same input, identical decision", () => {
    const input = wager({ stake: stake({ amount: 99 }) });
    const first = evaluateWagerAgainstLine(input, line(), { activeWagerCount: 1 });
    const second = evaluateWagerAgainstLine(input, line(), { activeWagerCount: 1 });
    assert.deepEqual(first, second);
  });

  await t.test("buildWagerEvent is a pure provenance constructor", () => {
    const evt = buildWagerEvent("wager:x", "wager.settled", NOW, "settled won");
    assert.deepEqual(evt, {
      wagerId: "wager:x",
      type: "wager.settled",
      at: NOW,
      detail: "settled won",
    });
  });
});
