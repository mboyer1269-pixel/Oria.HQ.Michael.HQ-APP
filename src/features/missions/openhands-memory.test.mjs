import test from 'node:test';import assert from 'node:assert/strict';import {createJiti} from 'jiti';
const jiti=createJiti(import.meta.url);
const {loadOpenHandsMemoryProjects,attachOpenHandsMemory}=await jiti.import('./openhands-memory.ts');
const request={missionId:'714ac9b7-6bce-4eb4-b3bd-08d3df8ad46e',expectedUpdatedAt:'2026-09-30T00:00:00Z'};
test('project list accepts only safe display fields; server internals never enter selection',async()=>{
 assert.deepEqual(await loadOpenHandsMemoryProjects(async()=>Response.json({status:'ready',projects:[{projectId:'p',label:'Project'}]})),[{projectId:'p',label:'Project'}]);
 await assert.rejects(loadOpenHandsMemoryProjects(async()=>Response.json({status:'ready',projects:[{projectId:'p',label:'Project',readHandleFile:'private'}]})));
 await assert.rejects(loadOpenHandsMemoryProjects(async()=>new Response('x'.repeat(17000),{headers:{'content-type':'application/json'}})));
});
test('attachment sends selected id once, accepts only bound receipt, and never retries an ambiguous result',async()=>{
 let calls=0;
 const receipt={status:'attached',externalEffectAllowed:false,missionId:request.missionId,updatedAt:'2026-09-30T00:00:01Z',snapshotHash:'a'.repeat(64)};
 assert.equal(await attachOpenHandsMemory(request,'p',async(_url,init)=>{calls++;assert.deepEqual(JSON.parse(init.body),{action:'attach_memory',...request,projectId:'p'});return Response.json(receipt);}),true);
 assert.equal(calls,1);
 for(const patch of [{missionId:'foreign'},{updatedAt:request.expectedUpdatedAt},{externalEffectAllowed:true},{snapshotHash:'bad'},{status:'attachment_outcome_unknown'}]) {
  assert.equal(await attachOpenHandsMemory(request,'p',async()=>Response.json({...receipt,...patch})),false);
 }
 await assert.rejects(attachOpenHandsMemory(request,'p',async()=>{throw Error('lost');}));
});
