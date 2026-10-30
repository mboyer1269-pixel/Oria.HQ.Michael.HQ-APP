// Deterministic no-model helper. Reads only synthetic paths supplied by this proof.
import { writeFileSync, readFileSync, renameSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import path from 'node:path';
const [mode, port, outside] = process.argv.slice(2);
const spec = path.join(process.cwd(), 'SPEC.md');
if (mode === 'hang') {
  const child = spawn(process.execPath, ['-e', `setTimeout(()=>require('node:fs').appendFileSync(${JSON.stringify(spec)},'LATE_CHILD_WRITE'),1800);console.log('HANG_CHILD_STARTED');setInterval(()=>{},1000)`], { stdio: ['ignore', 'pipe', 'ignore'] });
  child.stdout.pipe(process.stdout); // descendant announces that its write timer is armed
  setInterval(() => {}, 1000);
} else {
  const denied = action => { try { action(); return false; } catch { return true; } };
  writeFileSync(spec, '# Deterministic sandbox qualification\n');
  const result = {
    specWritten: readFileSync(spec, 'utf8') === '# Deterministic sandbox qualification\n',
    otherWriteDenied: denied(() => writeFileSync('other.txt', 'forbidden')),
    renameDenied: denied(() => renameSync(spec, 'renamed.md')),
    outsideReadDenied: denied(() => readFileSync(outside)),
    hostNetworkDenied: await new Promise(resolve => {
      const socket = connect({ host: '127.0.0.1', port: Number(port) });
      const finish = value => { socket.destroy(); resolve(value); };
      socket.once('connect', () => finish(false));
      socket.once('error', () => finish(true));
      socket.setTimeout(1500, () => finish(false)); // silence is inconclusive, not denial
    }),
  };
  console.log(JSON.stringify(result));
  if (!Object.values(result).every(value => value === true)) process.exitCode = 1;
}
