// Offline tests only: genuine owner guards, synthetic getUser, no DB/network.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { createJiti } from 'jiti';
const root = path.resolve(import.meta.dirname, '..');
const owner = '00000000-0000-4000-8000-0000000000a1';
test('actual atomic POST runs real owner authentication: anon401/member403 and owner reaches input validation without IO', async () => {
  process.env.NODE_ENV = 'test'; process.env.MICHAEL_HQ_OWNER_ID = owner;
  delete globalThis.__ownerApiSessionTestResult;
  let io = 0; const old = globalThis.fetch;
  globalThis.fetch = () => { io++; throw Error('unexpected offline IO'); };
  try {
    const j = createJiti(import.meta.url, { alias: {
      '@/lib/supabase/server': path.join(root, 'proofs/approval-auth-session-fixture.mjs'),
      '@': path.join(root, 'src'), 'server-only': path.join(root, 'src/scripts/smoke/server-only-stub.mjs'),
    } });
    const session = await j.import(path.join(root, 'proofs/approval-auth-session-fixture.mjs'));
    const route = await j.import(path.join(root, 'src/app/api/agents/execution-intents/[intentId]/approve/route.ts'));
    const auth = await j.import('@/server/auth/owner');
    const request = () => new Request('http://localhost/api/agents/execution-intents/offline/approve', { method: 'POST', body: '{}' });
    for (const [user, status] of [[null, 401], [{ id: '00000000-0000-4000-8000-0000000000b1' }, 403], [{ id: owner }, 409]]) {
      session.setSyntheticAuthUser(user);
      const response = await route.POST(request(), { params: Promise.resolve({ intentId: 'offline' }) });
      assert.equal(response.status, status);
      if (user?.id === owner) assert.equal((await response.json()).code, 'approval_required');
    }
    assert.equal(await auth.getAuthenticatedActorId(), owner);
    assert.equal(await auth.requireOwnerApiSession(), null);
    assert.equal(io, 0);
  } finally { globalThis.fetch = old; }
});
test('ten original cases now wire atomic admission, genuine producer and complete rollback facts', () => {
  const s = readFileSync(path.join(root, 'proofs/prove-approval-real-db.mjs'), 'utf8');
  assert.equal((s.match(/await step\(/g) || []).length, 10);
  for (const token of ['approval-auth-session-fixture.mjs', 'admit_execution_intent_v1', 'admission_unconfirmed',
    'assert.deepEqual(facts(id), before)', 'setSyntheticAuthUser(null)', 'const d = await decisionFor(id, h)',
    'createApprovalDecisionProducer()', 'rpcAdmissions']) assert.ok(s.includes(token), token);
  assert.doesNotMatch(s, /globalThis\.__ownerApiSessionTestResult\s*=|createApproveHandler|RPC returns 0 rows, no dispatch/);
  const shell = readFileSync(path.join(root, 'proofs/run-approval-real-db.sh'), 'utf8');
  for (const name of ['0001_missions.sql', 'atelier_execution_boundary.sql', 'atelier_owner_spec_v2.sql', 'execution_intent_admission_v1.sql']) assert.ok(shell.includes(name), name);
});
