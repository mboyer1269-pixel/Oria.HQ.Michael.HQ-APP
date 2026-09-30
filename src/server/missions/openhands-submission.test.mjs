import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createJiti} from 'jiti';
const jiti=createJiti(import.meta.url,{alias:{'@':path.join(process.cwd(),'src'),'server-only':path.join(process.cwd(),'src/scripts/smoke/server-only-stub.mjs')}});
const {createDevelopmentService}=await jiti.import('./development-mission.ts');
const {buildOpenHandsSubmission,prepareOpenHandsSubmission}=await jiti.import('./openhands-submission.ts');
const {prepareOpenHandsMemoryContext}=await jiti.import('./openhands-memory-context.ts');
let mission;
const service=createDevelopmentService({enabled:()=>true,store:()=>({save:async(value)=>{mission=value;return value;},load:async()=>mission})});
await service.create({requestId:'4fd96fc8-8194-4d49-852a-8a7420ad2f53',title:'Synthetic bounded improvement',objective:'Improve one measured operation',scope:'One UI component',acceptanceCriteria:'Existing regression suite passes'},{workspaceId:'synthetic-a',modeId:'hq',actorId:'real-session-subject'});
const request={missionId:mission.id,expectedUpdatedAt:mission.updatedAt,commitSha:'a'.repeat(40),executorVersion:'1.2.3',budget:{maxCostCents:100,maxTokens:10000,maxIterations:10,timeoutSeconds:120}};

test('persisted project memory is included in the exact approved payload; browser injection and tampering rejected',async()=>{
 const entity={id:'anchor',namespace:'org:project-a',type:'Project',name:'Décision 🧪',source:'reviewed',properties:{status:'verified'}};
 const result=await prepareOpenHandsMemoryContext({workspaceId:'synthetic-a',projectId:'project-a',
  resolveProjectBinding:async()=>({workspaceId:'synthetic-a',projectId:'project-a',namespace:entity.namespace,namespaceScope:'project',centerEntityId:entity.id}),
  transport:{listTools:async()=>['agentmemory_context_pack'],close:async()=>{},callTool:async()=>JSON.stringify({graphContext:{namespace:entity.namespace,tenant:entity.namespace,centerEntity:entity,entities:[entity],relations:[]},provenance:[{id:entity.id,source:entity.source}]})},now:()=>new Date('2026-09-30T12:00:00.000Z')});
 assert.equal(result.status,'ready');
 const withMemory={...mission,input:{...mission.input,_openhandsMemory:result.snapshot}};
 const prepared=buildOpenHandsSubmission(withMemory,'synthetic-a',request);
 assert.equal(prepared.status,'prepared');assert.equal(prepared.dossier.contractVersion,2);
 assert.deepEqual(prepared.dossier.memory,result.snapshot);assert.ok(Object.isFrozen(prepared.dossier.memory));
 assert.notEqual(prepared.dossier.payloadHash,buildOpenHandsSubmission(mission,'synthetic-a',request).dossier.payloadHash);
 assert.deepEqual(buildOpenHandsSubmission(structuredClone(withMemory),'synthetic-a',request).dossier,prepared.dossier);
 assert.equal(buildOpenHandsSubmission(mission,'synthetic-a',{...request,memory:result.snapshot}).status,'invalid_request');
 for(const patch of [{content:'tampered'},{workspaceId:'foreign'},{snapshotHash:'0'.repeat(64)}]) {
  const corrupt={...withMemory,input:{...withMemory.input,_openhandsMemory:{...result.snapshot,...patch}}};
  assert.equal(buildOpenHandsSubmission(corrupt,'synthetic-a',request).status,'ineligible_mission');
 }
});
test('durable development mission becomes immutable preparation, no execution approval invented',()=>{
 const result=buildOpenHandsSubmission(mission,'synthetic-a',request);assert.equal(result.status,'prepared');const d=result.dossier;
 assert.equal(d.executionRequested,false);assert.equal(d.approvalRequired,true);assert.equal(d.source.commitVerification,'not_verified');
 assert.equal(d.mission.scope,mission.input.development.scope);assert.equal(d.mission.acceptanceCriteria,mission.input.development.acceptanceCriteria);
 assert.throws(()=>{d.budget.maxTokens=999;},TypeError);assert.throws(()=>{d.mission.scope='changed';},TypeError);assert.throws(()=>{d.payloadHash='changed';},TypeError);
 assert.deepEqual(d,buildOpenHandsSubmission(structuredClone(mission),'synthetic-a',structuredClone(request)).dossier);
});
test('idempotency is stable for mission version; changed contract requires hash conflict, new version new key',()=>{
 const a=buildOpenHandsSubmission(mission,'synthetic-a',request).dossier;
 const b=buildOpenHandsSubmission(mission,'synthetic-a',{...request,commitSha:'b'.repeat(40)}).dossier;
 assert.equal(a.idempotencyKey,b.idempotencyKey);assert.notEqual(a.payloadHash,b.payloadHash);
 const updatedAt='2026-10-01T00:00:00.000Z';const c=buildOpenHandsSubmission({...mission,updatedAt},'synthetic-a',{...request,expectedUpdatedAt:updatedAt}).dossier;
 assert.notEqual(a.idempotencyKey,c.idempotencyKey);
});
test('foreign workspace, stale version, tampered content, dispatched/unknown extensions and non-drafts rejected',()=>{
 assert.equal(buildOpenHandsSubmission(mission,'foreign',request).status,'not_found');
 assert.equal(buildOpenHandsSubmission(mission,'synthetic-a',{...request,expectedUpdatedAt:'2020-01-01T00:00:00Z'}).status,'stale_version');
 for(const change of [{title:'tampered'},{status:'running'},{status:'completed'},{assignedAgentId:'agent'},{requiresApproval:false},{costBudgetCents:50},{input:{...mission.input,_paperclipDispatch:{state:'linked'}}},{input:{...mission.input,unrecognized:'instruction'}}])assert.equal(buildOpenHandsSubmission({...mission,...change},'synthetic-a',request).status,'ineligible_mission');
});
test('requires explicit full commit/version, finite bounded budgets and strict request',()=>{
 for(const change of [{commitSha:'0'.repeat(40)},{commitSha:'main'},{commitSha:'abc123'},{executorVersion:'latest'},{budget:{...request.budget,maxTokens:200001}},{budget:{...request.budget,maxCostCents:Infinity}},{budget:{...request.budget,timeoutSeconds:0}},{budget:{...request.budget,maxIterations:101}},{reviewerId:'browser'}])assert.equal(buildOpenHandsSubmission(mission,'synthetic-a',{...request,...change}).status,'invalid_request');
});
test('service loads only workspace-bound persisted record; no fallback or network',async()=>{
 const calls=[];const factory=()=>({load:async(...args)=>{calls.push(args);return mission;}});
 assert.equal((await prepareOpenHandsSubmission('synthetic-a',request,factory)).status,'prepared');assert.deepEqual(calls,[['synthetic-a',mission.id]]);
 assert.equal((await prepareOpenHandsSubmission('synthetic-a',request,()=>null)).status,'unavailable');
 assert.equal((await prepareOpenHandsSubmission('synthetic-a',request,()=>({load:async()=>null}))).status,'not_found');
 assert.equal((await prepareOpenHandsSubmission('synthetic-a',request,()=>({load:async()=>{throw Error('private upstream detail');}}))).status,'unavailable');
 assert.equal((await prepareOpenHandsSubmission('foreign',request,factory)).status,'not_found');
 const before=calls.length;assert.equal((await prepareOpenHandsSubmission('synthetic-a',{},factory)).status,'invalid_request');assert.equal(calls.length,before);
});
