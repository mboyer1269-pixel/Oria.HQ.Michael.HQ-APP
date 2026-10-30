import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';
import { fixture, claimed, ledgerDeps, withLedgerHead } from './test-fixtures/atelier-execution.mjs';
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(process.cwd(), 'src'), 'server-only': path.join(process.cwd(), 'src/scripts/smoke/server-only-stub.mjs') } });
const { createAtelierExecutionStore: realStore, MAX_ATELIER_EXECUTION_RPC_BYTES } = await jiti.import('./atelier-execution-store.ts');
const C = await jiti.import('./atelier-execution-contract.ts');
const createAtelierExecutionStore = client => realStore(client ? withLedgerHead(client.rpc) : null, ledgerDeps);

test('DI: one mutation RPC after a read-only ledger head carries exact source, canonical payload bytes and server identity', async () => {
  const f = await fixture(); const input = C.buildAtelierExecutionInput(f.mission, f.context, f.request); let calls = 0;
  const store = createAtelierExecutionStore({ rpc: async (name, p) => {
    calls++; assert.equal(name, 'claim_atelier_execution'); assert.deepEqual(p.p_expected_snapshot, input.snapshot);
    assert.equal(p.p_actor_id, f.context.actorId); assert.equal(p.p_payload_json, input.payloadJson);
    assert.equal(p.p_expected_updated_at, f.mission.updatedAt); assert.equal(p.p_ledger.canonicalVersion, 1);
    assert.equal(p.p_ledger.prevHash, null); assert.match(p.p_ledger.hmac, /^[a-f0-9]{64}$/); assert.ok(!JSON.stringify(p).includes(ledgerDeps.hmacKey())); return { data: { status: 'claimed', claim: claimed(input) }, error: null };
  } });
  const result = await store.claim(f.mission, f.context, f.request);
  assert.equal(result.status, 'claimed'); assert.equal(calls, 1); assert.equal(result.executionStarted, false); assert.equal(result.runtimeActivationAllowed, false);
});
test('DI: no database, invalid input and excessive multi-byte body never attempt a claim', async () => {
  const f = await fixture(); assert.equal((await createAtelierExecutionStore(null).claim(f.mission, f.context, f.request)).status, 'unavailable');
  let called = false; const store = createAtelierExecutionStore({ rpc: async () => { called = true; throw Error('must not call'); } });
  assert.equal((await store.claim(f.mission, f.context, { ...f.request, approved: true })).status, 'invalid_request');
  f.mission.input.unrelated = '界'.repeat(MAX_ATELIER_EXECUTION_RPC_BYTES / 2);
  assert.deepEqual(await store.claim(f.mission, f.context, f.request), { status: 'request_too_large', claimAttempted: false, executionStarted: false, runtimeActivationAllowed: false });
  assert.equal(called, false);
});
test('DI: RPC errors, lost response and malformed/wrong receipts are uncertain with no retry/read/spawn', async () => {
  const f = await fixture(); const input = C.buildAtelierExecutionInput(f.mission, f.context, f.request);
  for (const response of [null, { status: 'claimed', claim: { ...claimed(input), actorId: f.request.decisionId } },
    { status: 'claimed', claim: { ...claimed(input), attemptId: f.request.decisionId, ledgerId: f.request.decisionId } },
    { status: 'claimed', claim: { ...claimed(input), decisionId: f.request.attemptId } }, { status: 'claimed', claim: { ...claimed(input), executionStarted: true } }]) {
    let calls = 0; const result = await createAtelierExecutionStore({ rpc: async () => { calls++; return { data: response, error: null }; } }).claim(f.mission, f.context, f.request);
    assert.equal(result.status, 'reconciliation_required'); assert.equal(calls, 1);
  }
  for (const rpc of [async () => { throw Error('response lost'); }, async () => ({ data: null, error: { message: 'secret DB diagnostic' } })])
    assert.equal((await createAtelierExecutionStore({ rpc }).claim(f.mission, f.context, f.request)).status, 'reconciliation_required');
});
test('DI: typed denials remain distinct; existing competitor receipt is historical, never a fresh start', async () => {
  const f = await fixture(); const input = C.buildAtelierExecutionInput(f.mission, f.context, f.request);
  for (const status of ['not_found', 'conflict', 'approval_required', 'reconciliation_required'])
    assert.equal((await createAtelierExecutionStore({ rpc: async () => ({ data: { status }, error: null }) }).claim(f.mission, f.context, f.request)).status, status);
  const winner = { ...claimed(input), attemptId: f.request.decisionId, ledgerId: f.request.decisionId };
  const r = await createAtelierExecutionStore({ rpc: async () => ({ data: { status: 'existing', claim: winner }, error: null }) }).claim(f.mission, f.context, f.request);
  assert.equal(r.status, 'existing'); assert.equal(r.executionStarted, false);
});
test('DI: explicit lookup never calls mutation RPC and rejects mismatched scoped receipt', async () => {
  const f = await fixture(); const input = C.buildAtelierExecutionInput(f.mission, f.context, f.request);
  for (const other of [false, true]) {
    const r = await createAtelierExecutionStore({ rpc: async (name, p) => {
      assert.equal(name, 'lookup_atelier_execution'); assert.equal(p.p_mode_id, f.context.modeId);
      return { data: { status: 'existing', claim: { ...claimed(input), workspaceId: other ? 'other' : f.context.workspaceId } }, error: null };
    } }).lookup(f.context, f.mission.id, f.request.runId);
    assert.equal(r.status, other ? 'reconciliation_required' : 'existing');
  }
});

test('DI: tail read failure, disabled seal or missing key never attempt a mutation', async () => {
  const f = await fixture();
  for (const config of [{ ...ledgerDeps, enabled: () => false }, { ...ledgerDeps, hmacKey: () => '' }]) {
    let calls = 0; const result = await realStore({ rpc: async () => { calls++; throw Error('must not call'); } }, config).claim(f.mission, f.context, f.request);
    assert.equal(result.status, 'unavailable'); assert.equal(calls, 0);
  }
  for (const data of [null, { status: 'ledger_unavailable' }, { status: 'ready' }, { status: 'ready', tail: {} }]) {
    const calls = []; const result = await realStore({ rpc: async name => { calls.push(name); return { data, error: null }; } }, ledgerDeps).claim(f.mission, f.context, f.request);
    assert.equal(result.status, 'unavailable'); assert.deepEqual(calls, ['read_atelier_ledger_tail']);
  }
});
