import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

process.env.NODE_ENV = "test";
delete process.env.MICHAEL_HQ_OWNER_ID;
delete process.env.MICHAEL_HQ_OWNER_EMAIL;
const src = path.resolve("src");
const fixture = path.join(src, "server/auth/test-fixtures/authz-dependencies.mjs");
const jiti = createJiti(import.meta.url, { alias: {
  "@/lib/supabase/server": fixture,
  "@/server/supabase/admin": fixture,
  "@": src,
  "server-only": path.join(src, "scripts/smoke/server-only-stub.mjs"),
} });
const authz = await jiti.import("./authz-context.ts");
const owner = await jiti.import("./owner.ts");
const { getActiveWorkspaceContext } = await jiti.import("../../core/workspace-context.ts");
const { resolveJorisJobContext } = await jiti.import("../jobs/joris-execute-job.ts");
const { POST } = await jiti.import("../../app/api/joris/chat/route.ts");
const { createContactLeadRepository } = await jiti.import("../contact/contact-lead-repository.ts");
const outcomes = await jiti.import("../ventures/agent-outcome-repository.ts");
const members = [
  { userId: "userA", workspaceId: "wsA", role: "owner" },
  { userId: "userB", workspaceId: "wsB", role: "owner" },
];

// Records every filter and emulates the database applying it, for both tables.
function fakeDb() {
  const rows = new Map();
  const calls = [];
  return { calls, from(table) {
    const call = { table, filters: [], operation: "select" }; calls.push(call);
    let inserted, patch, single = false;
    const query = {
      select() { return query; }, order() { return query; }, limit() { return query; },
      eq(key, value) { call.filters.push([key, value]); return query; },
      insert(value) { call.operation = "insert"; call.payload = value; inserted = value; return query; },
      update(value) { call.operation = "update"; patch = value; return query; },
      single() { single = true; return query; }, maybeSingle() { single = true; return query; },
      then(resolve, reject) {
        try {
          const list = rows.get(table) ?? []; rows.set(table, list);
          if (inserted) list.push({ ...inserted, id: `${table}-${list.length}`, created_at: new Date().toISOString() });
          const found = list.filter(row => call.filters.every(([key, value]) => row[key] === value));
          if (patch) found.forEach(row => Object.assign(row, patch));
          return Promise.resolve({ data: single ? found[0] ?? null : found, error: null }).then(resolve, reject);
        } catch (e) { return Promise.reject(e).then(resolve, reject); }
      },
    };
    return query;
  } };
}

test("two users x two workspaces: authorization and persistence isolation", async (t) => {
  process.env.ORIA_WORKSPACE_MEMBERS = JSON.stringify(members);
  await t.test("explicit defaults, unknowns, personal spaces and foreign membership", () => {
    assert.equal(authz.resolveAuthzContext({ userId: "userA" }).workspaceId, "wsA");
    assert.equal(authz.resolveAuthzContext({ userId: "userB" }).workspaceId, "wsB");
    assert.throws(() => authz.resolveAuthzContext({ userId: "userB" }, "wsA"), { code: "NOT_A_MEMBER" });
    assert.throws(() => authz.resolveAuthzContext({ userId: "userB" }, "missing"), { code: "UNKNOWN_WORKSPACE" });
    assert.throws(() => getActiveWorkspaceContext({ userId: "userB", workspaceId: "wsA" }), { code: "NOT_A_MEMBER" });
    assert.throws(() => authz.assertWorkspaceAccess(authz.resolveAuthzContext({ userId: "userB" }), "wsA"));
    assert.throws(() => getActiveWorkspaceContext({ userId: "new-user" }), { code: "NOT_A_MEMBER" });
    const personalA = getActiveWorkspaceContext({ userId: "userA", workspaceId: "personal:userA" });
    assert.equal(personalA.workspace.id, "personal:userA");
    process.env.ORIA_OPEN_PERSONAL_SPACES = "true";
    const personal = getActiveWorkspaceContext({ userId: "new-user" });
    delete process.env.ORIA_OPEN_PERSONAL_SPACES;
    assert.equal(personal.workspace.id, "personal:new-user");
    assert.equal(personal.activeMode.id, "personal");
    assert.equal(personal.workspace.companyId, undefined);
    assert.throws(() => authz.resolveAuthzContext({ userId: "userB" }, "personal:userA"));
  });
  await t.test("real HTTP route rejects foreign workspace before any execution", async () => {
    globalThis.authzTestUser = { id: "userB" };
    const request = new Request("http://localhost/api/joris/chat?workspace=wsB", {
      method: "POST", headers: { "x-oria-workspace": "wsA" }, body: JSON.stringify({ message: "bonjour" }),
    });
    assert.equal((await POST(request)).status, 403);
    assert.equal((await owner.requireWorkspaceApiSession(new Request("http://localhost/?workspace=wsA"))).status, 403);
    assert.equal((await owner.requireWorkspaceApiSession(new Request("http://localhost/?workspace=wsB"))).ctx.workspaceId, "wsB");
    globalThis.authzTestUser = null;
    assert.equal((await owner.requireWorkspaceApiSession()).status, 401);
  });
  await t.test("job rejects foreign, unknown and missing event context without retry", () => {
    for (const data of [{ userId: "userB", workspaceId: "wsA" }, { userId: "userB", workspaceId: "missing" }, {}]) {
      assert.throws(() => resolveJorisJobContext(data), { name: "NonRetriableError" });
    }
    assert.equal(resolveJorisJobContext({ userId: "userA", workspaceId: "wsA" }).workspace.id, "wsA");
  });
  for (const mode of ["local", "supabase"]) await t.test(`${mode}: no cross-workspace reads or updates`, async () => {
    globalThis.authzTestDb = mode === "supabase" ? fakeDb() : null;
    const contacts = createContactLeadRepository();
    assert.equal(contacts.mode, mode);
    for (const workspaceId of ["wsA", "wsB"]) {
      await contacts.create({ workspaceId, name: workspaceId, email: "test@example.test", message: "test" });
    }
    for (const workspaceId of ["wsA", "wsB"]) {
      const leads = await contacts.listRecent({ workspaceId });
      assert.equal(leads.length, 1);
      assert.equal(leads[0].name, workspaceId);
    }
    outcomes.__clearAgentOutcomesForTests();
    const a = await outcomes.createAgentOutcome({ workspaceId: "wsA", createdByUserId: "userA", agentId: "agent", skillId: "skill", proposedAt: new Date().toISOString() });
    await outcomes.createAgentOutcome({ workspaceId: "wsB", createdByUserId: "userB", agentId: "agent", skillId: "skill", proposedAt: new Date().toISOString() });
    assert.equal(await outcomes.getAgentOutcome("wsB", a.id), null);
    await outcomes.updateAgentOutcome({ workspaceId: "wsB", id: a.id, outcome: "revenue", revenueCad: 100 });
    assert.equal((await outcomes.getAgentOutcome("wsA", a.id)).outcome, "pending");
    await outcomes.updateAgentOutcome({ workspaceId: "wsA", id: a.id, outcome: "converted" });
    assert.equal((await outcomes.getAgentOutcome("wsA", a.id)).outcome, "converted");
    assert.equal((await outcomes.listAgentOutcomes("wsB")).length, 1);
    if (mode === "supabase") for (const call of globalThis.authzTestDb.calls) {
      assert.ok(call.filters.some(([key]) => key === "workspace_id"), JSON.stringify(call));
      if (call.operation === "insert") assert.ok(call.payload.workspace_id);
    }
    delete globalThis.authzTestDb;
  });
  await t.test("email membership, member role and invalid config fail closed", async () => {
    process.env.ORIA_WORKSPACE_MEMBERS = JSON.stringify([
      ...members, { email: "member@example.test", workspaceId: "wsA", role: "member" },
    ]);
    globalThis.authzTestUser = { id: "email-user", email: "MEMBER@example.test" };
    const session = await owner.requireWorkspaceApiSession();
    assert.equal(session.ctx.role, "member");
    assert.equal(owner.isOwnerUser(session.user), false);
    assert.equal(getActiveWorkspaceContext({ ...session.ctx, email: session.user.email }).workspace.id, "wsA");
    for (const invalid of ["{", "{}", '[{"userId":"x","workspaceId":"wsA","role":"admin"}]']) {
      process.env.ORIA_WORKSPACE_MEMBERS = invalid;
      assert.throws(() => authz.resolveAuthzContext({ userId: "userA" }), { code: "INVALID_CONFIG" });
    }
    process.env.ORIA_WORKSPACE_MEMBERS = JSON.stringify(members);
  });
  await t.test("legacy owner id/email and configured owner compatibility", () => {
    process.env.MICHAEL_HQ_OWNER_ID = "legacy";
    process.env.MICHAEL_HQ_OWNER_EMAIL = "legacy@example.test";
    assert.equal(owner.isOwnerUser({ id: "legacy" }), true);
    assert.equal(owner.isOwnerUser({ id: "different", email: "LEGACY@example.test" }), true);
    assert.equal(owner.isOwnerUser({ id: "userA" }), true);
    assert.equal(owner.isOwnerUser({ id: "stranger" }), false);
    assert.equal(authz.resolveAuthzContext({ userId: "legacy" }).workspaceId, "michael-hq");
    delete process.env.MICHAEL_HQ_OWNER_ID;
    delete process.env.MICHAEL_HQ_OWNER_EMAIL;
  });
  delete process.env.ORIA_WORKSPACE_MEMBERS;
  delete globalThis.authzTestUser;
});
