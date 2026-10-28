// Copied from Sentinelle's /workspace/oria-sentinelle/sentinelle-tests/pr425-attacks.test.mjs
// (her file is untouched). Cases are kept; tests marked CONSTAT documented a
// vulnerability and now assert the fix ("CORRIGÉ"). The owner DISABLE/DROP TRIGGER
// case remains a documented, accepted risk (spec §3, follow-up issue).
// Sentinelle #425 — attaques PGlite sur 0037_mission_events (local, aucune base distante).
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const R = new URL("../../../", import.meta.url);
const mig = readFileSync(new URL("db/migrations/0037_mission_events.sql", R), "utf8");
const rev = readFileSync(new URL("db/migrations/0037_mission_events_revert.sql", R), "utf8");
const H = (c) => c.repeat(64), FUT = "2099-01-01T00:00:00Z";
const M = "11111111-1111-1111-1111-111111111111", O = "22222222-2222-2222-2222-222222222222";
async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; grant usage on schema auth to authenticated, anon, service_role;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.workspace_members (workspace_id text not null, user_id uuid not null, role text not null, primary key (workspace_id, user_id));
    grant select on public.workspace_members to authenticated, service_role;
    insert into public.workspace_members values ('ws-a','${M}','owner'),('ws-b','${O}','owner');`);
  await db.exec(mig); await db.exec(mig);
  return db;
}
let n = 0;
const ins = (db, o = {}) => { n++; const e = { workspace_id: "ws-a", mission_id: "m1", seq: 1, intent_key: `k${n}`, event_type: "mission_queued", state: "queued", trace_id: "t", payload_hash: null, actor: "u", channel: "screen", capability: null, grant_id: null, expires_at: null, cost_micro_usd: null, cost_source: null, occurred_at: "2026-10-25T12:00:00Z", ...o };
  const c = Object.keys(e); return db.query(`insert into public.mission_events (${c})values(${c.map((_, i) => "$" + (i + 1))})`, Object.values(e)); };
const as = (db, role, sub = "") => db.exec(`reset role; set request.jwt.claim.sub='${sub}'; set role ${role};`);
const count = async (db) => (await db.query("select count(*)::int c from public.mission_events")).rows[0].c;
const request = (db, seq, o = {}) => ins(db, { seq, event_type: "approval_requested", state: "waiting_approval", payload_hash: H("a"), capability: "external_send:email", grant_id: "g1", expires_at: FUT, actor: "agent:builder", channel: "agent", ...o });
const grant = (db, seq, o = {}) => ins(db, { seq, event_type: "approval_granted", state: "approved", payload_hash: H("a"), capability: "external_send:email", grant_id: "g1", expires_at: FUT, actor: M, ...o });

test("P1 append-only: anon/authenticated/service_role refusés pour UPDATE/DELETE/TRUNCATE", async () => {
  const db = await setup(); await ins(db);
  for (const r of ["anon", "authenticated", "service_role"]) {
    await as(db, r, r === "authenticated" ? M : "");
    for (const q of ["update public.mission_events set state='failed'", "delete from public.mission_events", "truncate public.mission_events",
      "alter table public.mission_events disable trigger all", "drop trigger mission_events_no_update on public.mission_events"])
      await assert.rejects(db.query(q), /permission denied|must be owner|append-only/, `${r}: ${q}`);
  }
  await db.exec("reset role"); assert.equal(await count(db), 1);
});
test("SECURITY DEFINER (superuser) ne contourne pas le trigger", async () => {
  const db = await setup(); await ins(db);
  await db.exec(`create function public.evil() returns void language sql security definer as $$ delete from public.mission_events $$; grant execute on function public.evil() to authenticated;`);
  await as(db, "authenticated", M); await assert.rejects(db.query("select public.evil()"), /append-only/);
});
test("CONSTAT propriétaire: DISABLE TRIGGER / DROP TRIGGER / session_replication_role effacent l'historique", async () => {
  const db = await setup(); await ins(db); await ins(db, { seq: 2 }); await ins(db, { seq: 3 });
  await db.exec(`create role tab_owner nologin; alter table public.mission_events owner to tab_owner;`);
  await db.exec("set role tab_owner");
  await db.exec("alter table public.mission_events disable trigger mission_events_no_update; delete from public.mission_events where seq=3; alter table public.mission_events enable trigger mission_events_no_update;");
  await db.exec("drop trigger mission_events_no_update on public.mission_events; update public.mission_events set state='failed' where seq=2;");
  await assert.rejects(db.exec("set session_replication_role = replica"), /permission denied/); // non-superuser
  await db.exec("reset role; set session_replication_role = replica; truncate public.mission_events; set session_replication_role = origin;");
  // TRUNCATE trigger ne se déclenche pas en replica? vérifier
  assert.equal(await count(db), 0);
});
test("seq: rollback ne crée pas de trou; doublon refusé", async () => {
  const db = await setup(); await ins(db);
  await db.exec("begin"); await ins(db, { seq: 2 }); await db.exec("rollback");
  await ins(db, { seq: 2 }); await assert.rejects(ins(db, { seq: 2 }), /seq must be 3/);
});
test("approbation: double consommation, autre hash, autre workspace refusés", async () => {
  const db = await setup(); await ins(db); await request(db, 2); await grant(db, 3);
  const c = { event_type: "approval_consumed", state: "running", payload_hash: H("a"), capability: "external_send:email", grant_id: "g1" };
  await assert.rejects(ins(db, { seq: 4, ...c, payload_hash: H("b") }), /another payload/);
  await ins(db, { workspace_id: "ws-b", seq: 1 });
  await assert.rejects(ins(db, { workspace_id: "ws-b", seq: 2, ...c }), /not found/);
  await ins(db, { seq: 4, ...c }); await assert.rejects(ins(db, { seq: 5, ...c }), /grant_single_use/);
});
test("CORRIGÉ expiration: grant déjà expiré refusé; antidater occurred_at ne contourne plus l'expiration (now())", async () => {
  const db = await setup(); await ins(db);
  await assert.rejects(grant(db, 2, { expires_at: "2020-01-01T00:00:00Z" }), /must be in the future/);
  const soon = new Date(Date.now() + 1500).toISOString();
  await request(db, 2, { expires_at: soon }); await grant(db, 3, { expires_at: soon });
  await new Promise((r) => setTimeout(r, 1700));
  const c = { seq: 4, event_type: "approval_consumed", state: "running", payload_hash: H("a"), capability: "external_send:email", grant_id: "g1" };
  await assert.rejects(ins(db, { ...c, occurred_at: "2019-01-01T00:00:00Z" }), /expired/);
  await assert.rejects(ins(db, { ...c, occurred_at: "2099-01-01T00:00:00Z" }), /future/);
  const v = (await db.query("select consumed, expired from public.mission_approval_status")).rows[0];
  assert.deepEqual(v, { consumed: false, expired: true });
});
test("CORRIGÉ voix: liste fermée en SQL, séparateurs ':' et '.', casse", async () => {
  const db = await setup(); await ins(db); await request(db, 2);
  await assert.rejects(grant(db, 3, { channel: "voice" }), /voice_not_approvable/);
  await assert.rejects(grant(db, 3, { channel: "voice", capability: "External_send:email" }), /capability_check|closed list/);
  let s = 3;
  for (const cap of ["harness_change", "unsandboxed:shell", "external_send.email"]) {
    await request(db, s, { capability: cap, grant_id: "g" + s });
    await assert.rejects(grant(db, s + 1, { channel: "voice", capability: cap, grant_id: "g" + s }), /voice_not_approvable/, cap);
    await ins(db, { seq: s + 1, event_type: "step_started", state: "running" }); s += 2;
  }
  for (const cap of ["payments:card", "delete_repo"]) // hors liste fermée: refusé dès la demande
    await assert.rejects(request(db, s, { capability: cap, grant_id: "x" + s }), /closed list/, cap);
});
test("CORRIGÉ auto-approbation: un membre (JWT) ne peut ni s'accorder ni consommer une approbation", async () => {
  const db = await setup(); await as(db, "authenticated", M);
  await ins(db, { actor: M });
  await assert.rejects(grant(db, 2, { channel: "agent", actor: "agent:bot" }), /row-level security/);
  await assert.rejects(grant(db, 2), /row-level security/); // test 8: membre simple -> approval_granted refusé
  await assert.rejects(ins(db, { seq: 2, channel: "agent", event_type: "approval_consumed", state: "running", payload_hash: H("a"), capability: "external_send:email", grant_id: "g1", actor: M }), /row-level security/);
  await db.exec("reset role; set request.jwt.claim.sub = ''");
  await request(db, 2);
  await assert.rejects(grant(db, 3, { channel: "agent", actor: "agent:bot" }), /grant_human_channel|human workspace member/); // même via service_role
  await assert.rejects(grant(db, 3, { channel: "agent" }), /grant_human_channel/);
});
test("RLS: workspace inexistant, membre retiré, vue security_invoker", async () => {
  const db = await setup(); await ins(db); await request(db, 2); await grant(db, 3);
  await as(db, "authenticated", M);
  await assert.rejects(ins(db, { workspace_id: "ws-ghost", actor: M }), /row-level security/);
  await as(db, "authenticated", O);
  assert.equal(await count(db), 0);
  assert.equal((await db.query("select count(*)::int c from public.mission_approval_status")).rows[0].c, 0);
  await db.exec("reset role; delete from public.workspace_members where user_id='" + M + "'");
  await as(db, "authenticated", M); assert.equal(await count(db), 0);
  await assert.rejects(ins(db, { seq: 4, actor: M }), /row-level security/);
  await db.exec("reset role; insert into public.workspace_members values ('ws-ghost','" + M + "','owner')");
  await as(db, "authenticated", M); await ins(db, { workspace_id: "ws-ghost", actor: M }); // aucun FK: workspace fantôme dès qu'une ligne membre existe
});
test("coûts et idempotence", async () => {
  const db = await setup(); await ins(db, { intent_key: "dup" });
  await assert.rejects(ins(db, { seq: 2, cost_micro_usd: 5 }), /cost_consistent/);
  await assert.rejects(ins(db, { seq: 2, cost_source: "measured" }), /cost_consistent/);
  await assert.rejects(ins(db, { seq: 2, cost_micro_usd: -1, cost_source: "measured" }), /cost_micro_usd_check/);
  await ins(db, { workspace_id: "ws-b", intent_key: "dup" }); // clé unique par workspace
});
test("migration x2 + revert + réapplication", async () => {
  const db = await setup(); await ins(db); await db.exec(rev);
  assert.equal((await db.query("select to_regclass('public.mission_events') t, to_regclass('public.mission_approval_status') v")).rows[0].t, null);
  assert.equal((await db.query("select count(*)::int c from pg_proc where proname like 'mission_events_%'")).rows[0].c, 0);
  await db.exec(rev); await db.exec(mig); await ins(db);
});
