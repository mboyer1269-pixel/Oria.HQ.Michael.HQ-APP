import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(process.cwd(), "src"), "server-only": path.join(process.cwd(), "src/scripts/smoke/server-only-stub.mjs") } });
const { createPaperclipDispatchHandler, createPaperclipIssue, DISPATCH_RECEIPT_KEY } = await jiti.import("./paperclip-dispatch.ts");
const { createDurablePaperclipDispatchStore } = await jiti.import("./paperclip-dispatch-store.ts");
const { persistMissionDraftDurable } = await jiti.import("../missions/mission-draft-durable-repository.ts");
const companyId = "11111111-1111-4111-8111-111111111111";
const remoteIssueId = "22222222-2222-4222-8222-222222222222";
const settings = { enabled: true, baseUrl: "https://paperclip.example", token: "synthetic-private-token-not-real", workspaceId: "pilot", companyId };
const initial = { id: "mission-1", workspaceId: "pilot", title: "Synthetic mission", objective: "Build synthetic artifact", expectedOutput: "Verified result", status: "draft", updatedAt: "2026-09-29T00:00:00.000Z", input: { userField: "preserve" } };
const request = (patch = {}, origin = "https://hq.example") => new Request("https://hq.example/api/orchestration/missions/dispatch", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ missionId: initial.id, expectedUpdatedAt: initial.updatedAt, confirm: true, ...patch }) });
function harness(overrides = {}) {
  let mission = structuredClone(initial), sends = 0, audits = 0;
  const store = { load: async (workspace, id) => mission.workspaceId === workspace && mission.id === id ? structuredClone(mission) : null,
    compareAndSwap: async (expected, input) => { if (JSON.stringify(expected) !== JSON.stringify(mission)) return null; mission = { ...mission, input: structuredClone(input), updatedAt: new Date().toISOString() }; return structuredClone(mission); },
    audit: async () => { audits++; },
  };
  const send = async (_, payload) => { sends++; assert.equal(payload.status, "backlog"); assert.equal(payload.assigneeAgentId, null); assert.equal(payload.allowDuplicate, true); return remoteIssueId; };
  const deps = { authorize: async () => null, actorId: async () => "owner-session", workspaceId: () => "pilot", enabled: () => true, settings: () => settings, store: () => store, send, ...overrides };
  return { handler: createPaperclipDispatchHandler(deps), store, get mission() { return mission; }, get sends() { return sends; }, get audits() { return audits; } };
}
test("owner, origin, opt-in and strict confirmation gate precede persistence", async () => {
  const blocked = harness({ authorize: async () => new Response(null, { status: 401 }), store: () => { throw new Error("must not reach"); } });
  assert.equal((await blocked.handler(request())).status, 401);
  assert.equal((await harness().handler(request({}, "https://foreign.example"))).status, 403);
  assert.equal((await harness({ enabled: () => false }).handler(request())).status, 503);
  for (const patch of [{ confirm: false }, { endpoint: "https://foreign.example" }, { expectedUpdatedAt: "bad" }]) assert.equal((await harness().handler(request(patch))).status, 400);
  assert.equal((await harness({ store: () => null }).handler(request())).status, 503);
});
test("durable reservation precedes send; linked replay preserves remote ID and user input", async () => {
  const h = harness(); const first = await h.handler(request()); assert.equal(first.status, 201);
  const body = await first.json(); assert.equal(body.receipt.remoteIssueId, remoteIssueId); assert.equal(body.executionRequested, false);
  assert.equal(h.mission.input.userField, "preserve"); assert.equal(h.mission.input[DISPATCH_RECEIPT_KEY].state, "linked");
  assert.equal((await h.handler(request())).status, 200); assert.equal(h.sends, 1); assert.equal(h.audits, 2);
});
test("OpenHands reservation prevents a second executor handoff even when malformed", async () => {
  for (const receipt of [null, {}, { state: "reserved" }, { state: "outcome_unknown" }]) {
    const h = harness();
    h.mission.input._openhandsReservation = receipt;
    const result = await h.handler(request());
    assert.equal(result.status, 409);
    assert.equal((await result.json()).status, "reconciliation_required");
    assert.equal(h.sends, 0);
    assert.equal(h.audits, 0);
  }
});

test("concurrent confirmations produce one remote send", async () => {
  const h = harness(); const outcomes = await Promise.all([h.handler(request()), h.handler(request())]);
  assert.equal(h.sends, 1); assert.ok(outcomes.some(result => result.status === 409));
});
test("unknown external outcome stays reserved without automatic resend", async () => {
  let sends = 0; const h = harness({ send: async () => { sends++; throw new Error(settings.token); } });
  const first = await h.handler(request()); const body = await first.text();
  assert.equal(first.status, 409); assert.ok(!body.includes(settings.token));
  assert.equal(h.mission.input[DISPATCH_RECEIPT_KEY].state, "outcome_unknown");
  assert.equal((await h.handler(request())).status, 409); assert.equal(sends, 1);
});
test("failed pre-send audit and stale mission never send", async () => {
  const h = harness(); h.store.audit = async () => { throw new Error("synthetic"); };
  assert.equal((await h.handler(request())).status, 503); assert.equal(h.sends, 0);
  assert.equal((await h.handler(request())).status, 409);
  assert.equal((await harness().handler(request({ expectedUpdatedAt: "2026-09-28T00:00:00Z" }))).status, 409);
});
test("post-send receipt failure reports reconciliation and forbids replay", async () => {
  const h = harness(); const cas = h.store.compareAndSwap; let swaps = 0;
  h.store.compareAndSwap = async (...args) => ++swaps === 1 ? cas(...args) : null;
  const result = await h.handler(request()); assert.equal(result.status, 409); assert.equal((await result.json()).remoteIssueId, remoteIssueId);
  await h.handler(request()); assert.equal(h.sends, 1);
});
test("fixed create uses body idempotency and validates remote correlation", async () => {
  const payload = { title: "Synthetic", description: "HQ reference: fixed-key", status: "backlog", assigneeAgentId: null, idempotencyKey: "fixed-key", allowDuplicate: true };
  const id = await createPaperclipIssue(settings, payload, async (url, options) => {
    assert.equal(String(url), `https://paperclip.example/api/companies/${companyId}/issues`); assert.equal(options.redirect, "error");
    assert.deepEqual(JSON.parse(options.body), payload);
    return Response.json({ id: remoteIssueId, companyId, description: payload.description });
  }); assert.equal(id, remoteIssueId);
  for (const body of [{ id: remoteIssueId, companyId, description: "unrelated" }, { id: remoteIssueId, companyId: remoteIssueId, description: payload.description }]) await assert.rejects(createPaperclipIssue(settings, payload, async () => Response.json(body)), /dispatch_outcome_unknown/);
});

test("durable CAS filters preserve scope and original input; missing DB has no fallback", async () => {
  assert.equal(createDurablePaperclipDispatchStore(null), null);
  const calls = [];
  const query = { update(value) { calls.push(["update", value]); return this; }, eq(...args) { calls.push(["eq", ...args]); return this; }, select() { return this; }, async maybeSingle() { return { data: null, error: null }; } };
  const store = createDurablePaperclipDispatchStore({ from(table) { assert.equal(table, "missions"); return query; } });
  assert.equal(await store.compareAndSwap(initial, { ...initial.input, [DISPATCH_RECEIPT_KEY]: {} }), null);
  for (const pair of [["id", initial.id], ["workspace_id", initial.workspaceId], ["status", initial.status], ["updated_at", initial.updatedAt], ["input", JSON.stringify(initial.input)]]) assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(["eq", ...pair])));
  assert.equal(calls[0][1].input.userField, "preserve");
});
test("bounded body rejects oversized requests before reserve", async () => {
  const h = harness(); assert.equal((await h.handler(request({ extra: "x".repeat(3000) }))).status, 400); assert.equal(h.sends, 0);
});
test("outbound deadline and oversized replies stay unknown with no retry", async () => {
  const payload = { title: "Synthetic", description: "HQ reference: fixed-key", status: "backlog", assigneeAgentId: null, idempotencyKey: "fixed-key", allowDuplicate: true };
  let calls = 0;
  await assert.rejects(createPaperclipIssue(settings, payload, async () => { calls++; return new Promise(() => {}); }), /dispatch_outcome_unknown/);
  assert.equal(calls, 1);
  await assert.rejects(createPaperclipIssue(settings, payload, async () => new Response("x".repeat(256 * 1024 + 1), { headers: { "content-type": "application/json" } })), /dispatch_outcome_unknown/);
});

test("draft reconfirmation cannot replace a reserved or linked canonical receipt", async () => {
  for (const state of ["reserved", "linked", "outcome_unknown"]) {
    const receipt = { state, remoteIssueId };
    const row = { id: initial.id, workspace_id: "pilot", mode_id: "hq", title: "Canonical", objective: "Original", assigned_agent_id: "agent", autonomy_level: 0,
      status: "draft", risk_level: "low", input: { userField: "canonical", [DISPATCH_RECEIPT_KEY]: receipt }, expected_output: "Expected", requires_approval: true,
      cost_budget_cents: null, result: null, created_at: initial.updatedAt, updated_at: initial.updatedAt, completed_at: null };
    let upserts = 0;
    const query = { async upsert(_value, options) { assert.deepEqual(options, { onConflict: "id", ignoreDuplicates: true }); upserts++; return { error: null }; },
      select() { return this; }, eq(key, value) { if (key === "workspace_id") assert.equal(value, "pilot"); return this; }, async single() { return { data: row, error: null }; } };
    const client = { from() { return query; } };
    const result = await persistMissionDraftDurable({ ...initial, title: "Stale replacement", modeId: "hq", assignedAgentId: "agent", autonomyLevel: 0, riskLevel: "low", requiresApproval: true, createdAt: initial.updatedAt }, client);
    assert.equal(upserts, 1); assert.equal(result.title, "Canonical"); assert.deepEqual(result.input[DISPATCH_RECEIPT_KEY], receipt);
    await assert.rejects(persistMissionDraftDurable({ ...initial, input: { [DISPATCH_RECEIPT_KEY]: receipt } }, client), /cannot supply/);
    assert.equal(upserts, 1);
  }
});

test("public origin behind proxy is exact, with no trust in forwarded or Host headers", async () => {
  const proxyRequest = (origin, headers = {}) => new Request("http://internal:3000/api/orchestration/missions/dispatch", { method: "POST", headers: { origin, "content-type": "application/json", ...headers }, body: JSON.stringify({ missionId: initial.id, expectedUpdatedAt: initial.updatedAt, confirm: true }) });
  const ready = harness({ publicOrigin: () => "https://public.example" });
  assert.equal((await ready.handler(proxyRequest("https://public.example"))).status, 201);
  assert.equal(ready.sends, 1); // Still creates only the unassigned backlog item checked by the harness.
  for (const origin of ["https://foreign.example", "http://internal:3000"]) {
    const blocked = harness({ publicOrigin: () => "https://public.example" });
    const response = await blocked.handler(proxyRequest(origin, { host: "public.example", "x-forwarded-host": "public.example", "x-forwarded-proto": "https", forwarded: "host=public.example;proto=https" }));
    assert.equal(response.status, 403); assert.equal(blocked.sends, 0); assert.equal(blocked.audits, 0);
  }
  for (const origin of ["", "https://public.example/", "https://public.example/path", "https://public.example?x=1", "https://public.example#x", "https://user:pass@public.example", "garbage", "file://public.example"]) {
    const blocked = harness({ publicOrigin: () => origin });
    assert.equal((await blocked.handler(proxyRequest("https://public.example"))).status, 403); assert.equal(blocked.sends, 0);
  }
});
