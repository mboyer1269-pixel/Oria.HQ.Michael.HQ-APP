// No sockets, SQL, containers or provider calls. Shell commands are fixture doubles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
const root = path.resolve(import.meta.dirname, '..');
const shell = readFileSync(path.join(root, 'proofs/run-approval-real-db.sh'), 'utf8');
test('actual CI readiness loop notifies first, rejects RPC-only schema and accepts table plus both RPCs', () => {
  const start = shell.indexOf('  # PostgREST started'), end = shell.indexOf('  HQ_ROOT=', start);
  assert.ok(start >= 0 && end > start);
  const scratch = mkdtempSync(path.join(tmpdir(), 'oria-cache-proof-'));
  try {
    const script = `set -eu\nTRACE=${JSON.stringify(path.join(scratch, 'trace'))}\nCOUNT=${JSON.stringify(path.join(scratch, 'count'))}\nPOSTGREST_DIRECT_URL=http://127.0.0.1:3000\nPSQL=psql\n` +
      `psql(){ cat >/dev/null; echo notify >>"$TRACE"; }\nsleep(){ :; }\ncurl(){ n=0; [ ! -f "$COUNT" ] || n=$(cat "$COUNT"); n=$((n+1)); echo "$n" >"$COUNT"; echo "curl$n" >>"$TRACE"; if [ "$n" -eq 1 ]; then printf '%s' '{"paths":{"/rpc/admit_execution_intent_v1":{},"/rpc/check_execution_intent_admission_v1":{}}}'; else printf '%s' '{"paths":{"/agent_execution_intents":{},"/rpc/admit_execution_intent_v1":{},"/rpc/check_execution_intent_admission_v1":{}}}'; fi; }\n` + shell.slice(start, end);
    const file = path.join(scratch, 'test.sh'); writeFileSync(file, script);
    const r = spawnSync('sh', [file], { encoding: 'utf8', timeout: 3000 }); assert.equal(r.status, 0, r.stderr);
    const events = readFileSync(path.join(scratch, 'trace'), 'utf8').trim().split('\n');
    assert.equal(events[0], 'notify'); assert.equal(events.filter(x => x.startsWith('curl')).length, 2);
    assert.match(r.stdout, /table=true admit=true check=true/);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});
test('gateway diagnostic exposes only bounded fixture path/status and classified error, never row/header/query data', () => {
  const s = readFileSync(path.join(root, 'proofs/prove-approval-real-db.mjs'), 'utf8');
  const fn = /function transportDiagnostic\([\s\S]*?\n}\n/.exec(s)?.[0]; assert.ok(fn);
  const diagnostic = vm.runInNewContext(`(${fn})`);
  const out = diagnostic('POST', '/rest/v1/agent_execution_intents?secret=do-not-log', 404,
    { code: 'PGRST205', message: 'sensitive raw message', details: 'row-secret', hint: 'secret', authorization: 'credential' });
  assert.equal(out.path, '/rest/v1/agent_execution_intents'); assert.equal(out.code, 'PGRST205');
  assert.match(out.message, /schema cache/); assert.doesNotMatch(JSON.stringify(out), /do-not-log|sensitive|row-secret|credential/);
  assert.equal(diagnostic('POST', '/rest/v1/agent_execution_intents', 502, { message: 'raw secret', code: 'arbitrary secret' }).message, 'Unclassified transport or database error');
  assert.ok(s.includes('gatewayDiagnostics++ < 60')); assert.ok(s.indexOf('transportDiagnostic(req.method') < s.indexOf('res.writeHead(upstream.status'));
});
