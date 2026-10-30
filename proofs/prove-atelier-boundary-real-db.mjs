// VALIDATION CANDIDATE ONLY. Explicit --run requires a disposable loopback CI database.
// Not a node:test file; importing it performs no I/O, database or network work.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE = 'b79e1cef590a071caa271b514b18abe24563b92a';
export const SCHEMA_FILES = ['db/schema.sql', 'db/migrations/0001_missions.sql',
  'db/migrations/0002_typed_ledger_events.sql', 'db/migrations/0005_missions_rls.sql',
  'db/migrations/0010_agent_review_approval_events.sql', 'db/migrations/0020_action_ledger_workspace_scope.sql',
  'db/migrations/0022_action_ledger_hash_chain_phase1.sql', 'db/migrations/0023_action_ledger_hash_chain_phase2.sql',
  'db/migrations/0033_approval_decision_consume.sql'];
export const SYNTHETIC_KEY = 'oria-disposable-proof-only-not-a-production-secret';
export function localConfig(pg, rest) {
  const p = new URL(pg), r = new URL(rest);
  assert.equal(p.protocol, 'postgres:'); assert.equal(p.hostname, '127.0.0.1'); assert.equal(p.port, '5432');
  assert.equal(p.username, 'postgres'); assert.equal(p.password, ''); assert.equal(p.search + p.hash, '');
  assert.match(p.pathname, /^\/oria_test_[a-z0-9_]+$/);
  assert.equal(r.origin, 'http://127.0.0.1:3000'); assert.equal(r.pathname, '/');
  assert.equal(r.username + r.password + r.search + r.hash, '');
  return { pg: p.href, rest: r.origin, db: p.pathname.slice(1) };
}
export const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
export function networkFence(realFetch, rest) {
  const counts = { allowed: 0, unexpected: 0 };
  return { counts, fetch: async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    if (url.origin !== rest || url.search || url.hash || method !== 'POST'
      || !/^\/rpc\/(read_atelier_ledger_tail|claim_atelier_execution|lookup_atelier_execution)$/.test(url.pathname)) {
      counts.unexpected++; throw Error('Unexpected network destination or method in isolated DB proof');
    }
    counts.allowed++; return realFetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(10000) });
  } };
}
// Explicit direct-loopback transport: does not inherit HTTP_PROXY/HTTPS_PROXY,
// follow redirects, open arbitrary destinations, or use a global agent proxy.
export function loopbackFetch(input, init = {}) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  assert.equal(url.origin, 'http://127.0.0.1:3000');
  assert.equal(init.method, 'POST');
  assert.match(url.pathname, /^\/rpc\/(read_atelier_ledger_tail|claim_atelier_execution|lookup_atelier_execution)$/);
  assert.equal(url.search + url.hash + url.username + url.password, '');
  assert.ok(init.body === undefined || typeof init.body === 'string');
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: '127.0.0.1', port: 3000, method: 'POST', path: url.pathname,
      headers: Object.fromEntries(new Headers(init.headers)), agent: false, signal: init.signal, timeout: 10000 }, res => {
      const chunks = []; let bytes = 0;
      res.on('data', chunk => { bytes += chunk.length; if (bytes > 1000000) req.destroy(Error('Oversized local proof response')); else chunks.push(chunk); });
      res.on('error', reject);
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode,
        headers: Object.fromEntries(Object.entries(res.headers).filter(([, value]) => typeof value === 'string')) })));
    });
    req.on('error', reject); req.on('timeout', () => req.destroy(Error('Local RPC timeout'))); req.end(init.body);
  });
}
export async function loadContracts(root) {
  const require = createRequire(path.join(root, 'package.json'));
  const { createJiti } = require('jiti');
  const jiti = createJiti(path.join(root, 'package.json'), { alias: { '@': path.join(root, 'src'),
    'server-only': path.join(root, 'src/scripts/smoke/server-only-stub.mjs') } });
  return { D: await jiti.import(path.join(root, 'src/server/missions/atelier-development-contract.ts')),
    C: await jiti.import(path.join(root, 'src/server/missions/atelier-execution-contract.ts')),
    development: await jiti.import(path.join(root, 'src/server/missions/development-mission.ts')),
    store: await jiti.import(path.join(root, 'src/server/missions/atelier-execution-store.ts')),
    verifier: await jiti.import(path.join(root, 'src/server/ledger/hash-chain-verifier.ts')),
    fields: await jiti.import(path.join(root, 'src/server/ledger/hash-chain-ledger-fields.ts')),
    PostgrestClient: require('@supabase/postgrest-js').PostgrestClient };
}
export async function canonicalFixture(modules, workspaceId = 'atelier-proof-' + randomUUID()) {
  const context = { workspaceId, modeId: 'hq', actorId: randomUUID() };
  let mission;
  await modules.development.createDevelopmentService({ enabled: () => true,
    store: () => ({ save: async value => { mission = structuredClone(value); }, load: async () => null }) }).create({
    requestId: randomUUID(), title: "Specification d'essai 界", objective: 'Synthetic bounded specification',
    scope: 'SPEC.md only', acceptanceCriteria: 'No process execution or external effect',
  }, context);
  assert.ok(mission);
  const binding = modules.D.buildAtelierDevelopmentBinding(mission, context, { missionId: mission.id,
    repository: { relativePath: 'synthetic/repo', baseSha: 'a'.repeat(40) },
    selection: { runtimeId: 'codex', modelId: 'synthetic-model', catalogRevision: 'synthetic-revision' }, timeoutMs: 60000 });
  assert.ok(binding);
  const request = { runId: randomUUID(), decisionId: randomUUID(), attemptId: randomUUID(), installationId: randomUUID() };
  mission.input._atelierRun = { version: 1, state: 'reserved', runId: request.runId,
    reservedAt: new Date().toISOString(), binding, executionRequested: false };
  mission.updatedAt = new Date().toISOString().replace(/\d{3}Z$/, '000123Z');
  const input = modules.C.buildAtelierExecutionInput(mission, context, request); assert.ok(input);
  return { context, mission, request, input };
}
export function fixtureSql(f, ttl = "interval '5 minutes'") {
  const row = { ...f.input.snapshot, updated_at: f.mission.updatedAt, created_at: f.mission.createdAt };
  return `insert into auth.users(id) values (${quote(f.context.actorId)});
    insert into public.missions select (jsonb_populate_record(null::public.missions,${quote(JSON.stringify(row))}::jsonb)).*;
    insert into public.agent_review_approval_events(id,user_id,source_packet_id,source_queue_item_id,agent_id,outcome_id,
      reviewer_id,reviewer_role,decision,decision_rationale,approved_scope,human_approved,status,expires_at,workspace_id,intent_id,payload_hash,metadata)
    values (${quote(f.request.decisionId)},${quote(f.context.actorId)},'synthetic-packet','synthetic-queue','builder','synthetic-outcome',
      ${quote(f.context.actorId)},'owner','approved','Disposable fixture only','{"allowedActionTypes":["atelier.spec.start"]}',true,'approved',
      clock_timestamp()+${ttl},${quote(f.context.workspaceId)},${quote(f.input.intentId)},${quote(f.input.payloadHash)},
      ${quote(JSON.stringify({ atelierExecution: f.input.payload }))}::jsonb);`;
}
export function claimParams(f, ledger) {
  return { p_workspace_id: f.context.workspaceId, p_actor_id: f.context.actorId, p_mission_id: f.mission.id,
    p_expected_updated_at: f.input.expectedUpdatedAt, p_expected_snapshot: f.input.snapshot, p_payload_json: f.input.payloadJson,
    p_decision_id: f.request.decisionId, p_attempt_id: f.request.attemptId, p_ledger: ledger };
}

export async function main(root, config) {
  config = localConfig(config.pg, config.rest); // Recheck even for programmatic callers.
  const psqlArgs = [config.pg, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'];
  // Deliberately do not inherit PG*, Supabase, provider or proxy credentials.
  const env = { PATH: process.env.PATH, PGCONNECT_TIMEOUT: '5', PGOPTIONS: '-c statement_timeout=10000 -c lock_timeout=8000' };
  const sql = statement => { const r = spawnSync('psql', psqlArgs, { input: statement, encoding: 'utf8', env });
    if (r.status !== 0) throw Error(r.stderr || 'psql failed'); return r.stdout.trim(); };
  assert.equal(sql('select current_database();'), config.db);
  assert.equal(sql("select count(*) from pg_tables where schemaname='public';"), '0', 'Disposable database must start empty');
  // Check original G1 schema bytes, not a conveniently weakened synthetic table.
  for (const file of SCHEMA_FILES) {
    const original = spawnSync('git', ['show', `${BASE}:${file}`], { cwd: root });
    assert.equal(original.status, 0, `Pinned G1 object missing: ${file}`);
    assert.deepEqual(readFileSync(path.join(root, file)), original.stdout, `G1 schema drift: ${file}`);
  }
  sql(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create role qualification_service nologin bypassrls; create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as 'select null::uuid';`);
  for (const file of [...SCHEMA_FILES, 'db/migrations/drafts/atelier_execution_boundary.sql']) sql(readFileSync(path.join(root, file), 'utf8'));
  sql(`grant usage on schema public to service_role; grant select,insert,update on all tables in schema public to service_role;
    grant service_role to qualification_service; notify pgrst,'reload schema';`);
  sql("set oria.allow_disposable_db_tests='on';\n" + readFileSync(path.join(root, 'db/migrations/drafts/atelier_execution_boundary_verify.sql'), 'utf8'));
  const realFetch = globalThis.fetch; const fence = networkFence(loopbackFetch, config.rest); globalThis.fetch = fence.fetch;
  const results = [], failures = [];
  try {
    const m = await loadContracts(root);
    const db = new m.PostgrestClient(config.rest, { fetch: fence.fetch });
    const deps = { hmacKey: () => SYNTHETIC_KEY, enabled: () => true };
    const store = m.store.createAtelierExecutionStore(db, deps);
    const fixture = async (workspace, ttl) => { const f = await canonicalFixture(m, workspace); sql(fixtureSql(f, ttl)); return f; };
    const facts = f => JSON.parse(sql(`select jsonb_build_object('status',d.status,'consumed',d.consumed_at is not null,
      'claimed',m.input ? '_atelierExecution','ledger',(select count(*) from action_ledger where mission_id=m.id))
      from missions m join agent_review_approval_events d on d.id=${quote(f.request.decisionId)} where m.id=${quote(f.mission.id)};`));
    const unchanged = f => assert.deepEqual(facts(f), { status: 'approved', consumed: false, claimed: false, ledger: 0 });
    const verifyWorkspace = workspace => {
      const rows = JSON.parse(sql(`select coalesce(jsonb_agg(to_jsonb(l) order by created_at),'[]'::jsonb) from action_ledger l where workspace_id=${quote(workspace)};`));
      assert.ok(rows.length > 0); const chain = rows.map(row => m.fields.toLedgerChainEntry(row));
      assert.deepEqual(m.verifier.verifyChain(chain, { hmacKey: SYNTHETIC_KEY }), { ok: true, count: chain.length }); return rows;
    };
    const seal = f => m.C.buildAtelierExecutionLedger(f.input, null, SYNTHETIC_KEY, new Date().toISOString());
    const step = async (name, run) => { try { await run(); results.push(name); console.log(`PROVEN (real DB): ${name}`); }
      catch (error) { failures.push({ name, message: error.message }); console.error(`FAILED (real DB): ${name}: ${error.message}`); } };
    // Readiness is an allowed read-only RPC, never an external health request.
    let ready = false;
    for (let i = 0; i < 40; i++) {
      const r = await db.rpc('read_atelier_ledger_tail', { p_workspace_id: 'synthetic-readiness' });
      if (!r.error && r.data?.status === 'ready') { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'PostgREST schema did not load');
    await step('canonical TS bytes -> real RPC -> sealed ledger, idempotent receipt and scoped lookup', async () => {
      const f = await fixture(); const a = await store.claim(f.mission, f.context, f.request); assert.equal(a.status, 'claimed');
      assert.equal(a.claim.payloadHash, f.input.payloadHash); assert.equal(a.runtimeActivationAllowed, false);
      assert.equal((await store.claim(f.mission, f.context, f.request)).status, 'existing');
      assert.equal((await store.lookup({ ...f.context, workspaceId: 'foreign' }, f.mission.id, f.request.runId)).status, 'not_found');
      assert.deepEqual(facts(f), { status: 'consumed', consumed: true, claimed: true, ledger: 1 }); verifyWorkspace(f.context.workspaceId);
    });
    await step('two different missions append to the SAME nonempty sealed workspace ledger', async () => {
      const workspace = 'same-' + randomUUID(); const first = await fixture(workspace), second = await fixture(workspace);
      assert.equal((await store.claim(first.mission, first.context, first.request)).status, 'claimed');
      assert.equal((await store.claim(second.mission, second.context, second.request)).status, 'claimed');
      const rows = verifyWorkspace(workspace); assert.equal(rows.length, 2); assert.equal(rows[1].prev_hash, rows[0].entry_hash);
    });
    await step('two sessions confirm one mission: exactly one transaction, no second consumption', async () => {
      const f = await fixture(); const requests = [f.request, { ...f.request, attemptId: randomUUID() }];
      const b = await blocker(`select id from missions where id=${quote(f.mission.id)} for update;`);
      const pending = Promise.all(requests.map(request => store.claim(f.mission, f.context, request)));
      let observed = false;
      try { await waitForClaimLock(b.pid, 2); unchanged(f); observed = true; }
      finally { await b.release(observed); await pending; }
      const r = await pending;
      assert.deepEqual(r.map(x => x.status).sort(), ['claimed', 'existing']);
      assert.deepEqual(facts(f), { status: 'consumed', consumed: true, claimed: true, ledger: 1 });
      verifyWorkspace(f.context.workspaceId);
    });
    await step('stale source and changed approved payload are refused before consumption', async () => {
      const stale = await fixture(); sql(`update missions set objective='changed without version bump' where id=${quote(stale.mission.id)};`);
      assert.equal((await store.claim(stale.mission, stale.context, stale.request)).status, 'conflict'); unchanged(stale);
      const f = await fixture(); const p = claimParams(f, seal(f));
      const changed = await db.rpc('claim_atelier_execution', { ...p, p_payload_json: JSON.stringify({ ...f.input.payload, addedInstructions: 'not approved' }) });
      assert.equal(changed.data.status, 'conflict'); unchanged(f);
      const other = await db.rpc('claim_atelier_execution', { ...p, p_actor_id: randomUUID() });
      assert.equal(other.data.status, 'conflict'); unchanged(f);
    });
    await step('tampered seal and foreign workspace are refused before any approval spend', async () => {
      const f = await fixture(); const p = claimParams(f, seal(f));
      for (const altered of [{ ...p.p_ledger, entryHash: 'f'.repeat(64) },
        { ...p.p_ledger, canonicalJson: p.p_ledger.canonicalJson.replace('mission.atelier_dispatch_requested', 'mission.different') }]) {
        const r = await db.rpc('claim_atelier_execution', { ...p, p_ledger: altered });
        assert.equal(r.data.status, 'conflict'); unchanged(f);
      }
      const r = await db.rpc('claim_atelier_execution', { ...p, p_workspace_id: 'foreign' });
      assert.equal(r.data.status, 'not_found'); unchanged(f);
    });
    await step('expired/revoked/foreign reviewer decisions are never consumed', async () => {
      for (const update of ["expires_at=clock_timestamp()-interval '1 second'", 'revoked_at=clock_timestamp()', `reviewer_id=${quote(randomUUID())}`, `constraints='["unimplemented constraint"]'::jsonb`, `guardrails='["unimplemented guardrail"]'::jsonb`]) {
        const f = await fixture(); sql(`update agent_review_approval_events set ${update} where id=${quote(f.request.decisionId)};`);
        assert.equal((await store.claim(f.mission, f.context, f.request)).status, 'approval_required'); unchanged(f);
      }
    });
    async function blocker(lockSql, initialUpdate = '') {
      const child = spawn('psql', psqlArgs, { env, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '', stderr = ''; child.stdout.on('data', value => { stdout += value; }); child.stderr.on('data', value => { stderr += value; });
      const timer = setTimeout(() => child.kill('SIGTERM'), 10000);
      const done = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error(stderr)); }); });
      done.catch(() => undefined); // readiness failures still clean up this owned process below
      child.stdin.write(`begin; ${lockSql} ${initialUpdate} select 'ORIA_LOCK_READY:' || pg_backend_pid();\n`);
      const deadline = Date.now() + 5000;
      let marker;
      try { while (!(marker = /ORIA_LOCK_READY:(\d+)/.exec(stdout))) { assert.ok(Date.now() < deadline, 'blocker not ready'); await new Promise(r => setTimeout(r, 10)); } }
      catch (error) { child.stdin.end('rollback;\n'); await done.catch(() => undefined); throw error; }
      let released = false;
      return { pid: Number(marker[1]), release: async (commit = false) => {
        if (!released) { released = true; child.stdin.end(commit ? 'commit;\n' : 'rollback;\n'); } await done;
      } };
    }
    async function waitForClaimLock(blockerPid, expected = 1) {
      assert.ok(Number.isSafeInteger(blockerPid) && blockerPid > 0);
      const deadline = Date.now() + 5000;
      // A second row claimant can wait on the first claimant's tuple lock rather
      // than directly on the owner. Follow that exact blocker chain, not an
      // unrelated global lock count or mere overlap of client promises.
      const observed = () => Number(sql(`with recursive blocked(pid) as (
        select pid from pg_stat_activity where ${blockerPid}=any(pg_blocking_pids(pid))
        union select a.pid from pg_stat_activity a join blocked b on b.pid=any(pg_blocking_pids(a.pid))
      ) select count(distinct a.pid) from pg_stat_activity a join blocked b using(pid)
        where a.datname=current_database() and a.wait_event_type='Lock'
          and a.query like '%claim_atelier_execution%';`));
      while (observed() < expected) {
        assert.ok(Date.now() < deadline, `${expected} claim sessions not observed on the exact PostgreSQL blocker chain`);
        await new Promise(r => setTimeout(r, 10));
      }
      console.log(`OBSERVED_CLAIM_LOCK_WAITERS=${expected}`);
    }
    await step('revocation wins an observed row-lock race -> no claim, consume or ledger', async () => {
      const f = await fixture(); const b = await blocker(`select id from agent_review_approval_events where id=${quote(f.request.decisionId)} for update;`, `update agent_review_approval_events set revoked_at=clock_timestamp() where id=${quote(f.request.decisionId)};`);
      const pending = store.claim(f.mission, f.context, f.request);
      let observed = false;
      try { await waitForClaimLock(b.pid); observed = true; } finally { await b.release(observed); await pending; }
      assert.equal((await pending).status, 'approval_required'); unchanged(f);
    });
    await step('approval expires during an observed lock wait -> clock-time refusal', async () => {
      const f = await fixture(undefined, "interval '2 seconds'"); const b = await blocker(`select id from agent_review_approval_events where id=${quote(f.request.decisionId)} for update;`);
      const pending = store.claim(f.mission, f.context, f.request);
      try {
        await waitForClaimLock(b.pid); const deadline = Date.now() + 5000;
        while (sql(`select clock_timestamp() > expires_at from agent_review_approval_events where id=${quote(f.request.decisionId)};`) !== 't') {
          assert.ok(Date.now() < deadline); await new Promise(r => setTimeout(r, 20));
        }
      } finally { await b.release(false); await pending; }
      assert.equal((await pending).status, 'approval_required'); unchanged(f);
    });
    await step('same-workspace competing head CAS: loser remains entirely unspent, no implicit retry', async () => {
      const workspace = 'head-race-' + randomUUID(); const a = await fixture(workspace), b = await fixture(workspace);
      let arrivals = 0, release; const bothRead = new Promise(resolve => { release = resolve; });
      const racing = { rpc: async (name, params) => {
        const result = await db.rpc(name, params);
        if (name === 'read_atelier_ledger_tail') { arrivals++; if (arrivals === 2) release();
          let timer;
          try { await Promise.race([bothRead, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Two head reads not observed')), 5000); })]); }
          finally { clearTimeout(timer); } }
        return result;
      } };
      const s = m.store.createAtelierExecutionStore(racing, deps);
      const r = await Promise.all([s.claim(a.mission, a.context, a.request), s.claim(b.mission, b.context, b.request)]);
      assert.deepEqual(r.map(x => x.status).sort(), ['claimed', 'conflict']);
      unchanged(r[0].status === 'conflict' ? a : b); assert.equal(verifyWorkspace(workspace).length, 1);
    });
    await step('ledger insert failure after consume rolls back approval and mission on a nonempty chain', async () => {
      const workspace = 'rollback-' + randomUUID(); const first = await fixture(workspace), f = await fixture(workspace);
      assert.equal((await store.claim(first.mission, first.context, first.request)).status, 'claimed');
      // Only a synthetic disposable constraint, never disable existing indexes/triggers/RLS.
      sql(`alter table action_ledger add constraint atelier_synthetic_insert_failure check (mission_id <> ${quote(f.mission.id)});`);
      try { assert.equal((await store.claim(f.mission, f.context, f.request)).status, 'reconciliation_required'); unchanged(f);
        assert.equal(verifyWorkspace(workspace).length, 1);
      } finally { sql('alter table action_ledger drop constraint atelier_synthetic_insert_failure;'); }
    });
    await step('acknowledgement lost after commit -> historical lookup only, no resend', async () => {
      const f = await fixture(); let mutations = 0;
      const client = { rpc: async (name, params) => {
        const result = await db.rpc(name, params);
        if (name === 'claim_atelier_execution') { mutations++; assert.equal(result.data.status, 'claimed'); throw Error('synthetic lost acknowledgement'); }
        return result;
      } };
      const s = m.store.createAtelierExecutionStore(client, deps);
      assert.equal((await s.claim(f.mission, f.context, f.request)).status, 'reconciliation_required');
      const receipt = await s.lookup(f.context, f.mission.id, f.request.runId);
      assert.equal(receipt.status, 'existing'); assert.equal(receipt.runtimeActivationAllowed, false); assert.equal(mutations, 1);
      sql(`update agent_review_approval_events set revoked_at=clock_timestamp() where id=${quote(f.request.decisionId)};`);
      assert.equal((await s.lookup(f.context, f.mission.id, f.request.runId)).executionStarted, false);
      assert.equal(mutations, 1); assert.equal(facts(f).ledger, 1); verifyWorkspace(f.context.workspaceId);
    });
    await step('anon/authenticated cannot invoke any execution or tail RPC', async () => {
      for (const role of ['anon', 'authenticated']) {
        const f = await fixture(); const p = claimParams(f, seal(f));
        const calls = [`select read_atelier_ledger_tail(${quote(f.context.workspaceId)});`,
          `select lookup_atelier_execution(${quote(f.context.workspaceId)},${quote(f.context.actorId)},'hq',${quote(f.mission.id)},${quote(f.request.runId)});`,
          `select claim_atelier_execution(${Object.values(p).map(value => quote(typeof value === 'object' ? JSON.stringify(value) : value)).join(',')});`];
        for (const call of calls) assert.throws(() => sql(`set role ${role}; ${call}`), /permission denied/i);
        unchanged(f);
      }
    });
    await step('revert removes only functions, preserving decisions/mission receipts/ledger facts', async () => {
      const before = sql('select (select count(*) from missions),(select count(*) from action_ledger),(select count(*) from agent_review_approval_events);');
      sql(readFileSync(path.join(root, 'db/migrations/drafts/atelier_execution_boundary_revert.sql'), 'utf8'));
      assert.equal(sql('select (select count(*) from missions),(select count(*) from action_ledger),(select count(*) from agent_review_approval_events);'), before);
      assert.equal(sql("select to_regprocedure('public.read_atelier_ledger_tail(text)') is null;"), 't');
      assert.equal(sql("select to_regprocedure('public.consume_approval_decision(text,uuid,text,text)') is not null;"), 't');
    });
    assert.equal(fence.counts.unexpected, 0, 'Unexpected network attempt, even if caught by production code');
    console.log(`UNEXPECTED_NETWORK=${fence.counts.unexpected}`);
    console.log(JSON.stringify({ proofsPassed: results.length, failures, allowedLocalRpcCalls: fence.counts.allowed }));
    assert.deepEqual(failures, [], 'At least one real DB proof failed');
    assert.equal(results.length, 13); console.log('ALL 13 ATELIER REAL-DB PROOFS PASSED');
  } finally { globalThis.fetch = realFetch; assert.equal(fence.counts.unexpected, 0); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv[2], '--run', 'Explicit --run required; importing this proposal never runs it');
  await main(path.resolve(process.env.HQ_ROOT ?? process.cwd()), localConfig(process.env.CI_PG_URL, process.env.POSTGREST_DIRECT_URL));
}
