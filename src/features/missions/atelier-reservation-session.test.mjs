import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@": join(process.cwd(), "src"),
  "server-only": join(process.cwd(), "src/scripts/smoke/server-only-stub.mjs") } });
const C = await jiti.import("./atelier-reservation-session.ts");
const missionId = "77777777-7777-4777-8777-777777777777";
const runId = "88888888-8888-4888-8888-888888888888";
const scope = { workspaceId: "workspace/a b", modeId: "development", missionId, missionVersion: "2026-10-28T12:00:00Z", developmentPayloadHash: "b".repeat(64) };
const input = () => ({ missionId, repository: { relativePath: "repo/application", baseSha: "a".repeat(40) },
  selection: { runtimeId: "codex", modelId: "explicit-model", catalogRevision: "catalog-1" }, timeoutMs: 60_000 });
function binding() {
  const request = input();
  return { version: 1, workspaceId: scope.workspaceId, modeId: scope.modeId, missionId, actorId: "actual-owner",
    missionVersion: scope.missionVersion, developmentPayloadHash: "b".repeat(64), missionRiskLevel: "low",
    specialist: { agentId: "builder", skillId: "spec.draft", purpose: "instruction_profile_only" }, repository: request.repository,
    selection: request.selection, limits: { timeoutMs: request.timeoutMs, maxNewAgentSteps: 1, paidApiAllowed: false,
      externalEffectsAllowed: false, missionCostBudgetCents: null }, output: "SPEC.md", bindingHash: "c".repeat(64) };
}
const envelope = { contract: "joris-atelier-reservation/v1", executionRequested: false, externalEffectAllowed: false,
  runtimeQualified: false, reservationIsExecutionApproval: false };
const prepared = () => ({ ...envelope, status: "prepared", binding: binding() });
const claim = () => ({ version: 1, state: "reserved", runId, reservedAt: "2026-10-28T12:01:00Z", binding: binding(), executionRequested: false });
const reserved = (source = "created") => ({ ...envelope, status: "reserved", claim: claim(), source });
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function storage() {
  const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key), map };
}
const packet = () => ({ version: 1, workspaceId: scope.workspaceId, modeId: scope.modeId, request: input(), expectedBindingHash: binding().bindingHash });
function harness(fetcher, options = {}) {
  const store = options.store ?? storage(); const changes = [];
  const session = C.createAtelierReservationSession({ scope, storage: () => store, fetcher, changed: value => changes.push(value), existing: options.existing });
  session.restore(); return { session, store, changes };
}

test("typed prepare/reserve send only exact parameters, explicit hash and same workspace, never model chat", async () => {
  const calls = [];
  const fetcher = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return response(calls.length === 1 ? prepared() : reserved()); };
  const h = harness(fetcher); await h.session.prepare(input()); await h.session.reserve(false);
  assert.equal(calls.length, 1); await h.session.reserve(true); assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].body, { action: "atelier.prepare", ...input() });
  assert.deepEqual(calls[1].body, { action: "atelier.reserve", ...input(), expectedBindingHash: binding().bindingHash });
  for (const c of calls) {
    assert.equal(c.url, "/api/joris/chat?workspace=workspace%2Fa%20b");
    assert.equal(c.init.credentials, "same-origin"); assert.equal(c.init.redirect, "error");
    for (const field of ["actorId", "workspaceId", "modeId", "message", "approval", "agentId"]) assert.equal(field in c.body, false);
  }
  assert.equal(h.session.getState().result.kind, "reserved"); assert.equal(h.store.map.size, 0);
});

test("request validation rejects traversal, extra authority fields and timeout outside 1–900 seconds before fetch", async () => {
  let calls = 0; const fetcher = async () => { calls++; return response(prepared()); };
  const bad = [r => r.repository.relativePath = "../escape", r => r.repository.relativePath = "/private/repo", r => r.repository.relativePath = "repo\\app",
    r => r.timeoutMs = 999, r => r.timeoutMs = 900001, r => r.timeoutMs = 1000.5, r => r.actorId = "forged", r => r.missionId = runId];
  for (const mutate of bad) { const value = input(); mutate(value); const h = harness(fetcher); await h.session.prepare(value); assert.equal(h.session.getState().result.kind, "blocked"); }
  assert.equal(calls, 0);
  for (const timeoutMs of [1000, 900000]) assert.equal(C.atelierReservationRequestSchema.safeParse({ ...input(), timeoutMs }).success, true);
});

test("prepared response must bind scope, revision, exact request, output and all no-execution flags", async () => {
  const bad = [b => b.workspaceId = "foreign", b => b.modeId = "foreign", b => b.missionId = runId,
    b => b.missionVersion = "2026-10-28T13:00:00Z", b => b.developmentPayloadHash = "e".repeat(64), b => b.repository.baseSha = "f".repeat(40), b => b.repository.relativePath = "other",
    b => b.selection.modelId = "substitute", b => b.selection.catalogRevision = "new", b => b.limits.timeoutMs = 1000,
    b => b.limits.paidApiAllowed = true, b => b.output = "code.ts", b => b.specialist.purpose = "execution_grant"];
  for (const mutate of bad) { const body = prepared(); mutate(body.binding); assert.equal((await C.requestAtelierReservation("prepare", input(), scope, undefined, async () => response(body))).kind, "blocked"); }
  for (const key of ["executionRequested", "externalEffectAllowed", "runtimeQualified", "reservationIsExecutionApproval"]) {
    const body = prepared(); body[key] = true; assert.equal((await C.requestAtelierReservation("prepare", input(), scope, undefined, async () => response(body))).kind, "blocked");
  }
});

test("reserved responses from another hash, request or mission never unlock an uncertain confirmation", async () => {
  const mutations = [r => r.claim.binding.bindingHash = "d".repeat(64), r => r.claim.binding.missionId = runId,
    r => r.claim.binding.selection.runtimeId = "claude-code", r => r.runtimeQualified = true, r => r.claim.executionRequested = true];
  for (const mutate of mutations) { const raw = reserved(); mutate(raw); assert.equal((await C.requestAtelierReservation("reserve", input(), scope, binding().bindingHash, async () => response(raw))).kind, "uncertain"); }
  for (const source of ["created", "existing", "recovered"]) assert.equal((await C.requestAtelierReservation("reserve", input(), scope, binding().bindingHash, async () => response(reserved(source)))).kind, "reserved");
});

test("only validated subscription proposals are selectable, disabled runtimes remain unqualified proposals", async () => {
  let called;
  const option = { ...input().selection, consumptionMode: "subscription", executable: false, provider: "openai", accountId: "local-session" };
  const options = await C.loadAtelierModelProposals(scope.workspaceId, async (url, init) => { called = { url, init }; return response({ options: [{ consumptionMode: "pay_per_use_api", modelId: "paid" }, option] }); });
  assert.deepEqual(options, [{ ...input().selection, executable: false }]);
  assert.equal(called.url, "/api/joris/chat?workspace=workspace%2Fa%20b"); assert.equal(called.init.body, undefined);
  await assert.rejects(C.loadAtelierModelProposals(scope.workspaceId, async () => response({ options: [option, option] })));
  await assert.rejects(C.loadAtelierModelProposals(scope.workspaceId, async () => response({ options: [{ ...option, runtimeId: "unknown" }] })));
});

test("duplicate clicks share one in-flight request and cannot reserve until prepared", async () => {
  let calls = 0, release;
  const h = harness(async () => { calls++; return new Promise(resolve => { release = resolve; }); });
  const pending = h.session.prepare(input()); await h.session.prepare(input()); await h.session.reserve(true);
  assert.equal(calls, 1); release(response(prepared())); await pending;
  const confirmation = h.session.reserve(true); await h.session.reserve(true); assert.equal(calls, 2);
  release(response(reserved())); await confirmation;
});

test("reserve stores only a frozen recovery packet before its sole network write", async () => {
  const store = storage(); let count = 0;
  const h = harness(async () => { count++; if (count === 2) {
    const saved = [...store.map.values()][0]; assert.deepEqual(JSON.parse(saved), packet());
    assert.doesNotMatch(saved, /objective|scope|acceptanceCriteria|actual-owner|developmentPayloadHash/);
  } return response(count === 1 ? prepared() : reserved()); }, { store });
  await h.session.prepare(input());
  assert.equal(Object.isFrozen(h.session.getState().prepared.binding.repository), true);
  assert.equal(Object.isFrozen(h.session.getState().prepared.request.selection), true);
  await h.session.reserve(true); assert.equal(count, 2);
});

test("unavailable or corrupt storage prevents a reservation; no new identity or silent reset", async () => {
  let calls = 0;
  for (const store of [{ getItem() { throw Error("denied"); } }, { getItem() { return "not-json"; } }]) {
    const h = harness(async () => { calls++; }, { store }); await h.session.prepare(input()); await h.session.reserve(true);
    assert.equal(h.session.getState().storageError, true);
  }
  assert.equal(calls, 0);
  const store = storage(); store.setItem = () => { throw Error("quota"); };
  const h = harness(async () => { calls++; return response(prepared()); }, { store });
  await h.session.prepare(input()); await h.session.reserve(true); assert.equal(calls, 1); assert.equal(h.session.getState().storageError, true);
});

test("lost reserve response stays frozen and can only be reread with prepare; prepared does not prove absence", async () => {
  const calls = [];
  const h = harness(async (_, init) => { const body = JSON.parse(init.body); calls.push(body); if (body.action === "atelier.reserve") throw Error("lost after write"); return response(prepared()); });
  await h.session.prepare(input()); await h.session.reserve(true);
  assert.equal(h.session.getState().result.kind, "uncertain"); assert.ok(h.session.getState().pending);
  await h.session.reserve(true); await h.session.prepare({ ...input(), timeoutMs: 2000 }); assert.equal(calls.length, 2);
  await h.session.reconcile(); assert.equal(calls.length, 3); assert.equal(calls[2].action, "atelier.prepare");
  assert.deepEqual(calls[2], calls[0]); assert.equal(h.session.getState().result.kind, "uncertain");
  assert.equal(h.session.getState().prepared, null); assert.ok(h.session.getState().pending);
});

test("reload recovers the stored packet by a non-mutating prepare, never by replaying reserve", async () => {
  const store = storage(); store.setItem(C.atelierReservationKey(scope), JSON.stringify(packet()));
  const calls = []; const h = harness(async (_, init) => { calls.push(JSON.parse(init.body)); return response(reserved("existing")); }, { store });
  assert.equal(calls.length, 0); await h.session.reserve(true); assert.equal(calls.length, 0);
  await h.session.reconcile(); assert.equal(calls[0].action, "atelier.prepare"); assert.equal(h.session.getState().result.kind, "reserved"); assert.equal(store.map.size, 0);
});

test("a reserve conflict may follow a committed write: retain pending and forbid another confirmation", async () => {
  const calls = [];
  const h = harness(async (_, init) => { const body = JSON.parse(init.body); calls.push(body);
    return body.action === "atelier.reserve" ? response({ ...envelope, status: "conflict" }, 409) : response(prepared()); });
  await h.session.prepare(input()); await h.session.reserve(true);
  assert.equal(h.session.getState().result.kind, "uncertain"); assert.ok(h.session.getState().pending);
  assert.equal(h.store.map.size, 1);
  await h.session.reserve(true); await h.session.prepare(input()); assert.equal(calls.length, 2);
  await h.session.reconcile(); assert.equal(calls.at(-1).action, "atelier.prepare");
  assert.ok(h.session.getState().pending); assert.equal(h.session.getState().result.kind, "uncertain");
  assert.equal(h.store.map.size, 1); assert.equal(h.session.getState().prepared, null);
});

test("real service post-commit conflict preserves the UI recovery hint and never repeats the write", async () => {
  const { createDevelopmentService } = await jiti.import("../../server/missions/development-mission.ts");
  const { createAtelierDevelopmentService } = await jiti.import("../../server/missions/atelier-development-service.ts");
  const context = { workspaceId: "ws-a", modeId: "hq", actorId: "owner-a" }; let row;
  await createDevelopmentService({ enabled: () => true, store: () => ({ save: async value => (row = structuredClone(value)), load: async () => null }) })
    .create({ requestId: "12345678-1234-4234-8234-123456789abc", title: "One component", objective: "Specify it", scope: "Internal draft", acceptanceCriteria: "Clear tests" }, context);
  row.updatedAt = "2026-10-28T20:00:00.000Z";
  const request = { ...input(), missionId: row.id }; let writes = 0;
  const service = createAtelierDevelopmentService({ enabled: () => true, store: () => ({ load: async () => structuredClone(row),
    reserve: async (_, claim) => { writes++; row.input._atelierRun = structuredClone(claim); row.costBudgetCents = 0;
      row.updatedAt = "2026-10-28T20:00:01.000Z"; throw Error("reply lost after commit, budget then changed"); } }) });
  const store = storage(); const actions = [];
  const session = C.createAtelierReservationSession({ scope: { ...context, missionId: row.id, missionVersion: row.updatedAt, developmentPayloadHash: row.input.development.payloadHash },
    storage: () => store, changed: () => {}, fetcher: async (_, init) => {
      const { action, expectedBindingHash, ...input } = JSON.parse(init.body); actions.push(action);
      const receipt = action === "atelier.prepare" ? await service.prepare(context, input) : await service.reserve(context, input, { expectedBindingHash });
      return response({ ...envelope, ...receipt }, receipt.status === "conflict" ? 409 : 200);
    } });
  session.restore(); await session.prepare(request); await session.reserve(true);
  assert.equal(writes, 1); assert.ok(row.input._atelierRun);
  assert.ok(session.getState().pending); assert.equal(store.map.size, 1); assert.equal(session.getState().result.kind, "uncertain");
  await session.reserve(true); await session.prepare(request); assert.equal(actions.length, 2);
  await session.reconcile(); assert.equal(actions.at(-1), "atelier.prepare"); assert.equal(writes, 1);
  assert.ok(session.getState().pending); assert.equal(store.map.size, 1);
});

test("canonical existing claim is only a lookup hint; corrupt/foreign claim blocks new preparation", async () => {
  let calls = 0;
  const h = harness(async (_, init) => { calls++; assert.equal(JSON.parse(init.body).action, "atelier.prepare"); return response(reserved("existing")); }, { existing: { present: true, claim: claim() } });
  assert.equal(h.session.getState().result.kind, "uncertain"); await h.session.prepare(input()); assert.equal(calls, 0);
  await h.session.reconcile(); assert.equal(calls, 1);
  for (const value of [undefined, { ...claim(), binding: { ...binding(), workspaceId: "foreign" } }]) {
    const bad = harness(async () => { throw Error("must not fetch"); }, { existing: { present: true, claim: value } });
    assert.equal(bad.session.getState().storageError, true); await bad.session.prepare(input());
  }
});

test("another mounted instance's pending reservation is reread before any prepare or reserve", async () => {
  const store = storage(); let calls = 0;
  const h = harness(async () => { calls++; return response(prepared()); }, { store });
  await h.session.prepare(input()); store.setItem(C.atelierReservationKey(scope), JSON.stringify(packet()));
  await h.session.reserve(true); assert.equal(calls, 1); assert.ok(h.session.getState().pending);
  const second = harness(async () => { calls++; }, { store }); await second.session.prepare(input()); assert.equal(calls, 1);
});

test("late response from a retired scope cannot update state or remove its recovery packet", async () => {
  let release; const h = harness(async () => new Promise(resolve => { release = resolve; }));
  const request = h.session.prepare(input()); const count = h.changes.length;
  h.session.dispose(); release(response(prepared())); await request;
  assert.equal(h.changes.length, count); assert.equal(h.session.getState().prepared, null);
  h.session.activate(); h.session.restore(); // React Strict Mode setup/cleanup/setup remains usable.
});

test("delayed reserve success after unmount cannot clear the next instance's recovery hint", async () => {
  const store = storage(); let removed = 0; const remove = store.removeItem;
  store.removeItem = key => { removed++; remove(key); };
  let calls = 0, release;
  const old = harness(async () => { calls++; return calls === 1 ? response(prepared()) : new Promise(resolve => { release = resolve; }); }, { store });
  await old.session.prepare(input()); const reservation = old.session.reserve(true);
  assert.equal(store.map.size, 1); const callbackCount = old.changes.length; old.session.dispose();
  const freshCalls = [];
  const fresh = harness(async (_, init) => { freshCalls.push(JSON.parse(init.body)); return response(reserved("existing")); }, { store });
  release(response(reserved())); await reservation;
  assert.equal(old.changes.length, callbackCount); assert.equal(removed, 0); assert.equal(store.map.size, 1);
  assert.ok(fresh.session.getState().pending); await fresh.session.reserve(true); assert.equal(freshCalls.length, 0);
  await fresh.session.reconcile(); assert.equal(freshCalls[0].action, "atelier.prepare");
  assert.equal(removed, 1); assert.equal(fresh.session.getState().result.kind, "reserved");
});

test("pending packets are scope-bound, strict, bounded, and never grant authority", () => {
  for (const mutate of [p => p.workspaceId = "foreign", p => p.modeId = "other", p => p.request.missionId = runId,
    p => p.approval = true, p => p.expectedBindingHash = "invalid"]) {
    const p = packet(); mutate(p); assert.throws(() => C.parseAtelierPending(JSON.stringify(p), scope));
  }
  assert.throws(() => C.parseAtelierPending(" ".repeat(4097), scope));
  assert.equal(C.parseAtelierPending(null, scope), null);
});

test("auth/known refusal/oversize messages are safe, and malformed reserve responses stay uncertain", async () => {
  for (const [status, code] of [[403, "forbidden"], [403, "request_denied"], [400, "invalid_request"], [404, "not_found"], [409, "conflict"], [409, "ineligible_mission"], [503, "disabled"], [503, "unavailable"]]) {
    const result = await C.requestAtelierReservation("reserve", input(), scope, binding().bindingHash, async () => response({ ...envelope, status: code }, status));
    assert.equal(result.kind, "blocked", code); assert.equal(result.beforeWrite, code !== "conflict");
  }
  const unauthorized = await C.requestAtelierReservation("reserve", input(), scope, binding().bindingHash, async () => response({ error: "private server detail" }, 401));
  assert.equal(unauthorized.kind, "blocked"); assert.doesNotMatch(unauthorized.message, /private/);
  const tooLarge = await C.requestAtelierReservation("reserve", input(), scope, binding().bindingHash, async () => response({ ...envelope, status: "snapshot_too_large", reservationAttempted: false }, 422));
  assert.equal(tooLarge.beforeWrite, true);
  for (const fetcher of [async () => new Response("<html>error</html>", { status: 503 }), async () => response({ summary: "done" }), async () => response("x".repeat(70_000))]) {
    assert.equal((await C.requestAtelierReservation("reserve", input(), scope, binding().bindingHash, fetcher)).kind, "uncertain");
  }
});
