// Source/fence tests only. No PostgreSQL or provider is started by this file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const url = new URL('./prove-execution-intent-admission-real-db.mjs', import.meta.url);
test('admission proof imports without SQL, network, CLI or environment mutation', async () => {
  const before = { ...process.env }, old = globalThis.fetch;
  globalThis.fetch = () => { throw Error('unexpected network during import'); };
  try { const m = await import(url.href); assert.equal(typeof m.runAdmissionProofs, 'function'); }
  finally { globalThis.fetch = old; }
  assert.deepEqual({ ...process.env }, before);
});
test('twelve mandatory groups retain explicit real facts, observed waiters and rollback markers', () => {
  const s = readFileSync(url, 'utf8');
  assert.equal((s.match(/await step\('/g) || []).length, 12);
  for (const token of ['assert.equal(results.length, 12)', 'assert.deepEqual(failures, [])',
    'pg_blocking_pids', 'ADMISSION_WAITERS=', 'observed_consumed_rollback', 'observed_append_rollback',
    'observed_claim_rollback', 'action_ledger_prev_hash_unique', 'assert.deepEqual(snapshot(f), before)',
    'dispatchAdmittedTool', 'takeCurrent', 'create_approval_decision', 'clock_timestamp()',
    'execution_intent_admission_v1_revert.sql', 'finally']) assert.ok(s.includes(token), token);
  assert.doesNotMatch(s, /\.skip\(|shell:\s*true|--run|process\.env\s*[.[][^\n]*=/);
});
test('runner refuses non-disposable targets before invoking injected SQL', async () => {
  const { runAdmissionProofs } = await import(url.href);
  for (const target of ['postgres://postgres@remote:5432/oria_test_x', 'postgres://postgres@127.0.0.1:5432/production']) {
    let reads = 0;
    await assert.rejects(runAdmissionProofs({ root: '.', sql: () => { reads++; }, db: {}, env: {}, args: [target] }));
    assert.equal(reads, 0);
  }
});
test('provenance negatives preserve canonical source and reach decision classification before admission/current refusal', () => {
  const s = readFileSync(url, 'utf8');
  for (const token of ["['foreign-user', 'member-reviewer', 'foreign-reviewer', 'altered-scope', 'altered-snapshot', 'rejected-human']",
    "['altered-scope', 'foreign-reviewer', 'altered-snapshot']", 'corruptDecisionProvenance',
    "human_approved=false,decision='rejected',status='invalid',consumed_at=null", "reviewer_role='member'",
    "assert.equal(refused.data?.status, 'approval_required')", "assert.equal(current.data?.status, 'approval_required')",
    "assert.equal(provenance.data?.state, kind === 'foreign-user' ? 'missing' : 'invalid')",
    'assert.deepEqual(params(f.input), canonicalParams)', 'assert.equal(effects, noEffects)']) assert.ok(s.includes(token), token);
  assert.doesNotMatch(s, /(?:drop|disable)\s+constraint|(?:ledger_required_before_execution|no_runtime_execution_authorized|no_auto_approval|approval_event_only)\s*=\s*false/i);
  const schema = readFileSync(new URL('../db/migrations/0033_approval_decision_consume.sql', import.meta.url), 'utf8');
  assert.ok(schema.includes("status not in ('approved', 'consumed')"));
  assert.ok(schema.includes("and decision = 'approved' and human_approved = true"));
});
test('extra or altered psql arguments refuse before SQL even with a valid disposable first URL', async () => {
  const { runAdmissionProofs } = await import(url.href);
  const pg = 'postgres://postgres@127.0.0.1:5432/oria_test_admission';
  const exact = [pg, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'];
  for (const args of [[...exact, '-d', 'postgres://postgres@remote:5432/production'],
    [...exact, '-c', 'select 1'], [pg, '-X', '-v', 'ON_ERROR_STOP=1'], [pg, '-qAt', '-X', '-v', 'ON_ERROR_STOP=1']]) {
    let reads = 0;
    await assert.rejects(runAdmissionProofs({ root: '.', sql: () => { reads++; return 'oria_test_admission'; }, db: {}, env: {}, args }));
    assert.equal(reads, 0);
  }
});
