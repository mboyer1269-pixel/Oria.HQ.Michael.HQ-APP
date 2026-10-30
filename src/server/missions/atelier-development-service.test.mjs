import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(process.cwd(), "src"), "server-only": path.join(process.cwd(), "src/scripts/smoke/server-only-stub.mjs") } });
const { createDevelopmentService } = await jiti.import("./development-mission.ts");
const { createAtelierDevelopmentService } = await jiti.import("./atelier-development-service.ts");
const { ATELIER_DEVELOPMENT_KEY: KEY } = await jiti.import("./atelier-development-contract.ts");
const { createAtelierDevelopmentStore } = await jiti.import("./atelier-development-store.ts");
const context = { workspaceId: "ws-a", modeId: "hq", actorId: "owner-a" };

// SIMULATED persistence: no database, credentials, CLI, process, filesystem, or provider call.
async function harness() {
  let row;
  await createDevelopmentService({ enabled: () => true, store: () => ({ save: async value => (row = structuredClone(value)), load: async () => null }) }).create({
    requestId: "12345678-1234-4234-8234-123456789abc", title: "One component", objective: "Specify it", scope: "Internal draft", acceptanceCriteria: "Clear tests",
  }, context);
  row.updatedAt = "2026-10-28T20:00:00.000Z";
  row.input._paperclipDispatch = { state: "linked", issueId: "existing" };
  row.input._openhandsLaunch = { state: "unrelated_fixture" };
  row.result = { otherEvidence: "preserve" };
  const counts = { reserve: 0, load: 0, wins: 0 };
  const store = {
    load: async (workspaceId, id) => { counts.load++; return row?.id === id && row.workspaceId === workspaceId ? structuredClone(row) : null; },
    reserve: async (expected, claim) => {
      counts.reserve++;
      if (!isDeepStrictEqual(row, expected)) return null;
      counts.wins++; row = { ...row, input: { ...row.input, [KEY]: structuredClone(claim) }, updatedAt: "2026-10-28T20:00:01.000Z" };
      return structuredClone(row);
    },
  };
  const deps = { enabled: () => true, store: () => store, now: () => Date.parse("2026-10-28T20:00:01.000Z") };
  const request = { missionId: row.id, repository: { relativePath: "project/app", baseSha: "a".repeat(40) },
    selection: { runtimeId: "codex", modelId: "gpt-test", catalogRevision: "fixture-1" }, timeoutMs: 60_000 };
  return { store, deps, request, counts, service: createAtelierDevelopmentService(deps), row: () => row,
    mutate: fn => fn(row), replace: value => { row = value; } };
}
async function prepared(h) {
  const receipt = await h.service.prepare(context, h.request);
  assert.equal(receipt.status, "prepared"); return { expectedBindingHash: receipt.binding.bindingHash };
}
function neverExecutes(receipt) { assert.equal(receipt.executionRequested, false); assert.equal(receipt.externalEffectAllowed, false); }

test("prepare is read-only; reserve changes no mission status, assignment, approval, or other evidence", async () => {
  const h = await harness(); const before = structuredClone(h.row());
  const confirmation = await prepared(h);
  assert.deepEqual(h.row(), before); assert.equal(h.counts.reserve, 0);
  const receipt = await h.service.reserve(context, h.request, confirmation);
  assert.equal(receipt.status, "reserved"); assert.equal(receipt.source, "created"); neverExecutes(receipt);
  const after = h.row();
  for (const key of ["status", "assignedAgentId", "autonomyLevel", "requiresApproval", "result"]) assert.deepEqual(after[key], before[key]);
  assert.deepEqual(after.input._paperclipDispatch, before.input._paperclipDispatch);
  assert.deepEqual(after.input._openhandsLaunch, before.input._openhandsLaunch);
});

test("same request returns canonical run across service reconstruction; never reserves twice", async () => {
  const h = await harness(); const confirmation = await prepared(h);
  const first = await h.service.reserve(context, h.request, confirmation);
  const second = await createAtelierDevelopmentService(h.deps).reserve(context, h.request, confirmation);
  assert.equal(second.status, "reserved"); assert.equal(second.source, "existing");
  assert.equal(first.claim.runId, second.claim.runId); assert.equal(h.counts.reserve, 1);
  const lookup = await createAtelierDevelopmentService(h.deps).lookup(context, h.request.missionId);
  assert.equal(lookup.claim.runId, first.claim.runId); neverExecutes(lookup);
});

test("two simultaneous callers admit one reservation and both recover its run ID", async () => {
  const h = await harness(); const confirmation = await prepared(h);
  const results = await Promise.all([h.service.reserve(context, h.request, confirmation), h.service.reserve(context, h.request, confirmation)]);
  assert.ok(results.every(r => r.status === "reserved"));
  assert.equal(results[0].claim.runId, results[1].claim.runId); assert.equal(h.counts.wins, 1);
});

test("lost response after CAS recovers existing claim with one write attempt", async () => {
  const h = await harness(); const confirmation = await prepared(h); const write = h.store.reserve;
  h.store.reserve = async (...args) => { await write(...args); throw Error("response lost"); };
  const result = await h.service.reserve(context, h.request, confirmation);
  assert.equal(result.status, "reserved"); assert.equal(result.source, "recovered"); assert.equal(h.counts.reserve, 1); neverExecutes(result);
});

test("unknown write outcome and failed reread never retry or pretend failure is safe to relaunch", async () => {
  for (const failRead of [false, true]) {
    const h = await harness(); const confirmation = await prepared(h); let attempts = 0;
    h.store.reserve = async () => { attempts++; if (failRead) h.store.load = async () => { throw Error("offline"); }; throw Error("write unknown"); };
    const result = await h.service.reserve(context, h.request, confirmation);
    assert.equal(result.status, "reconciliation_required"); assert.equal(attempts, 1); neverExecutes(result);
  }
});

test("configuration or canonical source changed after prepare is refused", async () => {
  const h = await harness(); const confirmation = await prepared(h);
  assert.equal((await h.service.reserve(context, { ...h.request, timeoutMs: 120_000 }, confirmation)).status, "conflict");
  h.mutate(row => { row.costBudgetCents = 0; });
  assert.equal((await h.service.reserve(context, h.request, confirmation)).status, "conflict"); assert.equal(h.counts.reserve, 0);
});

test("existing claim cannot be rebound to another model or source", async () => {
  const h = await harness(); const confirmation = await prepared(h); await h.service.reserve(context, h.request, confirmation);
  const changed = { ...h.request, selection: { ...h.request.selection, modelId: "other" } };
  assert.equal((await h.service.prepare(context, changed)).status, "conflict");
  assert.equal((await h.service.reserve(context, changed, confirmation)).status, "conflict");
  h.mutate(row => { row.objective = "different"; });
  assert.equal((await h.service.lookup(context, h.request.missionId)).status, "conflict"); assert.equal(h.counts.reserve, 1);
});

test("workspace and mode isolation, actor mismatch, and malformed requests never write", async () => {
  const h = await harness(); const confirmation = await prepared(h);
  for (const key of ["workspaceId", "modeId"])
    assert.equal((await h.service.reserve({ ...context, [key]: "other" }, h.request, confirmation)).status, "not_found");
  assert.equal((await h.service.reserve({ ...context, actorId: "other" }, h.request, confirmation)).status, "ineligible_mission");
  assert.equal((await h.service.reserve(context, { ...h.request, workspaceId: "other" }, confirmation)).status, "invalid_request");
  assert.equal((await h.service.reserve(context, h.request, { ...confirmation, approved: true })).status, "invalid_request");
  assert.equal(h.counts.reserve, 0);
});

test("disabled or absent durable store has no memory fallback", async () => {
  const h = await harness();
  for (const [deps, expected] of [[{ enabled: () => false, store: () => { throw Error("must not load"); } }, "disabled"],
    [{ enabled: () => true, store: () => null }, "unavailable"]]) {
    const service = createAtelierDevelopmentService(deps);
    assert.equal((await service.prepare(context, h.request)).status, expected);
    assert.equal((await service.lookup(context, h.request.missionId)).status, expected);
  }
});

test("malformed stored claim remains reconciliation-required, never overwritten", async () => {
  const h = await harness(); const confirmation = await prepared(h);
  h.mutate(row => { row.input[KEY] = { state: "running", arbitrary: true }; });
  for (const result of [await h.service.prepare(context, h.request), await h.service.reserve(context, h.request, confirmation), await h.service.lookup(context, h.request.missionId)])
    assert.equal(result.status, "reconciliation_required");
  assert.equal(h.counts.reserve, 0);
});

test("CAS conflict with unrelated concurrent evidence preserves it and does not loop", async () => {
  const h = await harness(); const confirmation = await prepared(h); const write = h.store.reserve;
  h.store.reserve = async (...args) => { h.mutate(row => { row.result.newEvidence = "concurrent"; }); return write(...args); };
  const result = await h.service.reserve(context, h.request, confirmation);
  assert.equal(result.status, "conflict"); assert.equal(h.row().result.newEvidence, "concurrent"); assert.equal(h.counts.reserve, 1);
  assert.equal(h.row().input[KEY], undefined);
});

test("oversize snapshot reports no reservation attempted and never retries or rereads", async () => {
  const h = await harness(); h.mutate(row => { row.result.large = "漢".repeat(1000); });
  const confirmation = await prepared(h);
  const adapter = createAtelierDevelopmentStore({ from() { throw Error("must not construct mutation"); } });
  h.store.reserve = adapter.reserve;
  const reads = h.counts.load;
  const result = await h.service.reserve(context, h.request, confirmation);
  assert.equal(result.status, "snapshot_too_large"); assert.equal(result.reservationAttempted, false);
  assert.ok(result.requestTargetBytes > result.maxRequestTargetBytes); neverExecutes(result);
  assert.equal(h.counts.load, reads + 1, "initial canonical read only; no outcome-unknown recovery read");
  assert.equal(h.row().input[KEY], undefined);
});
