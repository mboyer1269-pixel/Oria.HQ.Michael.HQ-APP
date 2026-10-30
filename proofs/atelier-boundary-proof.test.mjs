// Offline harness checks only: no PostgreSQL, no child process, no real fetch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { after, mock } from 'node:test';
import { readFileSync } from 'node:fs';
import { localConfig, networkFence, canonicalFixture, fixtureSql, claimParams, loadContracts, SYNTHETIC_KEY } from './prove-atelier-boundary-real-db.mjs';
const fetchSpy = mock.method(globalThis, 'fetch', () => { throw Error('Offline test attempted network'); });
after(() => { const calls = fetchSpy.mock.callCount(); mock.restoreAll(); assert.equal(calls, 0); });
const root = process.env.HQ_ROOT ?? process.cwd();

test('target guard accepts only isolated named loopback test database and PostgREST', () => {
  assert.equal(localConfig('postgres://postgres@127.0.0.1:5432/oria_test_atelier', 'http://127.0.0.1:3000').db, 'oria_test_atelier');
  for (const url of ['postgres://postgres@db.example:5432/oria_test_atelier', 'postgres://postgres@127.0.0.1:5432/postgres',
    'postgres://postgres:real-secret@127.0.0.1:5432/oria_test_atelier', 'postgres://postgres@127.0.0.1:5432/oria_test_atelier?host=external'])
    assert.throws(() => localConfig(url, 'http://127.0.0.1:3000'));
  for (const url of ['https://remote.example', 'http://127.0.0.1:3000/other', 'http://user:pass@127.0.0.1:3000'])
    assert.throws(() => localConfig('postgres://postgres@127.0.0.1:5432/oria_test_atelier', url));
});
test('network fence rejects unexpected destinations/methods even if a caller catches the error', async () => {
  let forwarded = 0; const fence = networkFence(async () => { forwarded++; return new Response('{}'); }, 'http://127.0.0.1:3000');
  await fence.fetch('http://127.0.0.1:3000/rpc/claim_atelier_execution', { method: 'POST' });
  for (const [url, method] of [['https://example.com', 'POST'], ['http://127.0.0.1:3000/rpc/claim_atelier_execution', 'GET'],
    ['http://127.0.0.1:3000/other', 'POST'], ['http://127.0.0.1:3000/rpc/claim_atelier_execution?x=1', 'POST']])
    await assert.rejects(() => fence.fetch(url, { method }));
  assert.equal(forwarded, 1); assert.equal(fence.counts.unexpected, 4);
});
test('actual TS fixture has exact snapshot, payload bytes, server identity and full sealed content', async () => {
  const m = await loadContracts(root); const f = await canonicalFixture(m, 'same-workspace-é');
  const ledger = m.C.buildAtelierExecutionLedger(f.input, null, SYNTHETIC_KEY, new Date().toISOString());
  const p = claimParams(f, ledger); assert.equal(p.p_expected_snapshot.workspace_id, f.context.workspaceId);
  assert.equal(p.p_payload_json, JSON.stringify(f.input.payload)); assert.equal(p.p_actor_id, f.context.actorId);
  assert.ok(!JSON.stringify(p).includes(SYNTHETIC_KEY)); assert.ok(f.mission.createdAt);
  const { v, ...row } = JSON.parse(ledger.canonicalJson); assert.equal(v, 1);
  assert.deepEqual(m.verifier.verifyChain([{ ...row, prev_hash: ledger.prevHash, entry_hash: ledger.entryHash,
    hmac: ledger.hmac, canonical_version: ledger.canonicalVersion }], { hmacKey: SYNTHETIC_KEY }), { ok: true, count: 1 });
  const sql = fixtureSql(f); assert.ok(sql.includes('workspace_id')); assert.ok(sql.includes(f.context.workspaceId));
  assert.ok(sql.includes(f.input.payloadHash)); assert.ok(sql.includes("Specification d''essai"));
});
test('draft runner contains 13 non-skippable proofs and never shells out an arbitrary command', () => {
  const source = readFileSync(new URL('./prove-atelier-boundary-real-db.mjs', import.meta.url), 'utf8');
  assert.equal((source.match(/await step\('/g) ?? []).length, 13);
  assert.ok(source.includes("assert.equal(results.length, 13)"));
  assert.ok(source.includes("assert.deepEqual(failures, []"));
  assert.doesNotMatch(source, /shell:\s*true|\.skip\(|only\(/);
  const job = readFileSync(new URL('../.github/workflows/atelier-boundary-proof.yml', import.meta.url), 'utf8');
  assert.ok(job.includes('postgres:16.4-alpine')); assert.ok(job.includes('postgrest/postgrest:v12.2.0'));
  assert.doesNotMatch(job, /secrets\.|supabase\.co|npm test|pull_request_target|workflow_dispatch/);
  assert.ok(source.includes('waitForClaimLock(b.pid, 2)'));
  assert.ok(source.includes('pg_blocking_pids'));
  assert.ok(source.includes('await b.release(observed); await pending'));
  assert.ok(job.includes('contents: read'));
  assert.ok(job.includes('persist-credentials: false'));
});
