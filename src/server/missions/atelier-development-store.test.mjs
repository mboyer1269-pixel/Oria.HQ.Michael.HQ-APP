import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(process.cwd(), "src"), "server-only": path.join(process.cwd(), "src/scripts/smoke/server-only-stub.mjs") } });
const { createDevelopmentService } = await jiti.import("./development-mission.ts");
const { createAtelierDevelopmentStore, atelierDevelopmentReservationRequestTargetBytes,
  MAX_ATELIER_CAS_REQUEST_TARGET_BYTES, AtelierDevelopmentSnapshotTooLargeError } = await jiti.import("./atelier-development-store.ts");
const { buildAtelierDevelopmentBinding, ATELIER_DEVELOPMENT_KEY: KEY } = await jiti.import("./atelier-development-contract.ts");
const context = { workspaceId: "ws-a", modeId: "hq", actorId: "owner-a" };

async function fixture(letter) {
  let mission;
  await createDevelopmentService({ enabled: () => true, store: () => ({ save: async value => (mission = value), load: async () => null }) }).create({
    requestId: "12345678-1234-4234-8234-123456789abc", title: letter ? letter.repeat(200) : "One component",
    objective: letter ? letter.repeat(4000) : "Specify it", scope: letter ? letter.repeat(1000) : "Internal draft",
    acceptanceCriteria: letter ? letter.repeat(2000) : "Clear tests",
  }, context);
  mission.updatedAt = "2026-10-28T20:00:00.000Z"; mission.input.unrelated = { preserve: true }; mission.result = { existing: true };
  const request = { missionId: mission.id, repository: { relativePath: "project/app", baseSha: "a".repeat(40) },
    selection: { runtimeId: "codex", modelId: "gpt-test", catalogRevision: "fixture-1" }, timeoutMs: 60_000 };
  const claim = { version: 1, state: "reserved", runId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", reservedAt: "2026-10-28T20:00:01.000Z",
    binding: buildAtelierDevelopmentBinding(mission, context, request), executionRequested: false };
  return { mission, claim };
}
function toRow(m) { return { id: m.id, workspace_id: m.workspaceId, mode_id: m.modeId, title: m.title, objective: m.objective,
  assigned_agent_id: m.assignedAgentId, autonomy_level: m.autonomyLevel, status: m.status, risk_level: m.riskLevel,
  requires_approval: m.requiresApproval, input: m.input, result: m.result ?? null, expected_output: m.expectedOutput,
  cost_budget_cents: m.costBudgetCents ?? null, created_at: m.createdAt, updated_at: m.updatedAt, completed_at: null }; }

// PostgREST chain double: exercises filters and writes, not a real database proof.
function clientDouble(initial) {
  let row = structuredClone(initial); const calls = []; let failure = null;
  return { calls, row: () => row, mutate: fn => fn(row), fail: value => { failure = value; },
    client: { from(table) {
      const call = { table, filters: [], update: null }; calls.push(call);
      const q = { select() { return q; }, update(value) { call.update = value; return q; },
        filter(key, operator, value) { call.filters.push([operator, key, value]); return q; },
        eq(key, value) { call.filters.push(["eq", key, value]); return q; },
        is(key, value) { call.filters.push(["is", key, value]); return q; },
        async maybeSingle() {
          if (failure) return { data: null, error: failure };
          const matches = call.filters.every(([, key, value]) => ["input", "result"].includes(key) && value !== null
            ? JSON.stringify(row[key]) === value : row[key] === value);
          if (!matches) return { data: null, error: null };
          if (call.update) row = { ...row, ...structuredClone(call.update) };
          return { data: structuredClone(row), error: null };
        } }; return q;
    } },
  };
}

test("store scopes reads and reservation CAS; preserves all non-owned fields", async () => {
  const { mission, claim } = await fixture(); const db = clientDouble(toRow(mission)); const store = createAtelierDevelopmentStore(db.client);
  assert.equal(await store.load("foreign", mission.id), null);
  assert.equal((await store.load(context.workspaceId, mission.id)).id, mission.id);
  const result = await store.reserve(mission, claim); assert.equal(result.input[KEY].runId, claim.runId);
  assert.deepEqual(result.result, mission.result); assert.deepEqual(result.input.unrelated, mission.input.unrelated);
  assert.equal(result.status, "draft"); assert.equal(result.assignedAgentId, "");
  const write = db.calls.at(-1); assert.equal(write.table, "missions");
  assert.deepEqual(Object.keys(write.update).sort(), ["input", "updated_at"]);
  assert.deepEqual(write.filters.map(([, key]) => key), ["workspace_id", "id", "status", "updated_at", "input",
    "mode_id", "title", "objective", "assigned_agent_id", "autonomy_level", "requires_approval", "expected_output", "risk_level", "cost_budget_cents", "result"]);
  assert.ok(Date.parse(result.updatedAt) > Date.parse(mission.updatedAt));
});

test("concurrent input, version, status or result changes lose CAS without overwriting", async () => {
  for (const mutate of [r => { r.input.other = "new"; }, r => { r.updated_at = "2026-10-28T20:00:03.000Z"; },
    r => { r.status = "cancelled"; }, r => { r.result.concurrent = "proof"; }, r => { r.cost_budget_cents = 1; },
    r => { r.objective = "different"; }, r => { r.risk_level = "high"; }, r => { r.assigned_agent_id = "other"; }]) {
    const { mission, claim } = await fixture(); const db = clientDouble(toRow(mission)); db.mutate(mutate);
    const before = structuredClone(db.row()); assert.equal(await createAtelierDevelopmentStore(db.client).reserve(mission, claim), null);
    assert.deepEqual(db.row(), before);
  }
});

test("null result uses is-null CAS; malformed/already-reserved claims never issue a write", async () => {
  const { mission, claim } = await fixture(); delete mission.result;
  const db = clientDouble(toRow(mission)); const store = createAtelierDevelopmentStore(db.client);
  assert.ok(await store.reserve(mission, claim)); assert.deepEqual(db.calls.at(-1).filters.at(-1), ["is", "result", null]);
  const before = db.calls.length;
  await assert.rejects(() => store.reserve(mission, { ...claim, executionRequested: true }), /claim_invalid/);
  await assert.rejects(() => store.reserve({ ...mission, input: { ...mission.input, [KEY]: claim } }, claim), /claim_invalid/);
  assert.equal(db.calls.length, before);
});

test("missing client has no fallback; database errors are surfaced as unknown rather than success", async () => {
  assert.equal(createAtelierDevelopmentStore(null), null);
  const { mission, claim } = await fixture(); const db = clientDouble(toRow(mission)); db.fail({ message: "offline" });
  const store = createAtelierDevelopmentStore(db.client);
  await assert.rejects(() => store.load(context.workspaceId, mission.id), /store_unavailable/);
  await assert.rejects(() => store.reserve(mission, claim), /reservation_unknown/);
});

test("request-target preflight matches installed SDK encoding offline, including multibyte input", async () => {
  const { mission, claim } = await fixture(); mission.input.note = "é漢字 +&?";
  let observedUrl;
  const client = createClient("https://offline.invalid", "offline-test-key", { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async url => { observedUrl = new URL(String(url)); return new Response("[]", { status: 200, headers: { "content-type": "application/json" } }); } } });
  assert.equal(await createAtelierDevelopmentStore(client).reserve(mission, claim), null);
  assert.equal(atelierDevelopmentReservationRequestTargetBytes(mission), Buffer.byteLength(observedUrl.pathname + observedUrl.search));
  assert.ok(observedUrl.search.includes("%E6%BC%A2"));
});

test("maximum valid ASCII/CJK sources and oversized existing evidence fail before constructing a mutation", async () => {
  for (const letter of ["A", "漢"]) {
    const { mission, claim } = await fixture(letter); assert.ok(mission, "source is accepted by development mission schema");
    const db = clientDouble(toRow(mission));
    assert.ok(atelierDevelopmentReservationRequestTargetBytes(mission) > MAX_ATELIER_CAS_REQUEST_TARGET_BYTES);
    await assert.rejects(() => createAtelierDevelopmentStore(db.client).reserve(mission, claim), error =>
      error instanceof AtelierDevelopmentSnapshotTooLargeError && error.reservationAttempted === false
      && error.requestTargetBytes > error.maxRequestTargetBytes);
    assert.equal(db.calls.length, 0);
  }
  const { mission, claim } = await fixture(); mission.result.existing = "漢".repeat(1000);
  const db = clientDouble(toRow(mission));
  await assert.rejects(() => createAtelierDevelopmentStore(db.client).reserve(mission, claim), /snapshot_too_large/);
  assert.equal(db.calls.length, 0);
});
