import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { createJiti } from 'jiti';
const jiti=createJiti(import.meta.url,{alias:{'@':path.resolve('src')}});
const {readAgentNames,writeAgentName,mergeAgentNames}=await jiti.import('./service.ts');
const {normalizeAgentDisplayName}=await jiti.import('@/features/agents/display-name.ts');
const {agentRegistry}=await jiti.import('@/features/agents/seed.ts');
const {getDefaultWorkspace,getDefaultAssistantProfile}=await jiti.import('@/core/workspaces/registry.ts');
const scope={ownerId:'owner-a',workspaceId:'workspace-a'};
// Synthetic adapter only. This map is never a production persistence fallback.
function fixture(){const rows=new Map();let writes=0;return {get writes(){return writes},async read(s){return [...rows.values()].filter(r=>r.user_id===s.ownerId&&r.workspace_id===s.workspaceId)},async write(s,id,name){writes++;const key=JSON.stringify([s.ownerId,s.workspaceId,id]);if(name===null)rows.delete(key);else rows.set(key,{user_id:s.ownerId,workspace_id:s.workspaceId,agent_id:id,display_name:name});}};}
test('trim, nonempty, unicode bound, control characters',()=>{
 assert.equal(normalizeAgentDisplayName(' Bob '),'Bob');for(const n of ['', '   ',42,'a'.repeat(81),'x\n'])assert.equal(normalizeAgentDisplayName(n),n==='x\n'?'x':null);
 assert.equal(normalizeAgentDisplayName('a\nb'),null);assert.ok(normalizeAgentDisplayName('😀'.repeat(80)));assert.equal(normalizeAgentDisplayName('😀'.repeat(81)),null);
});
test('synthetic write/read/reset only changes display name, never identity/runtime/tools',async()=>{
 const db=fixture(),ws=getDefaultWorkspace({ownerUserId:scope.ownerId}),before=structuredClone(agentRegistry),profile=getDefaultAssistantProfile(ws);
 assert.equal((await writeAgentName(scope,agentRegistry,{agentId:profile.id,displayName:' Bob '},db)).status,'saved');
 const read=await readAgentNames(scope,agentRegistry,db);const merged=mergeAgentNames(ws,agentRegistry,read.overrides);
 assert.equal(merged.assistant.name,'Bob');assert.deepEqual({...merged.assistant,name:profile.name},profile);
 assert.deepEqual(merged.agents.map(a=>({...a,name:before.find(b=>b.id===a.id).name})),before);assert.deepEqual(agentRegistry,before);
 assert.equal((await writeAgentName(scope,agentRegistry,{agentId:profile.id,displayName:null},db)).status,'saved');
 assert.deepEqual(mergeAgentNames(ws,agentRegistry,(await readAgentNames(scope,agentRegistry,db)).overrides).assistant,profile);
});
test('unknown IDs and unexpected privileged fields rejected before write',async()=>{
 const db=fixture();for(const input of [{agentId:'unknown',displayName:'Bob'},{agentId:'joris',displayName:'Bob',runtimeId:'other'},{agentId:'joris',displayName:'Bob',ownerId:'other'},{agentId:'joris',displayName:'Bob',workspaceId:'other'},{agentId:'joris',displayName:' '},null])assert.equal((await writeAgentName(scope,agentRegistry,input,db)).status,'invalid');assert.equal(db.writes,0);
});
test('owner and workspace isolation in synthetic adapter; foreign rows fail closed',async()=>{
 const db=fixture();await writeAgentName(scope,agentRegistry,{agentId:'joris',displayName:'Bob'},db);
 for(const s of [{...scope,ownerId:'owner-b'},{...scope,workspaceId:'workspace-b'}])assert.equal(Object.keys((await readAgentNames(s,agentRegistry,db)).overrides).length,0);
 assert.equal((await readAgentNames(scope,agentRegistry,{read:async()=>[{user_id:'foreign',workspace_id:scope.workspaceId,agent_id:'joris',display_name:'Injected'}]})).status,'unavailable');
});
test('unprovisioned or failed storage never reports saved or observed persistence',async()=>{
 const input={agentId:'joris',displayName:'Bob'};assert.equal((await writeAgentName(scope,agentRegistry,input,null)).status,'unavailable');assert.equal((await readAgentNames(scope,agentRegistry,null)).status,'unavailable');
 assert.equal((await writeAgentName(scope,agentRegistry,input,{write:async()=>{throw Error('db missing')}})).status,'unavailable');
});

test('naming aliases use request overrides without inherited names or global mutation',async()=>{
 const {getAgentDisplayName,getCouncilRoleDisplayName}=await jiti.import('@/features/agents/naming.ts');
 assert.equal(getAgentDisplayName('joris',{joris:'Bob'}),'Bob');
 assert.equal(getCouncilRoleDisplayName('joris_orchestrator',{joris:'Bob'}),'Bob');
 assert.equal(getAgentDisplayName('__proto__'),'__proto__');assert.equal(getAgentDisplayName('constructor'),'constructor');
 assert.equal(getAgentDisplayName('joris'),agentRegistry.find(a=>a.id==='joris').name);
});

test('lost acknowledgement never claims that the name was not written', async () => {
 const j=createJiti(import.meta.url,{alias:{'@':path.resolve('src')}});
 const service=await j.import('./service.ts');
 let written=false;
 const result=await service.writeAgentName({ownerId:'owner',workspaceId:'workspace'},[{id:'joris'}],{agentId:'joris',displayName:'Bob'},{read:async()=>[],write:async()=>{written=true;throw Error('response lost')}});
 assert.equal(written,true);assert.equal(result.status,'unavailable');assert.match(result.message,/Aucune sauvegarde confirmée/);assert.doesNotMatch(result.message,/Aucun nom n’a été sauvegardé/);
});
