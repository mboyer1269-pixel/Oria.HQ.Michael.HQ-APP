import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isDeepStrictEqual } from "node:util";
import { createJiti } from "jiti";
const src = path.resolve("src");
const jiti = createJiti(import.meta.url, { alias: { "@": src, "server-only": path.join(src, "scripts/smoke/server-only-stub.mjs") } });
const { createAtelierChatHandler, readJorisJsonBody } = await jiti.import("./atelier-handlers.ts");
const { createDevelopmentService } = await jiti.import("@/server/missions/development-mission");
const { createAtelierDevelopmentService } = await jiti.import("@/server/missions/atelier-development-service");
const identity = { actorId: "owner-a", workspaceId: "ws-a", modeId: "hq", role: "owner" };
const requestInput = { missionId: "12345678-1234-4234-8234-123456789abc", repository: { relativePath: "repo/app", baseSha: "a".repeat(40) },
  selection: { runtimeId: "codex", modelId: "gpt-test", catalogRevision: "fixture-1" }, timeoutMs: 60_000 };
const prepare = { action: "atelier.prepare", ...requestInput };
const reserve = { ...prepare, action: "atelier.reserve", expectedBindingHash: "b".repeat(64) };
const inert = { executionRequested: false, externalEffectAllowed: false };
const request = (body = prepare, headers = {}, url = "https://hq.test/api/joris/chat?workspace=ws-a") => new Request(url, {
  method: "POST", headers: { "content-type": "application/json", origin: "https://hq.test", ...headers }, body: JSON.stringify(body),
});
function harness(status = "disabled") {
  const calls = [];
  const service = { prepare: async (...args) => { calls.push(["prepare", ...args]); return { ...inert, status }; },
    reserve: async (...args) => { calls.push(["reserve", ...args]); return { ...inert, status }; } };
  return { calls, service, handler: createAtelierChatHandler({ service, subscriptionOwner: actor => actor === "owner-a", publicOrigin: () => "https://hq.test" }) };
}

test("no session, workspace member, and non-holder are refused before any service call", async () => {
  const h = harness();
  for (const [ctx, expected] of [[null, 401], [{ ...identity, role: "member" }, 403], [{ ...identity, actorId: "other" }, 403]]) {
    const response = await h.handler(request(), prepare, ctx);
    assert.equal(response.status, expected); assert.equal((await response.json()).executionRequested, false);
  }
  assert.equal(h.calls.length, 0);
});

test("typed actions pass only server identity and strict scoped payload to the service", async () => {
  const h = harness();
  assert.equal((await h.handler(request(), prepare, identity)).status, 503);
  assert.equal((await h.handler(request(reserve), reserve, identity)).status, 503);
  assert.deepEqual(h.calls[0], ["prepare", { actorId: "owner-a", workspaceId: "ws-a", modeId: "hq" }, requestInput]);
  assert.deepEqual(h.calls[1], ["reserve", { actorId: "owner-a", workspaceId: "ws-a", modeId: "hq" }, requestInput, { expectedBindingHash: reserve.expectedBindingHash }]);
  for (const extra of [{ actorId: "forged" }, { workspaceId: "foreign" }, { modeId: "life" }, { agentId: "engineering" },
    { approved: true }, { approvalDecision: { status: "approved" } }, { message: "go" }, { subscriptionSelection: requestInput.selection }]) {
    const body = { ...reserve, ...extra };
    assert.equal((await h.handler(request(body), body, identity)).status, 400);
  }
  assert.equal((await h.handler(request({ ...prepare, action: "atelier.execute" }), { ...prepare, action: "atelier.execute" }, identity)).status, 400);
  assert.equal(h.calls.length, 2);
});

test("same-origin JSON checks reject forged, missing and null origins, media types and unexpected query", async () => {
  const h = harness();
  for (const headers of [{ origin: "https://outside.test" }, { origin: "null" }, { origin: "" },
    { "content-type": "text/plain" }, { "content-type": "application/json-fake" }, { "sec-fetch-site": "cross-site" }])
    assert.equal((await h.handler(request(prepare, headers), prepare, identity)).status, 403);
  for (const query of ["?workspace=ws-a&workspace=ws-b", "?workspace=ws-a&actor=forged"])
    assert.equal((await h.handler(request(prepare, {}, `https://hq.test/api/joris/chat${query}`), prepare, identity)).status, 403);
  const absent = request(); absent.headers.delete("origin");
  assert.equal((await h.handler(absent, prepare, identity)).status, 403);
  assert.equal(h.calls.length, 0);
  assert.equal((await h.handler(request(prepare, { "content-type": "application/json; charset=utf-8" }, "http://internal:3000/api/joris/chat"), prepare, identity)).status, 503);
  for (const origin of ["https://hq.test/path", "https://user:pass@hq.test", "file:///tmp", "broken"])
    assert.equal((await createAtelierChatHandler({ service: h.service, subscriptionOwner: () => true, publicOrigin: () => origin })(request(), prepare, identity)).status, 403);
});

test("HTTP statuses and responses never present reservation as model execution or approval", async () => {
  for (const [status, expected] of [["prepared", 200], ["reserved", 200], ["conflict", 409], ["not_found", 404],
    ["invalid_request", 400], ["ineligible_mission", 409], ["snapshot_too_large", 422], ["reconciliation_required", 503], ["unavailable", 503]]) {
    const h = harness(status); const response = await h.handler(request(reserve), reserve, identity);
    assert.equal(response.status, expected); assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json(); assert.equal(body.status, status);
    for (const flag of ["executionRequested", "externalEffectAllowed", "runtimeQualified", "reservationIsExecutionApproval"]) assert.equal(body[flag], false);
    assert.equal(body.consumptionMode, undefined); assert.equal(body.executedModelId, undefined);
    assert.equal(typeof body.summary, "string");
  }
});

test("unexpected reservation exception returns uncertainty and is never retried", async () => {
  let writes = 0;
  const handler = createAtelierChatHandler({ subscriptionOwner: () => true, service: {
    prepare: async () => { throw Error("offline"); }, reserve: async () => { writes++; throw Error("write response lost"); },
  } });
  assert.equal((await (await handler(request(), prepare, identity)).json()).status, "unavailable");
  const response = await handler(request(reserve), reserve, identity);
  assert.equal(response.status, 503); assert.equal((await response.json()).status, "reconciliation_required"); assert.equal(writes, 1);
});

test("bounded parser measures bytes, refuses oversized/invalid UTF-8 JSON, and cancels slow bodies", async () => {
  assert.equal((await readJorisJsonBody(request({ message: "legacy", locale: "fr-CA" }))).ok, true);
  const oversized = new Request("https://hq.test", { method: "POST", body: JSON.stringify({ value: "漢".repeat(14_000) }) });
  assert.deepEqual(await readJorisJsonBody(oversized), { ok: false, status: 413 });
  assert.deepEqual(await readJorisJsonBody(request({}, { "content-length": "40001" })), { ok: false, status: 413 });
  assert.deepEqual(await readJorisJsonBody(request({}, { "content-length": "not-a-number" })), { ok: false, status: 400 });
  const invalid = new Request("https://hq.test", { method: "POST", body: new Uint8Array([0xff, 0xfe]) });
  assert.deepEqual(await readJorisJsonBody(invalid), { ok: false, status: 400 });
  let cancelled = false;
  const slow = new Request("https://hq.test", { method: "POST", body: new ReadableStream({ cancel() { cancelled = true; } }), duplex: "half" });
  assert.deepEqual(await readJorisJsonBody(slow, { timeoutMs: 20 }), { ok: false, status: 408 });
  assert.equal(cancelled, true);
});

test("handler and real service compose: canonical binding, repeated reservation and cross-workspace refusal", async () => {
  // SIMULATED storage only: no database or runtime is contacted.
  let row; let reservations = 0;
  const context = { actorId: identity.actorId, workspaceId: identity.workspaceId, modeId: identity.modeId };
  await createDevelopmentService({ enabled: () => true, store: () => ({ save: async m => (row = structuredClone(m)), load: async () => null }) }).create({
    requestId: requestInput.missionId, title: "Task", objective: "Specify task", scope: "One internal spec", acceptanceCriteria: "Tests described",
  }, context);
  const store = { load: async (ws, id) => ws === row.workspaceId && id === row.id ? structuredClone(row) : null,
    reserve: async (expected, claim) => { reservations++; if (!isDeepStrictEqual(expected, row)) return null;
      row.input._atelierRun = claim; row.updatedAt = new Date(Date.parse(row.updatedAt) + 1).toISOString(); return structuredClone(row); } };
  const handler = createAtelierChatHandler({ subscriptionOwner: () => true, service: createAtelierDevelopmentService({ enabled: () => true, store: () => store }) });
  const body = { ...prepare, missionId: row.id };
  const prepared = await (await handler(request(body), body, identity)).json(); assert.equal(prepared.status, "prepared");
  const confirmed = { ...body, action: "atelier.reserve", expectedBindingHash: prepared.binding.bindingHash };
  const first = await (await handler(request(confirmed), confirmed, identity)).json();
  const retry = await (await handler(request(confirmed), confirmed, identity)).json();
  assert.equal(first.status, "reserved"); assert.equal(retry.claim.runId, first.claim.runId); assert.equal(reservations, 1);
  assert.equal((await handler(request(body), body, { ...identity, workspaceId: "foreign" })).status, 404);
  const changed = { ...confirmed, timeoutMs: 120_000 };
  assert.equal((await handler(request(changed), changed, identity)).status, 409); assert.equal(reservations, 1);
});

// Actual route, real workspace auth, injected model and persistence spies. No provider/DB call.
const temp = mkdtempSync(path.join(tmpdir(), "joris-atelier-route-"));
const fixture = path.join(temp, "dependencies.mjs");
writeFileSync(fixture, `
export async function createServerSupabaseClient() { return {auth:{getUser:async()=>({data:{user:globalThis.atelierRouteUser??null},error:null})}}; }
export function createOptionalSupabaseAdminClient() { return null; }
export function hasSupabaseAdminConfig() { return false; }
export function createAtelierDevelopmentService() { return {
 prepare: async (...args) => { globalThis.atelierRouteCalls.push(['prepare',...args]); return {status:'disabled',executionRequested:false,externalEffectAllowed:false}; },
 reserve: async (...args) => { globalThis.atelierRouteCalls.push(['reserve',...args]); return {status:'disabled',executionRequested:false,externalEffectAllowed:false}; }
}; }
export async function runJorisCommand(...args) { globalThis.atelierModelCalls.push(['brain',...args]); return {summary:'legacy chat'}; }
export async function runSubscriptionTurn(...args) { globalThis.atelierModelCalls.push(['subscription',...args]); return {summary:'subscription chat'}; }
`);
const routeJiti = createJiti(import.meta.url, { moduleCache: false, alias: {
  "@/lib/supabase/server": fixture, "@/server/supabase/admin": fixture,
  "@/server/missions/atelier-development-service": fixture, "@/server/joris/brain": fixture,
  "@/server/ai/subscription-runtime": fixture, "@": src,
  "server-only": path.join(src, "scripts/smoke/server-only-stub.mjs"),
} });
process.env.NODE_ENV = "test";
delete process.env.MICHAEL_HQ_OWNER_ID; delete process.env.MICHAEL_HQ_OWNER_EMAIL;
process.env.ORIA_WORKSPACE_MEMBERS = JSON.stringify([
  { userId: "owner-a", workspaceId: "ws-a", role: "owner" }, { userId: "member-a", workspaceId: "ws-a", role: "member" },
  { userId: "owner-b", workspaceId: "ws-b", role: "owner" },
]);
process.env.ORIA_SUBSCRIPTION_OWNERS = "owner-a";
process.env.ORIA_HQ_PUBLIC_ORIGIN = "https://hq.test";
const route = await routeJiti.import("./route.ts");
function as(user) { globalThis.atelierRouteUser = user ? { id: user } : null; globalThis.atelierRouteCalls = []; globalThis.atelierModelCalls = []; }

test("real route denies unauthenticated/member/non-holder typed actions and derives owner workspace/mode", async () => {
  for (const [user, ws, expected] of [[null, "ws-a", 401], ["member-a", "ws-a", 403], ["owner-b", "ws-b", 403]]) {
    as(user); assert.equal((await route.POST(request(prepare, {}, `https://hq.test/api/joris/chat?workspace=${ws}`))).status, expected);
    assert.equal(globalThis.atelierRouteCalls.length, 0); assert.equal(globalThis.atelierModelCalls.length, 0);
  }
  as("owner-a");
  assert.equal((await route.POST(request())).status, 503);
  const call = globalThis.atelierRouteCalls[0]; assert.equal(call[0], "prepare");
  assert.equal(call[1].actorId, "owner-a"); assert.equal(call[1].workspaceId, "ws-a"); assert.equal(typeof call[1].modeId, "string");
  assert.equal(globalThis.atelierModelCalls.length, 0);
});

test("typed action (including malformed action) never falls through to either model rail", async () => {
  as("owner-a");
  for (const body of [prepare, reserve, { ...prepare, action: "go" }, { ...prepare, message: "go", subscriptionSelection: requestInput.selection }]) {
    await route.POST(request(body)); assert.equal(globalThis.atelierModelCalls.length, 0);
  }
  assert.equal(globalThis.atelierRouteCalls.length, 2);
});

test("legacy chat and subscription selection keep their previous branches", async () => {
  as("owner-a");
  const legacy = { message: "bonjour", locale: "fr-CA" };
  const legacyRequest = () => new Request("https://hq.test/api/joris/chat?workspace=ws-a", { method: "POST", body: JSON.stringify(legacy) });
  assert.equal((await route.POST(legacyRequest())).status, 200);
  assert.equal(globalThis.atelierModelCalls[0][0], "brain");
  assert.equal((await route.POST(request({ ...legacy, subscriptionSelection: requestInput.selection }))).status, 200);
  assert.equal(globalThis.atelierModelCalls[1][0], "subscription"); assert.equal(globalThis.atelierRouteCalls.length, 0);
});

test("oversized body is refused at actual route without any reservation/model call", async () => {
  as("owner-a"); const response = await route.POST(request({ ...prepare, excess: "漢".repeat(14_000) }));
  assert.equal(response.status, 413); assert.equal(globalThis.atelierRouteCalls.length, 0); assert.equal(globalThis.atelierModelCalls.length, 0);
});
