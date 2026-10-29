import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(process.cwd(), 'src'), 'server-only': path.join(process.cwd(), 'src/scripts/smoke/server-only-stub.mjs') } });
const C = await jiti.import('./atelier-execution-contract.ts');
import { fixture, claimed } from './test-fixtures/atelier-execution.mjs';

test('execution payload pins complete reservation without manufacturing a permission or modifying it', async () => {
  const f = await fixture(), before = structuredClone(f);
  const input = C.buildAtelierExecutionInput(f.mission, f.context, f.request);
  assert.ok(input); assert.deepEqual(input.payload.binding, f.mission.input._atelierRun.binding);
  assert.equal(input.payload.automaticCommitAllowed, false); assert.equal(input.payload.runtimeActivationAllowed, false);
  assert.equal(input.payloadHash, C.hashExecutionPayloadJson(input.payloadJson));
  assert.equal(input.expectedUpdatedAt, f.mission.updatedAt); assert.deepEqual(f, before);
  assert.match(input.intentId, /^atelier1:workspace-a:.*:spec.start$/);
});
test('changed source, budget, workspace, actor, forged claim and extra body fields fail closed', async () => {
  const f = await fixture();
  for (const mutate of [m => { m.objective = 'changed'; }, m => { m.costBudgetCents = 99; }, m => { m.status = 'running'; },
    m => { m.input._atelierRun.binding.output = 'code'; }, m => { m.input._atelierRun.binding.bindingHash = '0'.repeat(64); }]) {
    const m = structuredClone(f.mission); mutate(m); assert.equal(C.buildAtelierExecutionInput(m, f.context, f.request), null);
  }
  for (const ctx of [{ ...f.context, workspaceId: 'other' }, { ...f.context, actorId: 'not-a-session-id' }, { ...f.context, modeId: 'other' }])
    assert.equal(C.buildAtelierExecutionInput(f.mission, ctx, f.request), null);
  assert.equal(C.buildAtelierExecutionInput(f.mission, f.context, { ...f.request, approved: true }), null);
});
test('decision and attempt IDs do not change the reviewed payload; installation changes do', async () => {
  const f = await fixture(); const original = C.buildAtelierExecutionInput(f.mission, f.context, f.request);
  const retry = C.buildAtelierExecutionInput(f.mission, f.context, { ...f.request, attemptId: f.request.decisionId });
  assert.equal(original.payloadHash, retry.payloadHash);
  assert.notEqual(original.payloadHash, C.buildAtelierExecutionInput(f.mission, f.context, { ...f.request, installationId: f.request.decisionId }).payloadHash);
});
test('full snapshot preserves unrelated evidence and explicit nulls; timestamp precision is not rounded', async () => {
  const f = await fixture(); f.mission.input.other = { preserved: true }; f.mission.result = { other: 'evidence' };
  const input = C.buildAtelierExecutionInput(f.mission, f.context, f.request);
  assert.equal(input.snapshot.cost_budget_cents, null); assert.deepEqual(input.snapshot.result, f.mission.result);
  assert.equal(input.expectedUpdatedAt, '2026-10-28T20:00:01.000123Z');
});
test('claim correspondence checks canonical IDs, actor, hashes, installation and ledger fence', async () => {
  const f = await fixture(), input = C.buildAtelierExecutionInput(f.mission, f.context, f.request);
  assert.equal(C.executionClaimMatches(claimed(input), input), true);
  for (const key of ['workspaceId', 'actorId', 'missionId', 'runId', 'installationId', 'bindingHash', 'payloadHash', 'intentId', 'ledgerId'])
    assert.equal(C.executionClaimMatches({ ...claimed(input), [key]: 'other' }, input), false, key);
});

test('ledger bridge preserves frozen v1 canonical bytes and seals two appends on one workspace', async () => {
  const { ledgerDeps } = await import('./test-fixtures/atelier-execution.mjs');
  const { verifyChain } = await jiti.import('@/server/ledger/hash-chain-verifier');
  const f = await fixture(); const input = C.buildAtelierExecutionInput(f.mission, f.context, f.request);
  const first = C.buildAtelierExecutionLedger(input, null, ledgerDeps.hmacKey(), ledgerDeps.now());
  const unpack = seal => { const { v, ...row } = JSON.parse(seal.canonicalJson); assert.equal(v, 1);
    return { ...row, prev_hash: seal.prevHash, entry_hash: seal.entryHash, hmac: seal.hmac, canonical_version: seal.canonicalVersion }; };
  const row = unpack(first);
  const next = C.buildAtelierExecutionLedger({ ...input, request: { ...input.request, attemptId: input.request.installationId } },
    { ...row, created_at: '2026-10-28T21:00:00+00:00' }, ledgerDeps.hmacKey(), ledgerDeps.now());
  assert.equal(next.prevHash, first.entryHash);
  assert.equal(JSON.parse(next.canonicalJson).created_at, '2026-10-28T21:00:00.001Z');
  assert.deepEqual(verifyChain([row, unpack(next)], { hmacKey: ledgerDeps.hmacKey() }), { ok: true, count: 2 });
  for (const bad of [{ ...row, workspace_id: 'foreign' }, { ...row, summary: 'tampered' }, { ...row, hmac: 'a'.repeat(64) }])
    assert.throws(() => C.buildAtelierExecutionLedger(input, bad, ledgerDeps.hmacKey(), ledgerDeps.now()));
});
