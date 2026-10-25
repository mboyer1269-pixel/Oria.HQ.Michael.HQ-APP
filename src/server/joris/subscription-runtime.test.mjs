import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createJiti } from 'jiti';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(root, 'src'), 'server-only': path.join(root, 'src/__server-only-noop.js') } });
const { runSubscriptionTurn, subscriptionEnvironment } = await jiti.import('../ai/subscription-runtime.ts');
const { subscriptionOptions, subscriptionCatalogSchema } = await jiti.import('../ai/subscription-catalog.ts');
const { clearBrainRouteLog, getBrainRouteLog } = await jiti.import('../ai/model-router.ts');
const env = { PATH: '/test', HOME: '/test', ORIA_HQ_SUBSCRIPTION_RUNTIMES: '1', OPENAI_API_KEY: 'fixture-key', ANTHROPIC_API_KEY: 'fixture-key', ANTHROPIC_AUTH_TOKEN: 'fixture-token' };
const catalog = () => ({ revision: 'test', entries: [{ runtimeId: 'codex', modelId: 'fixture-codex' }, { runtimeId: 'claude-code', modelId: 'fixture-claude' }] });
function fakeSpawner(failure, mutate) {
  const calls = [];
  return { calls, spawn(binary, args, options) {
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => { child.killed = true; return true; };
    const call = { binary, args, options, prompt: '', child }; calls.push(call);
    child.stdin.on('data', data => { call.prompt += data; });
    queueMicrotask(() => {
      if (failure === 'missing') { child.emit('error', new Error('ENOENT private diagnostic')); return; }
      const auth = args[0] === 'login' || args[0] === 'auth';
      if (auth) {
        mutate?.();
        child.stdout.write(binary === 'codex' ? failure === 'api' ? 'Logged in using API key' : 'Logged in using ChatGPT' : JSON.stringify({ loggedIn: true, authMethod: failure === 'api' ? 'api_key' : 'claude.ai' }));
      } else {
        if (failure === 'timeout') return;
        child.stdout.write(binary === 'codex' ? [JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'OK' } }), JSON.stringify({ type: 'turn.completed', model: 'observed-codex' })].join('\n') : JSON.stringify({ type: 'result', result: 'OK', modelUsage: { 'observed-claude': {} } }));
      }
      child.emit('close', !auth && failure === 'exit' ? 1 : 0);
    });
    return child;
  } };
}
for (const runtimeId of ['codex', 'claude-code']) {
  test(`${runtimeId}: catalog selection, binary, stdin, subscription projection and bound log`, async () => {
    clearBrainRouteLog();
    const c = catalog(), selection = subscriptionOptions(c, env).find(o => o.runtimeId === runtimeId);
    const fake = fakeSpawner();
    const result = await runSubscriptionTurn(selection, 'tiny private prompt', c, { ...fake, env, log: () => {} });
    assert.equal(result.status, 'completed');
    assert.equal(result.consumptionMode, 'subscription');
    assert.equal(selection.consumptionMode, 'subscription');
    assert.equal(result.summary, 'OK');
    const call = fake.calls[1];
    assert.equal(call.binary, runtimeId === 'codex' ? 'codex' : 'claude');
    assert.ok(call.args.includes(selection.modelId));
    assert.equal(call.prompt, 'tiny private prompt');
    assert.ok(!call.args.includes(call.prompt));
    assert.equal(call.options.shell, false);
    for (const spawned of fake.calls) for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']) assert.equal(spawned.options.env[key], undefined);
    if (runtimeId === 'codex') assert.deepEqual(call.args.slice(0, 8), ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '-m', selection.modelId, '--json', '-c']);
    else assert.equal(call.args[call.args.indexOf('--tools') + 1], '');
    assert.match(result.executedModelId, /^observed-/);
    assert.equal(getBrainRouteLog().at(-1).model, selection.modelId);
    assert.equal(getBrainRouteLog().at(-1).runtimeId, runtimeId);
    assert.equal(getBrainRouteLog().at(-1).source, 'binding');
    assert.ok(!JSON.stringify(getBrainRouteLog()).includes('tiny private prompt'));
  });
  for (const failure of ['missing', 'exit', 'timeout', 'api']) test(`${runtimeId}: ${failure} blocks without paid fallback`, async () => {
    const c = catalog(), fake = fakeSpawner(failure);
    const result = await runSubscriptionTurn(subscriptionOptions(c, env).find(o => o.runtimeId === runtimeId), 'tiny', c, { ...fake, env, timeoutMs: 10, log: () => {} });
    assert.equal(result.status, 'blocked');
    assert.match(result.summary, /BLOQUÉ.*Aucun appel API/);
    assert.equal(result.executedModelId, null);
    assert.equal(fake.calls.length, ['missing', 'api'].includes(failure) ? 1 : 2);
    if (failure === 'timeout') { assert.equal(fake.calls[1].child.killed, true); assert.equal(fake.calls[1].options.detached, process.platform !== 'win32'); }
  });
}
test('environment allowlist strips every API credential and provider override', () => {
  const original = { ...env, OPENAI_API_KEY: 'secret', CODEX_API_KEY: 'secret', ANTHROPIC_API_KEY: 'secret', ANTHROPIC_AUTH_TOKEN: 'secret', CLAUDE_CODE_OAUTH_TOKEN: 'secret', AWS_SECRET_ACCESS_KEY: 'secret', OPENAI_BASE_URL: 'private', NODE_OPTIONS: 'private', CLAUDE_CODE_USE_BEDROCK: '1' };
  const clean = subscriptionEnvironment(original);
  for (const key of Object.keys(original).filter(k => !['PATH', 'HOME'].includes(k))) assert.equal(clean[key], undefined);
  assert.equal(clean.HOME, env.HOME);
  assert.equal(original.OPENAI_API_KEY, 'secret');
});
test('config snapshot survives catalog and environment mutation during authentication', async () => {
  const c = catalog(), e = { ...env }, selection = subscriptionOptions(c, e)[0];
  const fake = fakeSpawner(undefined, () => { c.entries[0].modelId = 'changed'; c.revision = 'changed'; e.PATH = 'changed'; });
  const result = await runSubscriptionTurn(selection, 'tiny', c, { ...fake, env: e, log: () => {} });
  assert.equal(result.status, 'completed');
  assert.ok(Object.isFrozen(result.runConfig));
  assert.equal(result.runConfig.modelId, 'fixture-codex');
  assert.ok(fake.calls[1].args.includes('fixture-codex'));
  assert.equal(fake.calls[1].options.env.PATH, '/test');
  assert.throws(() => { result.runConfig.modelId = 'mutated'; }, TypeError);
});
test('new model requires only a catalog entry; malformed, stale and disabled choices block before spawn', async () => {
  const c = catalog(); c.entries.push({ runtimeId: 'codex', modelId: 'brand-new-model' });
  assert.ok(subscriptionCatalogSchema.safeParse(c).success);
  const selection = subscriptionOptions(c, env).at(-1), fake = fakeSpawner();
  assert.equal((await runSubscriptionTurn(selection, 'tiny', c, { ...fake, env, log: () => {} })).status, 'completed');
  for (const [cat, e] of [[null, env], [c, {}], [c, { ...env, VERCEL: '1' }], [{ ...c, revision: 'new' }, env]]) {
    const spy = fakeSpawner();
    assert.equal((await runSubscriptionTurn(selection, 'tiny', cat, { ...spy, env: e })).status, 'blocked');
    assert.equal(spy.calls.length, 0);
  }
});
test('bound Anthropic API turn logs the selected model, never the OpenAI cost-ladder candidate', async () => {
  const { runJorisCommand } = await jiti.import('./brain.ts');
  const { resolveChatModelBinding, chatModelOptions, projectChatExecution } = await jiti.import('./chat-model-binding.ts');
  const { getActiveWorkspaceContext } = await jiti.import(path.join(root, 'src/core/workspace-context.ts'));
  const ctx = getActiveWorkspaceContext(), now = Date.now(), observedAt = new Date(now).toISOString();
  const accountId = '6f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d';
  const c = { source: 'test', revision: 'test', observedAt, entries: [{ accountId, modelId: 'claude-sonnet-4-6', provider: 'anthropic', state: 'authorized', source: 'test', observedAt, tools: false, billingKind: 'api', workspaceId: ctx.workspace.id, tariff: { currency: 'USD', notToExceedCents: 10, source: 'test', observedAt } }] };
  const option = chatModelOptions(c, ctx.workspace.id, now, true)[0];
  assert.equal(option.consumptionMode, 'pay_per_use_api');
  const binding = resolveChatModelBinding(c, ctx.workspace.id, option, now, true);
  assert.equal(binding.status, 'ready');
  clearBrainRouteLog();
  let calls = 0;
  await runJorisCommand('Bonjour, explique simplement ce que tu peux faire.', ctx, {
    readVerifiedVault: () => ({ entries: [] }),
    enrichMemexContext: async () => ({ memoryContext: null, evidencePack: null, trace: { status: 'disabled', evidencePackValid: false }, evidenceSummary: { status: 'disabled', sourceCount: 0, confidence: 'unknown', freshness: { oldestIso: null, newestIso: null, ageDays: null }, limitations: [], fallbackReasons: [] } }),
    generateReply: async input => { calls++; assert.equal(input.chosenModelId, 'claude-sonnet-4-6'); return { ok: true, text: 'OK', modelId: input.chosenModelId }; },
  }, binding);
  assert.equal(calls, 1);
  assert.equal(getBrainRouteLog().length, 1);
  const record = getBrainRouteLog()[0];
  assert.equal(record.provider, 'anthropic');
  assert.equal(record.model, 'claude-sonnet-4-6');
  assert.equal(record.runtimeId, 'anthropic-http-json');
  assert.equal(record.consumptionMode, 'pay_per_use_api');
  assert.equal(projectChatExecution({ reservation: { status: 'consumed' } }).consumptionMode, 'pay_per_use_api');
});
