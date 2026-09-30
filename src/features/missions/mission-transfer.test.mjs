import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const { missionTransferState, parseTransferResponse, transferMission } = await createJiti(import.meta.url).import("./mission-transfer.ts");
const mission = { id: "synthetic", status: "draft", updatedAt: "2026-09-29T00:00:00Z", input: {} };
const id = "11111111-1111-4111-8111-111111111111";
const validReceipt = { version: 1, state: "linked", companyId: id, remoteIssueId: id, correlationKey: `hq-mission-${"a".repeat(64)}`, payloadHash: "b".repeat(64), actorId: "owner", reservedAt: "2026-09-29T00:00:00Z" };
test("only persisted enabled unreserved missions offer transfer", () => {
  assert.equal(missionTransferState(mission, "supabase", true).kind, "available");
  for (const source of ["local", "mock"]) assert.equal(missionTransferState(mission, source, true).kind, "unavailable");
  assert.equal(missionTransferState(mission, "supabase", false).kind, "unavailable");
  assert.equal(missionTransferState({ ...mission, status: "running" }, "supabase", true).kind, "unavailable");
});
test("stored receipts disable resend even when malformed or still reserved", () => {
  for (const receipt of [null, {}, { state: "reserved" }, { state: "outcome_unknown" }, { state: "linked", remoteIssueId: "bad" }]) assert.equal(missionTransferState({ ...mission, input: { _paperclipDispatch: receipt } }, "supabase", true).kind, "reconcile");
  const linked = missionTransferState({ ...mission, input: { _paperclipDispatch: validReceipt } }, "supabase", false);
  assert.equal(linked.kind, "linked"); assert.equal(linked.remoteIssueId, id); assert.match(linked.message, /ne prouve/);
});
test("malformed success, unknown outcome and network loss require reconciliation", async () => {
  assert.equal(parseTransferResponse(201, {}).kind, "reconcile");
  assert.equal(parseTransferResponse(503, { reconciliationRequired: true }).kind, "reconcile");
  const lost = await transferMission(mission, new AbortController().signal, async () => { throw new Error("private upstream"); });
  assert.equal(lost.kind, "reconcile"); assert.ok(!lost.message.includes("private"));
});
test("receipt version and company must validate before showing a link", () => {
  for (const patch of [{ version: undefined }, { version: 2 }, { companyId: undefined }, { companyId: "foreign-invalid" }]) {
    const receipt = { ...validReceipt, ...patch };
    assert.equal(parseTransferResponse(201, { status: "linked", receipt }).kind, "reconcile");
    assert.equal(missionTransferState({ ...mission, input: { _paperclipDispatch: receipt } }, "supabase", true).kind, "reconcile");
  }
});
test("only known failures without effects allow refresh to release the form", () => {
  for (const status of [400, 401, 403, 404, 422]) assert.equal(parseTransferResponse(status, {}).kind, "error");
  assert.equal(parseTransferResponse(409, { status: "mission_changed" }).kind, "error");
  for (const body of [{ status: "reservation_conflict" }, { status: "reconciliation_required" }, {}]) assert.equal(parseTransferResponse(409, body).kind, "reconcile");
  assert.equal(parseTransferResponse(503, {}).kind, "reconcile");
});
test("auth failures and disabled state are honest, audit failure remains visible", () => {
  assert.equal(parseTransferResponse(401, null).kind, "error");
  assert.match(parseTransferResponse(503, { status: "dispatch_disabled" }).message, /Aucun envoi/);
  const linked = parseTransferResponse(201, { status: "linked", receipt: validReceipt, auditRecorded: false });
  assert.equal(linked.kind, "linked"); assert.match(linked.message, /journal final/);
});
test("one fixed POST contains only explicit mission revision and confirmation", async () => {
  let calls = 0;
  const result = await transferMission(mission, new AbortController().signal, async (url, options) => {
    calls++; assert.equal(url, "/api/orchestration/missions/dispatch"); assert.equal(options.method, "POST"); assert.equal(options.credentials, "same-origin"); assert.equal(options.redirect, "error");
    assert.deepEqual(JSON.parse(options.body), { missionId: mission.id, expectedUpdatedAt: mission.updatedAt, confirm: true });
    return Response.json({ status: "linked", receipt: validReceipt }, { status: 201 });
  }); assert.equal(calls, 1); assert.equal(result.kind, "linked");
});
