/**
 * mission-persistence-flag.test.mjs
 *
 * The durable mission-draft flag must default OFF and only enable on an explicit
 * recognized truthy value. OFF keeps the current local-only draft behavior.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const { isDurableMissionDraftEnabled, MISSION_DURABLE_DRAFTS_ENV } = await import(
  "./mission-persistence-flag.ts"
);

test("defaults OFF when the toggle is unset", () => {
  assert.equal(isDurableMissionDraftEnabled({}), false);
});

test("OFF for empty / unknown / falsey values", () => {
  for (const v of ["", "0", "false", "off", "no", " ", "enabled?"]) {
    assert.equal(isDurableMissionDraftEnabled({ [MISSION_DURABLE_DRAFTS_ENV]: v }), false, v);
  }
});

test("ON only for recognized truthy values (case/space-insensitive)", () => {
  for (const v of ["1", "true", "on", "yes", "TRUE", " On ", "YES"]) {
    assert.equal(isDurableMissionDraftEnabled({ [MISSION_DURABLE_DRAFTS_ENV]: v }), true, v);
  }
});

test("reads process.env by default — OFF in the test environment", () => {
  assert.equal(isDurableMissionDraftEnabled(), false);
});
