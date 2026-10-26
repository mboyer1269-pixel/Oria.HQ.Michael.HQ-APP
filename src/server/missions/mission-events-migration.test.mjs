// PGlite (in-process Postgres) proof of db/migrations/0037_mission_events.sql.
// No network, no remote database. Supabase roles/auth.uid() are stubbed.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const migration = readFileSync(path.join(root, "db/migrations/0037_mission_events.sql"), "utf8");
const revert = readFileSync(path.join(root, "db/migrations/0037_mission_events_revert.sql"), "utf8");
const H = (c) => c.repeat(64);
const MEMBER = "11111111-1111-1111-1111-111111111111";
const OUTSIDER = "22222222-2222-2222-2222-222222222222";

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; grant usage on schema auth to authenticated, anon;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.workspace_members (workspace_id text not null, user_id uuid not null,
      role text not null, primary key (workspace_id, user_id));
    grant select on public.workspace_members to authenticated;
    insert into public.workspace_members values ('ws-a', '${MEMBER}', 'owner');`);
  await db.exec(migration);
  await db.exec(migration); // idempotent
  return db;
}
let n = 0;
function ev(o = {}) {
  n += 1;
  return { workspace_id: "ws-a", mission_id: "m1", seq: 1, intent_key: `k${n}`, event_type: "mission_queued",
    state: "queued", trace_id: "t1", payload_hash: null, actor: "u1", channel: "screen", capability: null,
    grant_id: null, expires_at: null, cost_micro_usd: null, cost_source: null, occurred_at: "2026-10-25T12:00:00Z", ...o };
}
async function ins(db, o) {
  const e = ev(o); const cols = Object.keys(e);
  return db.query(`insert into public.mission_events (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`, Object.values(e));
}
const FUT = "2099-01-01T00:00:00Z";

test("seq is dense and monotonic per mission; idempotency key is unique", async () => {
  const db = await setup();
  await ins(db, { seq: 1, intent_key: "q" });
  await assert.rejects(ins(db, { seq: 3 }), /seq must be 2/);
  await assert.rejects(ins(db, { seq: 2, intent_key: "q" }), /mission_events_intent_unique/);
  await ins(db, { seq: 2, event_type: "mission_started", state: "running" });
  await ins(db, { mission_id: "m2", seq: 1 });
});

test("append-only: UPDATE, DELETE, TRUNCATE refused even for superuser", async () => {
  const db = await setup();
  await ins(db, {});
  await assert.rejects(db.query("update public.mission_events set state='failed'"), /append-only/);
  await assert.rejects(db.query("delete from public.mission_events"), /append-only/);
  await assert.rejects(db.query("truncate public.mission_events"), /append-only/);
  assert.equal((await db.query("select count(*)::int c from public.mission_events")).rows[0].c, 1);
});

test("cost_source must be consistent with cost_micro_usd", async () => {
  const db = await setup();
  await ins(db, {});
  await assert.rejects(ins(db, { seq: 2, event_type: "run_cost_recorded", state: "running", cost_micro_usd: 1200 }), /cost_consistent/);
  await assert.rejects(ins(db, { seq: 2, event_type: "run_cost_recorded", state: "running", cost_source: "measured" }), /cost_consistent/);
  await assert.rejects(ins(db, { seq: 2, event_type: "tool_call_completed", state: "running", cost_micro_usd: -1, cost_source: "measured" }), /check/);
  await ins(db, { seq: 2, event_type: "tool_call_completed", state: "running", cost_micro_usd: 1200, cost_source: "estimated", provider: "anthropic", model: "claude-sonnet-4-5" });
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const req = (seq, o) => ({ seq, event_type: "approval_requested", state: "waiting_approval", actor: "agent:builder", channel: "agent", expires_at: FUT, ...o });
const grantOf = (seq, o) => ({ seq, event_type: "approval_granted", state: "approved", actor: MEMBER, expires_at: FUT, ...o });

test("approval binds to payload_hash: stale after a different hash, single-use, voice refused", async () => {
  const db = await setup();
  const appr = { capability: "connector:gmail", grant_id: "g1", payload_hash: H("a") };
  await ins(db, { seq: 1 });
  await ins(db, req(2, appr));
  await ins(db, grantOf(3, appr));
  let s = (await db.query("select stale, consumed from public.mission_approval_status where grant_id='g1'")).rows[0];
  assert.deepEqual(s, { stale: false, consumed: false });
  await ins(db, { seq: 4, event_type: "approval_consumed", state: "running", ...appr });
  await assert.rejects(ins(db, { seq: 5, event_type: "approval_consumed", state: "running", ...appr }), /single_use/);
  assert.equal((await db.query("select consumed from public.mission_approval_status where grant_id='g1'")).rows[0].consumed, true);

  const a2 = { capability: "egress:api.example.com", grant_id: "g2", payload_hash: H("b") };
  await ins(db, req(5, a2)); await ins(db, grantOf(6, a2));
  await ins(db, { seq: 7, event_type: "payload_changed", state: "approval_stale", payload_hash: H("c") });
  assert.equal((await db.query("select stale from public.mission_approval_status where grant_id='g2'")).rows[0].stale, true);
  await assert.rejects(ins(db, { seq: 8, event_type: "approval_consumed", state: "running", ...a2 }), /stale/);

  const a3 = { capability: "secret:stripe", grant_id: "g3", payload_hash: H("c") };
  await ins(db, req(8, a3)); await ins(db, grantOf(9, a3));
  await assert.rejects(ins(db, { seq: 10, event_type: "approval_consumed", state: "running", ...a3, payload_hash: H("d") }), /another payload/);

  // Voice: refused for every approval-requiring class, whatever the separator.
  for (const [i, cap] of ["payment", "external_send.email", "external_send:email", "harness_change", "unsandboxed:shell", "connector:calendar", "merge:pr", "delete:file"].entries()) {
    const m = "voice" + i; const o = { mission_id: m, capability: cap, grant_id: "vg" + i, payload_hash: H("c") };
    await ins(db, req(1, o));
    await assert.rejects(ins(db, grantOf(2, { ...o, channel: "voice" })), /voice_not_approvable/, cap);
  }
  // Closed list: unknown classes (delete_repo, payments) refused outright.
  for (const cap of ["delete_repo", "payments:card", "rm.rf"]) await assert.rejects(ins(db, req(10, { capability: cap, grant_id: "x", payload_hash: H("c") })), /closed list/, cap);
  // Voice may approve a free, reversible capability.
  await ins(db, req(10, { capability: "repo.read", grant_id: "free", payload_hash: H("c") }));
  await ins(db, grantOf(11, { capability: "repo.read", grant_id: "free", payload_hash: H("c"), channel: "voice" }));
  // Approval without expiry / hash refused.
  await assert.rejects(ins(db, req(12, { capability: "tool:x", grant_id: "g6", payload_hash: H("c"), expires_at: null })), /approval_expiry/);
  await assert.rejects(ins(db, req(12, { capability: "tool:x", grant_id: "g6" })), /approval_binding/);
});

test("voice approval: exactly repo.read, repo.write_branch, test.run, build.run; refused for every other registry capability", async () => {
  const db = await setup();
  const VOICE = ["repo.read", "repo.write_branch", "test.run", "build.run"];
  const rows = (await db.query("select name, match_kind, voice_approvable from public.mission_capabilities order by name")).rows;
  assert.deepEqual(rows.filter(r => r.voice_approvable).map(r => r.name).sort(), [...VOICE].sort());
  for (const [i, r] of rows.entries()) {
    const cap = r.match_kind === "class" ? r.name + ":x" : r.name;
    const o = { mission_id: "vr" + i, capability: cap, grant_id: "vr" + i, payload_hash: H("c") };
    await ins(db, req(1, o));
    if (VOICE.includes(cap)) await ins(db, grantOf(2, { ...o, channel: "voice" }));
    else await assert.rejects(ins(db, grantOf(2, { ...o, channel: "voice" })), /voice_not_approvable/, cap);
  }
  // The table itself refuses flagging any other capability as voice-approvable.
  await assert.rejects(db.query("update public.mission_capabilities set voice_approvable = true where name = 'llm.subscription'"), /voice_allowlist/);
});

test("self-approval refused: agent/system channel, no prior request, requester = approver, non-member actor", async () => {
  const db = await setup();
  const o = { capability: "external_send:email", grant_id: "g1", payload_hash: H("a") };
  await ins(db, { seq: 1 });
  await assert.rejects(ins(db, grantOf(2, o)), /no matching approval_requested/);
  await ins(db, req(2, o));
  await assert.rejects(ins(db, grantOf(3, { ...o, channel: "agent", actor: "agent:bot" })), /grant_human_channel|human workspace member/);
  await assert.rejects(ins(db, grantOf(3, { ...o, channel: "system" })), /grant_human_channel/);
  await assert.rejects(ins(db, grantOf(3, { ...o, channel: "agent" })), /grant_human_channel/);
  await assert.rejects(ins(db, grantOf(3, { ...o, actor: "agent:bot" })), /human workspace member/);
  await assert.rejects(ins(db, grantOf(3, { ...o, actor: OUTSIDER })), /human workspace member/);
  await assert.rejects(ins(db, grantOf(3, { ...o, payload_hash: H("b") })), /no matching approval_requested/);
  await ins(db, req(3, { ...o, grant_id: "g2", actor: MEMBER, channel: "screen" }));
  await assert.rejects(ins(db, grantOf(4, { ...o, grant_id: "g2" })), /requester cannot approve/);
});

test("expiry uses now(): backdated consumption of an expired grant refused; future occurred_at refused", async () => {
  const db = await setup();
  const o = { capability: "secret:stripe", grant_id: "g1", payload_hash: H("a") };
  await ins(db, { seq: 1 });
  await assert.rejects(ins(db, req(2, { ...o, expires_at: "2020-01-01T00:00:00Z" })), /must be in the future/);
  const soon = new Date(Date.now() + 1500).toISOString();
  await ins(db, req(2, { ...o, expires_at: soon }));
  await ins(db, grantOf(3, { ...o, expires_at: soon }));
  await sleep(1700);
  await assert.rejects(ins(db, { seq: 4, event_type: "approval_consumed", state: "running", ...o, occurred_at: "2019-01-01T00:00:00Z" }), /expired/);
  await assert.rejects(ins(db, { seq: 4, occurred_at: new Date(Date.now() + 10 * 60_000).toISOString() }), /future/);
  await ins(db, { seq: 4, event_type: "step_started", state: "running", occurred_at: new Date(Date.now() + 30_000).toISOString() }); // within skew
});

test("RLS: members read and insert only privilege-reducing events as themselves; non-members refused", async () => {
  const db = await setup();
  await ins(db, {});
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${MEMBER}';`);
  assert.equal((await db.query("select count(*)::int c from public.mission_events")).rows[0].c, 1);
  for (const t of ["approval_granted", "approval_consumed", "run_cost_recorded", "tool_call_completed", "mission_started", "mission_succeeded"])
    await assert.rejects(ins(db, { seq: 2, event_type: t, state: "running", actor: MEMBER, capability: "repo.read", grant_id: "g", payload_hash: H("a"), expires_at: FUT, ...(t.includes("cost") || t.includes("tool") ? { cost_micro_usd: 1, cost_source: "measured" } : {}) }), /row-level security/, t);
  await assert.rejects(ins(db, { seq: 2, event_type: "mission_cancelled", state: "cancelled", actor: "someone-else" }), /actor must be the authenticated user/);
  await ins(db, { seq: 2, event_type: "mission_cancelled", state: "cancelled", actor: MEMBER });
  await db.exec(`set request.jwt.claim.sub = '${OUTSIDER}';`);
  assert.equal((await db.query("select count(*)::int c from public.mission_events")).rows[0].c, 0);
  assert.equal((await db.query("select count(*)::int c from public.mission_approval_status")).rows[0].c, 0);
  await assert.rejects(ins(db, { seq: 3, event_type: "mission_cancelled", state: "cancelled", actor: OUTSIDER }), /row-level security/);
  await db.exec(`set request.jwt.claim.sub = '${MEMBER}';`);
  await assert.rejects(db.query("update public.mission_events set state='failed'"), /permission denied/);
  await db.exec("set role anon;");
  await assert.rejects(db.query("select 1 from public.mission_events"), /permission denied/);
  await db.exec("reset role;");
});

test("revert removes everything", async () => {
  const db = await setup();
  await db.exec(revert);
  assert.equal((await db.query("select to_regclass('public.mission_events') r")).rows[0].r, null);
});
