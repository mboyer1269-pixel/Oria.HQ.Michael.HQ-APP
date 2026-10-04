import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createJiti} from 'jiti';
const jiti=createJiti(import.meta.url,{alias:{'@':path.join(process.cwd(),'src'),'server-only':path.join(process.cwd(),'src/scripts/smoke/server-only-stub.mjs')}});
const {createOpenHandsControlClient}=await jiti.import('./openhands-control-client.ts');
test('real local stream lists requests and refuses malformed/truncated/oversized responses',async()=>{
 const endpoint=process.platform==='win32'?`\\\\.\\pipe\\hq-control-${randomUUID()}`:path.join(os.tmpdir(),`hq-${randomUUID()}.sock`);
 const requestId=randomUUID();let answer=JSON.stringify({status:'ok',requestIds:[requestId]})+'\n';let seen;
 const server=net.createServer(socket=>socket.once('data',data=>{seen=JSON.parse(data);socket.end(answer);}));
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(endpoint,resolve);});
 try{
  const client=createOpenHandsControlClient(endpoint);const owner={actorId:'owner',workspaceId:'w'};
  assert.deepEqual(await client.list(owner),[requestId]);assert.deepEqual(seen,{operation:'list',...owner});
  for(const value of ['{}\n','truncated','x'.repeat(33000)+'\n']){
   answer=value;await assert.rejects(client.list(owner));
  }
 }finally{await new Promise(resolve=>server.close(resolve));}
});
