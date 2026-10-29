import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@": path.join(process.cwd(), "src"), "server-only": path.join(process.cwd(), "src/scripts/smoke/server-only-stub.mjs") } });
const { createCockpitLayoutPersistence } = await jiti.import("./layout-persistence.ts");
const { defaultCockpitOrder } = await jiti.import("../../features/cockpit/cockpit-layout-contract.ts");
const owner = "owner-fixture";
const order = defaultCockpitOrder();
const changed = [...order].reverse();
const revision = "2026-10-29T15:00:00.123456+00:00";
const row = () => ({ user_id: owner, widget_order: order, updated_at: revision });
// Real installed SDK, explicit in-memory fetch. These are NOT database proofs.
function fixture(handler) {
  const requests = [];
  const client = createClient("https://offline.invalid", "synthetic-test-only", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (url, options) => {
    const call = { url: new URL(url), method: options.method, headers: options.headers, body: options.body ? JSON.parse(options.body) : null, signal: options.signal };
    requests.push(call);
    return handler(call, requests.length);
  } } });
  return { requests, service: createCockpitLayoutPersistence(client, owner, () => Date.parse("2026-10-29T15:00:00.000Z")) };
}
function response(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...(Array.isArray(data) ? { "Content-Range": data.length ? `0-${data.length - 1}/${data.length}` : "*/0" } : {}) } }); }
const request = () => ({ order: changed, expectedRevision: revision });

test("real SDK read distinguishes missing, normalized legacy row, failure and invalid data", async () => {
  for (const [value, status] of [[[], "missing"], [[row()], "loaded"], [[{ ...row(), widget_order: ["modes", "modes", "retired"] }], "loaded"], [[{ ...row(), updated_at: "bad" }], "failed"], [[{ ...row(), user_id: "foreign" }], "failed"], [[{ ...row(), widget_order: null }], "failed"]]) {
    const f = fixture(() => response(value)); const result = await f.service.read(); assert.equal(result.status, status);
    assert.equal(f.requests[0].url.searchParams.get("user_id"), `eq.${owner}`);
    assert.equal(f.requests[0].method, "GET");
    if (status === "loaded") assert.equal(result.order.length, 7);
    if (status === "failed") assert.equal("order" in result, false);
  }
  const f = fixture(() => response({ code: "XX000", message: "private diagnostic" }, 500));
  assert.deepEqual(await f.service.read(), { status: "failed" });
  assert.deepEqual(await createCockpitLayoutPersistence(null, owner).read(), { status: "unavailable" });
});
test("invalid requests and no client prove no write was attempted", async () => {
  const f = fixture(() => { throw Error("should not fetch"); });
  for (const value of [null, [], { ...request(), userId: "foreign" }, { order: ["modes"], expectedRevision: revision }, { ...request(), expectedRevision: "bad" }, { ...request(), order: Array(7).fill("modes") }]) {
    assert.deepEqual(await f.service.save(value), { status: "not_attempted", reason: "invalid_request" });
  }
  assert.equal(f.requests.length, 0);
  assert.deepEqual(await createCockpitLayoutPersistence(null, owner).save(request()), { status: "not_attempted", reason: "unavailable" });
});
test("failed or thrown read never falls back to default and never dispatches mutation", async () => {
  for (const read of [() => response({ code: "XX000" }, 500), () => { throw Error("network unavailable"); }]) {
    const f = fixture(read); assert.deepEqual(await f.service.save(request()), { status: "not_attempted", reason: "read_failed" });
    assert.equal(f.requests.length, 1); assert.equal(f.requests[0].method, "GET");
  }
});
test("stale or incorrectly missing baseline never writes", async () => {
  for (const expectedRevision of [null, "2026-01-01T00:00:00.000Z"]) {
    const f = fixture(() => response([row()])); assert.deepEqual(await f.service.save({ order: changed, expectedRevision }), { status: "conflict" }); assert.equal(f.requests.length, 1);
  }
});
test("confirmed update is owner+version scoped, returns exact order, increases microsecond version", async () => {
  const f = fixture((call) => call.method === "GET" ? response([row()]) : response([{ user_id: owner, ...call.body }]));
  const saved = await f.service.save(request()); assert.equal(saved.status, "confirmed"); assert.deepEqual(saved.order, changed);
  assert.equal(saved.revision, "2026-10-29T15:00:00.124Z");
  const write = f.requests[1]; assert.equal(write.method, "PATCH");
  assert.equal(write.url.searchParams.get("user_id"), `eq.${owner}`); assert.equal(write.url.searchParams.get("updated_at"), `eq.${revision}`);
  assert.deepEqual(Object.keys(write.body).sort(), ["updated_at", "widget_order"]);
  assert.match(new Headers(write.headers).get("Prefer"), /return=representation/);
  assert.ok(write.signal instanceof AbortSignal);
});
test("absent row uses owner-bound insert, never upsert; concurrent insert conflicts", async () => {
  for (const conflict of [false, true]) {
    const f = fixture((call) => call.method === "GET" ? response([]) : conflict ? response({ code: "23505" }, 409) : response([call.body], 201));
    const saved = await f.service.save({ order: changed, expectedRevision: null }); assert.equal(saved.status, conflict ? "conflict" : "confirmed");
    const write = f.requests[1]; assert.equal(write.method, "POST"); assert.equal(write.body.user_id, owner);
    assert.ok(!new Headers(write.headers).get("Prefer").includes("resolution=merge"));
  }
});
test("atomic update that matches no row reports conflict, not confirmation", async () => {
  const f = fixture((call) => call.method === "GET" ? response([row()]) : response([]));
  assert.deepEqual(await f.service.save(request()), { status: "conflict" });
});
test("post-dispatch errors/lost ACK/malformed success are unconfirmed with one write only", async () => {
  for (const mutation of [() => { throw Error("lost ACK after possible commit"); }, () => response({ code: "XX000" }, 500), () => response({ user_id: "foreign", widget_order: changed, updated_at: revision }), () => response({ user_id: owner, widget_order: order, updated_at: revision }), () => response({ user_id: owner, widget_order: changed, updated_at: "bad" }),
    (call) => response([{ ...call.body, user_id: "foreign" }]),
    (call) => response([{ user_id: owner, ...call.body, widget_order: order }]),
    (call) => response([{ user_id: owner, ...call.body, updated_at: "bad" }]),
    (call) => response([{ user_id: owner, ...call.body, updated_at: revision }]),
  ]) {
    const f = fixture((call) => call.method === "GET" ? response([row()]) : mutation(call));
    assert.deepEqual(await f.service.save(request()), { status: "unconfirmed" });
    assert.equal(f.requests.length, 2); assert.equal(f.requests.filter((call) => call.method === "PATCH").length, 1);
  }
});
test("fresh read can observe simulated committed lost ACK; it never retransmits a write", async () => {
  let durable = row(); const f = fixture((call) => {
    if (call.method === "GET") return response([durable]);
    durable = { user_id: owner, ...call.body }; throw Error("ACK lost");
  });
  assert.equal((await f.service.save(request())).status, "unconfirmed");
  const read = await f.service.read(); assert.equal(read.status, "loaded"); assert.deepEqual(read.order, changed);
  assert.equal(f.requests.filter((call) => call.method !== "GET").length, 1);
});

test("malformed read responses never become a confirmed missing baseline", async () => {
  for (const make of [() => new Response(null,{status:204}), () => response(null), () => new Response('',{status:200}), () => response([],404), () => new Response('',{status:404}), () => new Response('[]',{status:200}), () => response([row(),row()])]) {
    const f=fixture(make); assert.deepEqual(await f.service.read(),{status:'failed'});
    assert.deepEqual(await f.service.save(request()),{status:'not_attempted',reason:'read_failed'});
    assert.ok(f.requests.every(call=>call.method==='GET'));
  }
});
test("a simulated committed PATCH with empty/malformed ACK is unconfirmed, never no-effect conflict", async () => {
  for (const make of [() => new Response(null,{status:204}), () => response(null), () => new Response('',{status:200}), () => response([],404), () => new Response('',{status:404}), () => new Response('[]',{status:200})]) {
    let stored=row(); const f=fixture(call=>{if(call.method==='GET')return response([stored]);stored={user_id:owner,...call.body};return make()});
    assert.deepEqual(await f.service.save(request()),{status:'unconfirmed'});assert.deepEqual(stored.widget_order,changed);
    assert.notEqual(stored.updated_at,revision);assert.equal(f.requests.filter(call=>call.method==='PATCH').length,1);
  }
});
