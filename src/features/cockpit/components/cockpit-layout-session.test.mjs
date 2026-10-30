import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { fsCache: false });
const s = await jiti.import("./cockpit-layout-session.ts");
const { defaultCockpitOrder } = await jiti.import("../cockpit-layout-contract.ts");
const order = defaultCockpitOrder(), changed = [...order].reverse(), revision = "2026-10-29T15:00:00.000Z";
const ready = () => s.initialLayoutSession({ status: "loaded", order, revision });

test("failed initial read displays provisional order but cannot save/overwrite existing layout", () => {
  for (const status of ["failed", "forbidden", "unavailable"]) {
    const state = s.initialLayoutSession({ status }); assert.equal(s.canSaveCockpitLayout(state), false); assert.equal(s.beginLayoutSave(state, changed), null);
  }
});
test("single changed drop binds revision; pending, unchanged and invalid moves cannot resubmit", () => {
  const before = ready(), begin = s.beginLayoutSave(before, changed);
  assert.deepEqual(begin.request, { order: changed, expectedRevision: revision }); assert.deepEqual(before.order, order);
  assert.equal(s.beginLayoutSave(begin.state, order), null); assert.equal(s.beginLayoutSave(before, order), null); assert.equal(s.beginLayoutSave(before, ["modes"]), null);
});
test("only exact validated write ACK confirms; void/malformed/mismatched ACK locks future writes", () => {
  const pending = s.beginLayoutSave(ready(), changed).state;
  const confirmed = s.settleLayoutSave(pending, { status: "confirmed", order: changed, revision });
  assert.equal(confirmed.status, "confirmed"); assert.equal(s.canSaveCockpitLayout(confirmed), true);
  for (const result of [undefined, { status: "unconfirmed" }, { status: "confirmed", order, revision }, { status: "confirmed", order: changed, revision: "bad" }]) {
    const state = s.settleLayoutSave(pending, result); assert.equal(state.status, "unconfirmed"); assert.deepEqual(state.order, changed); assert.equal(s.beginLayoutSave(state, order), null);
  }
});
test("known no-effect and conflict are distinct, neither automatically retries", () => {
  const pending = s.beginLayoutSave(ready(), changed).state;
  for (const status of ["not_attempted", "conflict"]) {
    const state = s.settleLayoutSave(pending, { status, reason: "read_failed" }); assert.equal(state.status, status); assert.deepEqual(state.order, changed); assert.equal(s.canSaveCockpitLayout(state), false);
  }
});
test("failed explicit reload preserves local order and lock, never substitutes DEFAULT_ORDER", () => {
  const pending = s.beginLayoutSave(ready(), changed).state;
  const unknown = s.settleLayoutSave(pending, { status: "unconfirmed" });
  const failed = s.settleLayoutReload({ ...unknown, status: "reloading" }, { status: "failed" });
  assert.deepEqual(failed.order, changed); assert.equal(failed.status, "read_failed"); assert.equal(s.canSaveCockpitLayout(failed), false);
});
test("explicit successful reload replaces local draft without issuing a write and retains focusable reload UI state", () => {
  const unknown = s.settleLayoutSave(s.beginLayoutSave(ready(), changed).state, { status: "unconfirmed" });
  const loaded = s.settleLayoutReload(unknown, { status: "loaded", order, revision }); assert.deepEqual(loaded.order, order); assert.equal(loaded.status, "reloaded"); assert.equal(s.canSaveCockpitLayout(loaded), true);
  const missing = s.settleLayoutReload(unknown, { status: "missing", order, revision: null });
  assert.equal(s.beginLayoutSave(missing, changed).request.expectedRevision, null);
  assert.match(s.layoutStatusMessage(missing), /^Aucun ordre enregistré/);
  assert.doesNotMatch(s.layoutStatusMessage(missing), /enregistré rechargé/);
});
test("a late save result cannot replace an already settled/reloaded state", () => {
  const state = { ...ready(), status: "reloaded" }; assert.equal(s.settleLayoutSave(state, { status: "confirmed", order: changed, revision }), state);
});
