import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { HANDOFF_TTL_MS, developmentHandoffKey, encodeDevelopmentHandoff, decodeDevelopmentHandoff, consumeDevelopmentHandoff, missionDossierHref } = await jiti.import("./development-mission-handoff.ts");
const now = 1700000000000;
const encoded = () => encodeDevelopmentHandoff("workspace-a", "  Mon objectif privé\nDeuxième ligne  ", now);

test("transfers only the user's objective, without inventing authorization or other fields", () => {
  const data = JSON.parse(encoded());
  assert.deepEqual(Object.keys(data).sort(), ["expiresAt", "objective", "version", "workspaceId"]);
  assert.equal(decodeDevelopmentHandoff(encoded(), "workspace-a", now), "Mon objectif privé\nDeuxième ligne");
});
test("bounds objective and rejects blank or oversized text", () => {
  assert.equal(encodeDevelopmentHandoff("a", " ", now), null);
  assert.equal(encodeDevelopmentHandoff("a", "x".repeat(4001), now), null);
  assert.ok(encodeDevelopmentHandoff("a", "x".repeat(4000), now));
});
test("rejects expiry, future expiry beyond TTL, wrong version and workspace", () => {
  assert.equal(decodeDevelopmentHandoff(encoded(), "workspace-b", now), null);
  assert.equal(decodeDevelopmentHandoff(encoded(), "workspace-a", now + HANDOFF_TTL_MS), null);
  for (const patch of [{ version: 2 }, { expiresAt: now + HANDOFF_TTL_MS + 1 }, { objective: " " }, { approved: true }]) {
    assert.equal(decodeDevelopmentHandoff(JSON.stringify({ ...JSON.parse(encoded()), ...patch }), "workspace-a", now), null);
  }
});
test("rejects malformed, oversized and structurally invalid stored values", () => {
  for (const raw of [null, "{", "null", "[]", "\"text\"", "x".repeat(25001), "{}"]) {
    assert.equal(decodeDevelopmentHandoff(raw, "workspace-a", now), null);
  }
});
test("consumption is one-shot and never consumes another workspace's handoff", () => {
  const entries = new Map([[developmentHandoffKey("workspace-a"), encoded()]]);
  const storage = { getItem: key => entries.get(key) ?? null, removeItem: key => entries.delete(key) };
  assert.deepEqual(consumeDevelopmentHandoff(storage, "workspace-b", now), { status: "absent" });
  assert.equal(entries.size, 1);
  assert.equal(consumeDevelopmentHandoff(storage, "workspace-a", now).status, "ready");
  assert.deepEqual(consumeDevelopmentHandoff(storage, "workspace-a", now), { status: "absent" });
  assert.equal(entries.size, 0);
});
test("invalid/expired transfers are discarded, unavailable storage never reports success", () => {
  const entries = new Map([[developmentHandoffKey("workspace-a"), encoded()]]);
  const storage = { getItem: key => entries.get(key) ?? null, removeItem: key => entries.delete(key) };
  assert.deepEqual(consumeDevelopmentHandoff(storage, "workspace-a", now + HANDOFF_TTL_MS), { status: "invalid" });
  assert.equal(entries.size, 0);
  assert.throws(() => consumeDevelopmentHandoff({ getItem: () => encoded(), removeItem: () => { throw Error("storage unavailable"); } }, "workspace-a", now));
});
test("dossier URLs carry only a returned mission ID and reject arbitrary URL content", () => {
  const id = "6f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d";
  assert.equal(missionDossierHref(id), `/hq/missions?mission=${id}#requested-mission`);
  assert.ok(missionDossierHref("mission_ceo_brief_2026_05_21"));
  for (const value of [undefined, null, {}, [id], "", "javascript:alert(1)", "x&workspace=other", "x#test", "x".repeat(161)]) {
    assert.equal(missionDossierHref(value), null);
  }
});
