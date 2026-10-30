/** TEST ONLY: a real local Node child, NOT Codex, a subscription, or OS sandbox proof.
 * The engine's bwrap recipe is asserted, then replaced by this deterministic child.
 * Never import this fixture from application code.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const fixtureScript = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
let networkAttempts = 0;
const deny = () => { networkAttempts++; throw new Error('fixture_network_forbidden'); };
globalThis.fetch = deny;
for (const name of ['node:http', 'node:https']) { const mod = require(name); mod.request = deny; mod.get = deny; }
const net = require('node:net'); net.connect = deny; net.createConnection = deny; net.Socket.prototype.connect = deny;
const tls = require('node:tls'); tls.connect = deny;
process.on('exit', () => { if (networkAttempts) process.exitCode = 98; });
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { prompt += c; if (prompt.length > 16000) process.exit(97); });
process.stdin.on('end', () => {
  const config = JSON.parse(process.env.ORIA_TEST_BOUND_SPEC_FIXTURE);
  if (crypto.createHash('sha256').update(prompt).digest('hex') !== config.instructionHash) process.exit(96);
  const sessions = path.join(process.env.HOME, '.codex', 'sessions');
  fs.mkdirSync(sessions, {recursive:true});
  fs.writeFileSync(path.join(sessions, 'fake-node-session.jsonl'), [
    {type:'session_meta',payload:{id:'fake-node-session'}},
    {type:'turn_context',payload:{model:config.model}},
  ].map(record => JSON.stringify(record)).join('\n'));
  fs.writeFileSync('SPEC.md', config.specText);
  process.stdout.write(JSON.stringify({type:'thread.started',thread_id:'fake-node-session'})+'\n');
  process.stdout.write(JSON.stringify({type:'turn.completed'})+'\n');
});
`;
export function createFakeBoundSpecProvider({ instructionHash, model, specText = '# Offline Node fixture\n' }) {
  const calls = [];
  return { calls, provider: {
    assertSubscription() { /* Simulated preflight, never reads an account. */ },
    sandboxAvailable() { return true; /* DI only, not host qualification. */ },
    spawn(binary, args, options) {
      assert.equal(binary, 'bwrap'); assert.ok(args.includes('--unshare-net'));
      calls.push({ binary, args: [...args] });
      const child = spawn(process.execPath, ['-e', fixtureScript], { ...options,
        env: { NODE_ENV: 'test', HOME: options.env.HOME, ORIA_TEST_BOUND_SPEC_FIXTURE: JSON.stringify({ instructionHash, model, specText }) } });
      calls.at(-1).pid = child.pid;
      return child;
    },
  } };
}
