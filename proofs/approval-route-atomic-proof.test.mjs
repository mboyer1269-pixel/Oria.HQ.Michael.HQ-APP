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
test('DB proof HTTP assertions agree with real atomic factory serialization, not internal service outcomes', async () => {
  const { default: ts } = await import('typescript');
  const j = createJiti(import.meta.url, { alias: { '@': path.join(root, 'src'),
    'server-only': path.join(root, 'src/scripts/smoke/server-only-stub.mjs') } });
  const { createAtomicApproveHandler } = await j.import('@/server/agents/execution-intent-approve-handler');
  const { approveAndDispatchExecutionIntent } = await j.import('@/server/agents/execution-intent-approval-service');
  const { precheckGovernedTool } = await j.import('@/server/runtime/governed-tool-dispatch');
  const { evaluateLiveExecution } = await j.import('@/server/runtime/execution-guard');
  const { listExecutionCorridors } = await j.import('@/server/runtime/execution-corridors');
  const { hashExecutionIntentPayload } = await j.import('@/server/agents/execution-intent-payload-hash');
  const { default: vm } = await import('node:vm');
  const corridor = listExecutionCorridors({ N8N_WEBHOOK_URL: 'http://127.0.0.1:9/fixture', N8N_SECRET: 'synthetic', AGENT_WEBHOOK_SIGNING_SECRET: 'synthetic' }).find(c => c.guard.outcome !== 'BLOCK');
  assert.ok(corridor);
  const id = 'http-contract-fixture', decisionId = '22222222-2222-4222-8222-222222222222';
  const intent = { intentId: id, workspaceId: 'michael-hq', agentId: corridor.agentId, skillId: corridor.skillId,
    toolName: 'n8n_webhook_trigger', autonomyLevel: corridor.evaluatedAtAutonomyLevel, status: 'pending', requiresCeoApproval: true,
    payload: { agentId: corridor.agentId, skillId: corridor.skillId, client: 'Synthetic', email: 'fixture@example.invalid',
      actionType: 'draft', missionId: 'fixture', data: {} }, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() };
  const source = readFileSync(path.join(root, 'proofs/prove-approval-real-db.mjs'), 'utf8');
  const ast = ts.createSourceFile('runner.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const checksFor = prefix => {
    const checks = [];
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(ast) === 'step' && node.arguments[0]?.text?.startsWith(prefix)) {
        const body = node.arguments[1].body;
        function collect(n) {
          if (ts.isExpressionStatement(n) && /^assert\./.test(n.getText(ast)) && /\br\.body\b/.test(n.getText(ast))) checks.push(n.getText(ast));
          else ts.forEachChild(n, collect);
        }
        collect(body);
      } else ts.forEachChild(node, visit);
    }
    visit(ast); assert.ok(checks.length >= 2, prefix + ': HTTP status/body assertions must remain'); return checks.join('\n');
  };
  for (const [admissionStatus, prefix, http] of [['conflict', '2b.', 409], ['approval_required', '5.', 403], ['unconfirmed', '3.', 503]]) {
    const calls = [], before = structuredClone(intent);
    const forbidden = async () => { calls.push('effect'); throw Error('No effect permitted after refused admission'); };
    const POST = createAtomicApproveHandler({ requireOwnerApiSession: async () => null, getAuthenticatedActorId: async () => owner,
      getActiveWorkspaceContext: () => ({ workspace: { id: 'michael-hq' }, userId: owner }),
      getAgentExecutionIntent: async () => { calls.push('read'); return intent; },
      admission: { admit: async () => { calls.push('admit'); return { status: admissionStatus }; }, takeCurrent: forbidden },
      toolRegistry: { get: () => ({ handler: forbidden }) }, evaluateLiveExecution, precheckGovernedTool,
      approveAndDispatchExecutionIntent, randomUUID: () => '33333333-3333-4333-8333-333333333333', webhookEnv: {},
      transitionAgentExecutionIntent: forbidden, recordLedgerEvent: forbidden, billApprovedIntentUsage: forbidden, dispatchGovernedTool: forbidden });
    const response = await POST(new Request('http://localhost/approve', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decisionId, expectedPayloadHash: hashExecutionIntentPayload(intent.payload) }) }), { params: Promise.resolve({ intentId: id }) });
    const r = { status: response.status, body: await response.json() };
    assert.equal(r.status, http);
    // Execute the actual runner assertions against the actual serialized HTTP
    // result: pre-fix runner asks for an absent outcome and this test is RED.
    vm.runInThisContext(`(assert, r, id) => { ${checksFor(prefix)} }`)(assert, r, id);
    assert.deepEqual(intent, before); assert.ok(!calls.includes('effect'));
    assert.deepEqual(calls, admissionStatus === 'unconfirmed' ? ['read', 'admit'] : ['read', 'admit', 'read']);
  }
});
