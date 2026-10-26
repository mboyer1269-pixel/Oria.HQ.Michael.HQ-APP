import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createJiti} from 'jiti';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'oria-name-actions-'));
fs.writeFileSync(path.join(dir,'owner.ts'),'export async function requireOwnerAccess(){globalThis.__nameAuthCalls++;if(globalThis.__nameAuthThrows)throw Error("auth required");return globalThis.__nameAccess;}');
fs.writeFileSync(path.join(dir,'store.ts'),'export async function createAgentNameStore(){globalThis.__nameStoreCalls++;throw Error("must remain closed");}');
const jiti=createJiti(import.meta.url,{alias:{'@':path.resolve('src'),'@/server/auth/owner':path.join(dir,'owner.ts'),'@/server/agents/display-names/supabase-store':path.join(dir,'store.ts')}});
const {getAgentDisplayNames,saveAgentDisplayName}=await jiti.import('./display-names.ts');
function reset(access){globalThis.__nameAuthCalls=0;globalThis.__nameStoreCalls=0;globalThis.__nameAuthThrows=false;globalThis.__nameAccess=access;}
test('forbidden owner cannot read or write and no adapter is constructed',async()=>{
 reset({status:'forbidden',user:{id:'untrusted'}});assert.equal(await getAgentDisplayNames(),null);assert.equal((await saveAgentDisplayName({agentId:'joris',displayName:'Bob'})).status,'forbidden');assert.equal(globalThis.__nameAuthCalls,2);assert.equal(globalThis.__nameStoreCalls,0);
});
test('authentication failure stops action before storage',async()=>{
 reset(null);globalThis.__nameAuthThrows=true;await assert.rejects(saveAgentDisplayName({agentId:'joris',displayName:'Bob'}));assert.equal(globalThis.__nameStoreCalls,0);
});
test('closed production flag returns defaults and unavailable, never saved',async()=>{
 reset({status:'authorized',user:{id:'synthetic-owner'}});const result=await getAgentDisplayNames();assert.equal(result.status,'unavailable');assert.equal(result.assistant.name,result.agents.find(a=>a.id===result.assistant.id).name);assert.equal((await saveAgentDisplayName({agentId:'joris',displayName:'Bob'})).status,'unavailable');assert.equal(globalThis.__nameStoreCalls,0);
 assert.equal((await saveAgentDisplayName({agentId:'joris',displayName:'Bob',workspaceId:'foreign'})).status,'invalid');
});
