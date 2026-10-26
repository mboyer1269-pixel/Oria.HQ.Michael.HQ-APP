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

test("approval binds to payload_hash: stale after a different hash, single-use, expiry, voice refused", async () => {
  const db = await setup();
  const appr = { capability: "connector:gmail", grant_id: "g1", payload_hash: H("a") };
  await ins(db, { seq: 1 });
  await ins(db, { seq: 2, event_type: "approval_requested", state: "waiting_approval", ...appr, expires_at: FUT });
  await ins(db, { seq: 3, event_type: "approval_granted", state: "approved", ...appr, expires_at: FUT, actor: MEMBER });
  let s = (await db.query("select stale, consumed from public.mission_approval_status where grant_id='g1'")).rows[0];
  assert.deepEqual(s, { stale: false, consumed: false });
  await ins(db, { seq: 4, event_type: "approval_consumed", state: "running", ...appr });
  await assert.rejects(ins(db, { seq: 5, event_type: "approval_consumed", state: "running", ...appr }), /single_use/);
  s = (await db.query("select consumed from public.mission_approval_status where grant_id='g1'")).rows[0];
  assert.equal(s.consumed, true);

  // Stale: grant g2 then payload changes -> consumption refused, view says stale.
  const a2 = { capability: "egress:api.example.com", grant_id: "g2", payload_hash: H("b") };
  await ins(db, { seq: 5, event_type: "approval_granted", state: "approved", ...a2, expires_at: FUT });
  await ins(db, { seq: 6, event_type: "payload_changed", state: "approval_stale", payload_hash: H("c") });
  assert.equal((await db.query("select stale from public.mission_approval_status where grant_id='g2'")).rows[0].stale, true);
  await assert.rejects(ins(db, { seq: 7, event_type: "approval_consumed", state: "running", ...a2 }), /stale/);

  // Expired grant.
  const a3 = { capability: "secret:stripe", grant_id: "g3", payload_hash: H("c") };
  await ins(db, { seq: 7, event_type: "approval_granted", state: "approved", ...a3, expires_at: "2026-10-25T12:00:01Z" });
  await assert.rejects(ins(db, { seq: 8, event_type: "approval_consumed", state: "running", ...a3, occurred_at: "2026-10-25T13:00:00Z" }), /expired/);

  // Mismatched payload on consumption.
  await assert.rejects(ins(db, { seq: 8, event_type: "approval_consumed", state: "running", ...a3, payload_hash: H("d") }), /another payload/);

  // Voice may not approve merge/payment/external_send/delete; may approve others.
  await assert.rejects(ins(db, { seq: 8, event_type: "approval_granted", state: "approved", capability: "merge:pr", grant_id: "g4", payload_hash: H("c"), expires_at: FUT, channel: "voice" }), /voice_no_irreversible/);
  await assert.rejects(ins(db, { seq: 8, event_type: "approval_granted", state: "approved", capability: "payment", grant_id: "g4", payload_hash: H("c"), expires_at: FUT, channel: "voice" }), /voice_no_irreversible/);
  await ins(db, { seq: 8, event_type: "approval_granted", state: "approved", capability: "connector:calendar", grant_id: "g5", payload_hash: H("c"), expires_at: FUT, channel: "voice" });
  // Approval without expiry / hash refused.
  await assert.rejects(ins(db, { seq: 9, event_type: "approval_requested", state: "waiting_approval", capability: "tool:x", grant_id: "g6", payload_hash: H("c") }), /approval_expiry/);
  await assert.rejects(ins(db, { seq: 9, event_type: "approval_requested", state: "waiting_approval", capability: "tool:x", grant_id: "g6", expires_at: FUT }), /approval_binding/);
});

test("RLS: members read/insert, non-members see nothing and cannot insert, no update grant", async () => {
  const db = await setup();
  await ins(db, {});
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${MEMBER}';`);
  assert.equal((await db.query("select count(*)::int c from public.mission_events")).rows[0].c, 1);
  await ins(db, { seq: 2, event_type: "mission_started", state: "running" });
  await db.exec(`set request.jwt.claim.sub = '${OUTSIDER}';`);
  assert.equal((await db.query("select count(*)::int c from public.mission_events")).rows[0].c, 0);
  assert.equal((await db.query("select count(*)::int c from public.mission_approval_status")).rows[0].c, 0);
  await assert.rejects(ins(db, { seq: 3, event_type: "mission_failed", state: "failed" }), /row-level security/);
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
