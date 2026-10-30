import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createJiti } from 'jiti';
import { fixture, claimed, ledgerDeps } from './test-fixtures/atelier-execution.mjs';
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(process.cwd(), 'src'), 'server-only': path.join(process.cwd(), 'src/scripts/smoke/server-only-stub.mjs') } });
const C = await jiti.import('./atelier-execution-contract.ts');
const { createAtelierExecutionStore } = await jiti.import('./atelier-execution-store.ts');

// Deliberately a transaction MODEL, not an SQL emulator or a real Postgres proof.
function transactionalDouble(f, { failLedger = false, loseReply = false } = {}) {
  let tail = Promise.resolve();
  const state = { claim: null, consumed: false, ledger: [], mutations: 0 };
  return { state, rpc(name, params) {
    if (name === 'read_atelier_ledger_tail') return Promise.resolve({ data: { status: 'ready', tail: null }, error: null });
    if (name === 'lookup_atelier_execution') return Promise.resolve({ data: state.claim ? { status: 'existing', claim: state.claim } : { status: 'not_found' }, error: null });
    const pending = tail.then(async () => {
      const input = C.buildAtelierExecutionInput(f.mission, f.context, { ...f.request, attemptId: params.p_attempt_id });
      if (state.claim) return { data: { status: 'existing', claim: state.claim }, error: null };
      if (state.consumed) return { data: { status: 'approval_required' }, error: null };
      const transaction = { claim: claimed(input), consumed: true, ledger: [params.p_attempt_id], mutations: state.mutations + 1 };
      if (failLedger) throw Error('simulated ledger constraint failure before transaction commit');
      Object.assign(state, transaction);
      if (loseReply) throw Error('simulated reply loss AFTER transaction commit');
      return { data: { status: 'claimed', claim: state.claim }, error: null };
    });
    tail = pending.catch(() => undefined); return pending;
  } };
}
test('DI transaction model: two confirmations yield one claim/decision consumption/ledger; replay never retries', async () => {
  const f = await fixture(), db = transactionalDouble(f), store = createAtelierExecutionStore(db, ledgerDeps);
  const results = await Promise.all([store.claim(f.mission, f.context, f.request), store.claim(f.mission, f.context, { ...f.request, attemptId: f.request.installationId })]);
  assert.deepEqual(results.map(r => r.status).sort(), ['claimed', 'existing']);
  assert.equal(db.state.mutations, 1); assert.equal(db.state.ledger.length, 1);
  assert.ok(results.every(r => r.executionStarted === false && r.runtimeActivationAllowed === false));
});
test('DI transaction model: ledger failure leaves approval unspent and mission untouched', async () => {
  const f = await fixture(), db = transactionalDouble(f, { failLedger: true });
  assert.equal((await createAtelierExecutionStore(db, ledgerDeps).claim(f.mission, f.context, f.request)).status, 'reconciliation_required');
  assert.deepEqual(db.state, { claim: null, consumed: false, ledger: [], mutations: 0 });
});
test('DI transaction model: lost acknowledgement does not retry; explicit lookup recovers only a historical receipt', async () => {
  const f = await fixture(), db = transactionalDouble(f, { loseReply: true }), store = createAtelierExecutionStore(db, ledgerDeps);
  assert.equal((await store.claim(f.mission, f.context, f.request)).status, 'reconciliation_required');
  const recovered = await store.lookup(f.context, f.mission.id, f.request.runId);
  assert.equal(recovered.status, 'existing'); assert.equal(recovered.runtimeActivationAllowed, false); assert.equal(db.state.mutations, 1);
});
const sql = readFileSync('db/migrations/drafts/atelier_execution_boundary.sql', 'utf8').replace(/--[^\n]*/g, '');
test('SQL structural check only: source lock, decision lock+clock check, G1 consumption, claim and ledger ordered in one function', () => {
  const stages = ['select * into m', 'source_snapshot :=', 'select * into decision', 'decision.expires_at <= clock_timestamp()',
    'select * into consumed from public.consume_approval_decision', 'update public.missions', 'insert into public.action_ledger'];
  let offset = -1; for (const stage of stages) { const next = sql.indexOf(stage); assert.ok(next > offset, stage); offset = next; }
  assert.doesNotMatch(sql, /exception\s+when|on\s+conflict\s+do\s+nothing|security\s+definer/i);
  for (const fence of ['decision.user_id is distinct from p_actor_id', 'decision.reviewer_id is distinct from p_actor_id::text',
    'decision.metadata->\'atelierExecution\' is distinct from payload', 'decision.revoked_at is not null',
    'decision.consumed_at is not null', "decision.guardrails is distinct from '[]'::jsonb", 'source_snapshot is distinct from p_expected_snapshot']) assert.ok(sql.includes(fence), fence);
});
test('SQL structural check only: no new authority table/policy, restrictive RPC privileges, non-destructive revert', () => {
  assert.doesNotMatch(sql, /create\s+table|create\s+policy|alter\s+table|insert\s+into\s+public\.agent_review_approval_events/i);
  assert.equal((sql.match(/from public,anon,authenticated/g) ?? []).length, 3);
  assert.equal((sql.match(/to service_role/g) ?? []).length, 3);
  const revert = readFileSync('db/migrations/drafts/atelier_execution_boundary_revert.sql', 'utf8');
  assert.doesNotMatch(revert, /delete\s+from|truncate|drop\s+table/i);
  assert.equal((revert.match(/drop function if exists/g) ?? []).length, 3);
});

test('SQL structural only: sealed ledger CAS and fork protection precede consumption, no unsealed fallback', () => {
  const lock = sql.indexOf('perform pg_advisory_xact_lock');
  const check = sql.indexOf("head#>>'{tail,entry_hash}' is distinct from p_ledger->>'prevHash'");
  const consume = sql.indexOf('select * into consumed');
  assert.ok(lock > 0 && lock < check && check < consume);
  for (const required of ['action_ledger_genesis_unique', 'action_ledger_prev_hash_unique', 'action_ledger_entry_hash_unique',
    'prev_hash,entry_hash,hmac,canonical_version', 'canonical_version is distinct from 1', "ledger_content is distinct from expected_ledger", "p_ledger->>'canonicalJson'"])
    assert.ok(sql.includes(required), required);
  assert.doesNotMatch(sql, /drop\s+index|disable\s+trigger|set\s+row_security/i);
});
