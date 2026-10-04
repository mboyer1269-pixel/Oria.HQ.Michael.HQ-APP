import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';
import { createClient } from '@supabase/supabase-js';
const jiti=createJiti(import.meta.url,{alias:{'@':path.join(process.cwd(),'src'),'server-only':path.join(process.cwd(),'src/scripts/smoke/server-only-stub.mjs')}});
const {createDevelopmentService}=await jiti.import('./development-mission.ts');
const {createOpenHandsMemoryAttachmentService,createOpenHandsMemoryAttachmentStore}=await jiti.import('./openhands-memory-attachment.ts');
let original;
await createDevelopmentService({enabled:()=>true,store:()=>({save:async m=>(original=m),load:async()=>original})}).create({requestId:'714ac9b7-6bce-4eb4-b3bd-08d3df8ad46e',title:'Synthetic',objective:'Memory attachment',scope:'One file',acceptanceCriteria:'Tests pass'},{workspaceId:'workspace-a',modeId:'hq',actorId:'owner'});
const context={workspaceId:'workspace-a',actorId:'owner'};
const request={missionId:original.id,expectedUpdatedAt:original.updatedAt,projectId:'project-a',commitSha:'a'.repeat(40),executorVersion:'1.50.0',budget:{maxCostCents:100,maxTokens:10000,maxIterations:2,timeoutSeconds:60}};
const binding={workspaceId:context.workspaceId,projectId:'project-a',namespace:'org:project-a',namespaceScope:'project',centerEntityId:'anchor'};
function fixture() {
 let mission=structuredClone(original), snapshot=null, reads=0, writes=0, closed=0, unknown=false, bound=true;
 const entity={id:'anchor',namespace:binding.namespace,type:'Project',source:'reviewed',properties:{status:'verified'}};
 const deps={store:{load:async()=>structuredClone(mission),attach:async(prior,memory)=>{
  if(prior.updatedAt!==mission.updatedAt||JSON.stringify(prior.input)!==JSON.stringify(mission.input))return null;
  writes++;mission={...mission,updatedAt:new Date(Date.parse(prior.updatedAt)+1).toISOString(),input:{...mission.input,_openhandsMemory:memory}};
  if(unknown)throw Error('lost response');return structuredClone(mission);
 }},snapshots:{load:async()=>snapshot,persist:async(_scope,value)=>{snapshot??=value;return snapshot;}},
 resolveProjectBinding:async()=>bound?binding:null,
 createTransport:async()=>({listTools:async()=>['agentmemory_context_pack'],close:async()=>{closed++;},callTool:async()=>{
  reads++;return JSON.stringify({graphContext:{namespace:binding.namespace,tenant:binding.namespace,centerEntity:entity,entities:[entity],relations:[]},provenance:[{id:'anchor',source:'reviewed'}]});
 }})};
 return {deps,service:createOpenHandsMemoryAttachmentService(deps),state:()=>({mission,snapshot,reads,writes,closed}),
  mutate:patch=>{mission={...mission,...patch};},unbound:()=>{bound=false;},loseResponse:()=>{unknown=true;}};
}
test('attachment increments mission version, persists snapshot, closes transport, and never refreshes attached context',async()=>{
 const f=fixture();const r=await f.service(context,request);assert.equal(r.status,'attached');
 assert.notEqual(r.updatedAt,request.expectedUpdatedAt);assert.equal(f.state().reads,1);assert.equal(f.state().closed,1);
 assert.equal((await f.service(context,request)).status,'stale_version');
 assert.equal((await f.service(context,{...request,expectedUpdatedAt:r.updatedAt})).status,'already_attached');
 assert.equal(f.state().reads,1);assert.equal(f.state().writes,1);
});
test('unbound project, foreign workspace, browser namespace and reserved mission do not read Memex',async()=>{
 const f=fixture();f.unbound();assert.equal((await f.service(context,request)).status,'project_unbound');
 assert.equal((await f.service({...context,workspaceId:'foreign'},request)).status,'not_found');
 assert.equal((await f.service(context,{...request,namespace:'org:foreign'})).status,'invalid_request');
 f.mutate({input:{...original.input,_openhandsReservation:{}}});
 assert.equal((await f.service(context,request)).status,'ineligible_mission');assert.equal(f.state().reads,0);
});
test('concurrent attachments have one CAS winner and same durable snapshot',async()=>{
 const f=fixture();const results=await Promise.all([f.service(context,request),f.service(context,request)]);
 assert.equal(results.filter(r=>r.status==='attached').length,1);assert.equal(f.state().writes,1);
 assert.equal(f.state().mission.input._openhandsMemory.snapshotHash,f.state().snapshot.snapshotHash);
});
test('ambiguous attachment is not repeated; current mission can reconcile it without another read',async()=>{
 const f=fixture();f.loseResponse();assert.equal((await f.service(context,request)).status,'attachment_outcome_unknown');
 assert.equal((await f.service(context,request)).status,'stale_version');
 assert.equal((await f.service(context,{...request,expectedUpdatedAt:f.state().mission.updatedAt})).status,'already_attached');
 assert.equal(f.state().writes,1);assert.equal(f.state().reads,1);
});
test('mission change during capture loses CAS; retry reuses canonical snapshot without another Memex call',async()=>{
 const f=fixture();const attach=f.deps.store.attach;
 f.deps.store.attach=async()=>null;
 assert.equal((await f.service(context,request)).status,'conflict');assert.equal(f.state().reads,1);
 f.deps.store.attach=attach;
 assert.equal((await f.service(context,request)).status,'attached');assert.equal(f.state().reads,1);
});
test('Supabase attachment CAS pins full input, version, workspace and draft status',async()=>{
 const f=fixture();await f.service(context,request);const snapshot=f.state().snapshot;
 let calls=0;
 const client=createClient('https://synthetic.invalid','synthetic',{auth:{persistSession:false},global:{fetch:async(url,init)=>{
  calls++;const u=new URL(url),body=JSON.parse(init.body);
  assert.equal(init.method,'PATCH');assert.equal(u.searchParams.get('workspace_id'),'eq.'+original.workspaceId);
  assert.equal(u.searchParams.get('id'),'eq.'+original.id);assert.equal(u.searchParams.get('status'),'eq.draft');
  assert.equal(u.searchParams.get('updated_at'),'eq.'+original.updatedAt);
  assert.equal(u.searchParams.get('input'),'eq.'+JSON.stringify(original.input));
  assert.deepEqual(body.input._openhandsMemory,snapshot);assert.ok(Date.parse(body.updated_at)>Date.parse(original.updatedAt));
  return new Response('null',{headers:{'content-type':'application/json'}});
 }}});
 assert.equal(await createOpenHandsMemoryAttachmentStore(client).attach(original,snapshot),null);assert.equal(calls,1);
});
