#!/usr/bin/env node

// src/features/cockpit/joris-presence-state.test.mjs
//
// The presence signal tells the owner whether the workspace is in hand or
// drifting. A wrong "calm" is the expensive failure — it says "there is a
// plan" when there is none — so precedence and the staleness boundary are
// pinned here rather than trusted.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const { derivePresenceState, STALE_THRESHOLD_MS } = await jiti.import(
  path.join(__dirname, "joris-presence-state.ts"),
);

const NOW = Date.parse("2026-08-06T12:00:00.000Z");
const agoMs = (ms) => new Date(NOW - ms).toISOString();

const base = {
  ideas: [],
  todayDirection: null,
  loadError: false,
  nowMs: NOW,
};

test("Joris presence — a broken read never reports good news", async (t) => {
  await t.test("a load error outranks everything else", () => {
    // The dangerous case: an empty ideas array from a failed query looks
    // identical to a genuinely empty workspace.
    const signal = derivePresenceState({ ...base, loadError: true });
    assert.equal(signal.state, "alert");
  });

  await t.test("it outranks even a direction that did load", () => {
    const signal = derivePresenceState({
      ...base,
      loadError: true,
      todayDirection: { eventId: "evt_abcdef123456" },
      ideas: [{ recordedAt: agoMs(1000) }],
    });
    assert.equal(signal.state, "alert");
  });
});

test("Joris presence — calm requires an actual plan", async (t) => {
  await t.test("today's direction is what makes it calm", () => {
    const signal = derivePresenceState({
      ...base,
      todayDirection: { eventId: "evt_abcdef123456" },
    });

    assert.equal(signal.state, "calm");
    assert.match(signal.detail, /evt_abcd/, "the detail cites the event that proves it");
  });

  await t.test("pending ideas do not downgrade an existing direction", () => {
    const signal = derivePresenceState({
      ...base,
      todayDirection: { eventId: "evt_abcdef123456" },
      ideas: [{ recordedAt: agoMs(STALE_THRESHOLD_MS * 10) }],
    });
    assert.equal(signal.state, "calm");
  });
});

test("Joris presence — the staleness boundary", async (t) => {
  await t.test("fresh ideas with no direction pulse", () => {
    const signal = derivePresenceState({ ...base, ideas: [{ recordedAt: agoMs(1000) }] });
    assert.equal(signal.state, "pulse");
  });

  await t.test("exactly at the threshold is not yet stale", () => {
    const signal = derivePresenceState({
      ...base,
      ideas: [{ recordedAt: agoMs(STALE_THRESHOLD_MS) }],
    });
    assert.equal(signal.state, "pulse", "the comparison is strictly greater-than");
  });

  await t.test("one millisecond past it flips to watch", () => {
    const signal = derivePresenceState({
      ...base,
      ideas: [{ recordedAt: agoMs(STALE_THRESHOLD_MS + 1) }],
    });
    assert.equal(signal.state, "watch");
  });

  await t.test("the newest idea decides, not the oldest", () => {
    // Reducing to the wrong extreme would mark an active workspace as stale.
    const signal = derivePresenceState({
      ...base,
      ideas: [
        { recordedAt: agoMs(STALE_THRESHOLD_MS * 5) },
        { recordedAt: agoMs(60_000) },
        { recordedAt: agoMs(STALE_THRESHOLD_MS * 3) },
      ],
    });
    assert.equal(signal.state, "pulse");
  });
});

test("Joris presence — an unreadable timestamp is not freshness", async (t) => {
  await t.test("a malformed date reads as watch, never pulse", () => {
    // NaN comparisons are false, so an unguarded subtraction would report
    // "captured just now" for a corrupt row.
    const signal = derivePresenceState({ ...base, ideas: [{ recordedAt: "pas-une-date" }] });

    assert.equal(signal.state, "watch");
    assert.match(signal.detail, /illisible/);
  });
});

test("Joris presence — the empty workspace", async (t) => {
  await t.test("nothing captured is watch, not calm", () => {
    const signal = derivePresenceState(base);

    assert.equal(signal.state, "watch");
    assert.match(signal.detail, /Aucun event/);
  });
});

test("Joris presence — every state is fully described", async (t) => {
  await t.test("label and detail are always populated", () => {
    const cases = [
      base,
      { ...base, loadError: true },
      { ...base, todayDirection: { eventId: "evt_abcdef123456" } },
      { ...base, ideas: [{ recordedAt: agoMs(1000) }] },
      { ...base, ideas: [{ recordedAt: agoMs(STALE_THRESHOLD_MS + 1) }] },
    ];

    for (const input of cases) {
      const signal = derivePresenceState(input);
      assert.ok(["calm", "pulse", "watch", "alert"].includes(signal.state));
      assert.ok(signal.label.trim().length > 0, `empty label for ${signal.state}`);
      assert.ok(signal.detail.trim().length > 0, `empty detail for ${signal.state}`);
    }
  });

  await t.test("singular and plural both read correctly", () => {
    const one = derivePresenceState({ ...base, ideas: [{ recordedAt: agoMs(1000) }] });
    const two = derivePresenceState({
      ...base,
      ideas: [{ recordedAt: agoMs(1000) }, { recordedAt: agoMs(2000) }],
    });

    assert.match(one.detail, /1 idée capturée/);
    assert.match(two.detail, /2 idées capturées/);
  });
});
