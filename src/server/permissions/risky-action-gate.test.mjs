import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(root, 'src'), 'server-only': path.join(root, 'src/__server-only-noop.js') } });
const G = await jiti.import('./risky-action-gate.ts');
const ON = { ORIA_RISKY_ACTIONS_ENABLED: '1' };

test('kill-switch OFF by default → 403 even with confirm:true', () => {
  for (const env of [{}, { ORIA_RISKY_ACTIONS_ENABLED: '' }, { ORIA_RISKY_ACTIONS_ENABLED: 'true' }, { ORIA_RISKY_ACTIONS_ENABLED: '0' }, { ORIA_RISKY_ACTIONS_ENABLED: 'yes' }]) {
    const r = G.riskyActionDecision('send', { confirm: true }, env);
    assert.equal(r.status, 403); assert.equal(r.code, 'risky_actions_disabled');
  }
});
test('switch ON without strict confirm:true → 409', () => {
  for (const body of [null, undefined, {}, { confirm: 'true' }, { confirm: 1 }, { confirm: false }, [true], 'confirm']) {
    const r = G.riskyActionDecision('spend', body, ON);
    assert.equal(r.status, 409); assert.equal(r.code, 'confirm_required'); assert.equal(r.kind, 'spend');
  }
});
test('switch ON + confirm:true → proceed', () => {
  assert.equal(G.riskyActionDecision('send', { confirm: true, actionId: 'a' }, ON), null);
  assert.equal(G.riskyActionGate('spend', { confirm: true }, { ORIA_RISKY_ACTIONS_ENABLED: ' 1 ' }), null);
});
test('riskyActionGate returns a JSON response with status and code', async () => {
  const off = G.riskyActionGate('send', { confirm: true }, {});
  assert.equal(off.status, 403); assert.equal((await off.json()).code, 'risky_actions_disabled');
  const noConfirm = G.riskyActionGate('send', {}, ON);
  assert.equal(noConfirm.status, 409); assert.equal((await noConfirm.json()).code, 'confirm_required');
});
