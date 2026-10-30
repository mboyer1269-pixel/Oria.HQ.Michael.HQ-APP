import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createJiti} from 'jiti';
const jiti=createJiti(import.meta.url,{alias:{'@':path.resolve('src'),'server-only':path.resolve('src/scripts/smoke/server-only-stub.mjs')}});
let fetches=0;globalThis.fetch=()=>{fetches++;throw Error('unexpected network');};
let mod;try{mod=await jiti.import('./approval-decision-producer.ts');}catch{mod={};}
const actor='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
const {hashExecutionIntentPayload}=await jiti.import('./execution-intent-payload-hash.ts');
const {stableStringify}=await jiti.import('../ledger/hash-chain-canonicalizer.ts');
const payload={agentId:'hermes',skillId:'content.generate',client:'Synthetic',email:'synthetic@example.test',actionType:'draft',missionId:'mission-fixture',data:{text:'<test> 安全'}};
const intent={intentId:'fixture-intent',workspaceId:'fixture-ws',agentId:payload.agentId,skillId:payload.skillId,toolName:'n8n_webhook_trigger',autonomyLevel:3,status:'pending',payload,requiresCeoApproval:true,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'};
const snapshot={agentId:intent.agentId,skillId:intent.skillId,toolName:intent.toolName,autonomyLevel:3,payload};
const intentHash=hashExecutionIntentPayload({workspaceId:intent.workspaceId,actorId:actor,intentId:intent.intentId,snapshot});
const hash=hashExecutionIntentPayload(payload),now=Date.parse('2026-10-30T04:00:00Z');
const req={command:'confirm',intentId:intent.intentId,requestId:id,expectedPayloadHash:hash,expectedIntentHash:intentHash,confirmed:true,rationale:'Owner approves this exact synthetic fixture.',expiresAt:new Date(now+300000).toISOString()};
const recover={command:'recover',intentId:req.intentId,requestId:id,expectedPayloadHash:hash};
function observation(state='approved'){return {state,decisionId:id,requestId:id,workspaceId:intent.workspaceId,actorId:actor,intentId:intent.intentId,payloadHash:hash,expiresAt:req.expiresAt,createdAt:new Date(now).toISOString(),rationale:req.rationale,intentSnapshot:snapshot,payloadJson:stableStringify(payload),executionAuthorized:false};}
function fixture(overrides={}){
 const calls=[];let reads=0,auth=0;
 const deps={authorize:async()=>{auth++;return{userId:actor,workspaceId:intent.workspaceId,role:'owner'};},loadIntent:async()=>{reads++;return structuredClone(intent);},evaluate:()=>({outcome:'REQUIRE_APPROVAL'}),now:()=>now,getClient:()=>({rpc:async(fn,args)=>{calls.push({fn,args});return {error:null,data:fn==='create_approval_decision'?{status:'created',decision:observation()}:observation()};}}),...overrides};
 return {service:()=>{assert.equal(typeof mod.createApprovalDecisionProducer,'function','safe producer is implemented');return mod.createApprovalDecisionProducer(deps);},calls,reads:()=>reads,auth:()=>auth};
}
test('explicit owner approval binds existing canonical payload; never executes or consumes',async()=>{
 const f=fixture();assert.deepEqual(await f.service().command(req),{status:'recorded',decision:observation()});assert.equal(f.reads(),1);assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].fn,'create_approval_decision');assert.equal(f.calls[0].args.p_actor_id,actor);assert.equal(f.calls[0].args.p_payload_json,stableStringify(payload));assert.equal(f.calls[0].args.p_payload_hash,hash);assert.deepEqual(f.calls[0].args.p_expected_snapshot,snapshot);
});
test('absent/non-owner/malformed or failed auth performs zero reads and writes',async()=>{
 for(const authorize of [async()=>null,async()=>({userId:actor,workspaceId:'fixture-ws',role:'member'}),async()=>({userId:'configured-not-uuid',workspaceId:'fixture-ws',role:'owner'}),async()=>{throw Error('session unavailable');}]){const f=fixture({authorize});assert.equal((await f.service().command(req)).status,'forbidden');assert.equal(f.reads(),0);assert.equal(f.calls.length,0);}
});
test('client identity, false confirmation and unbounded expiry rejected before reads',async()=>{
 for(const input of [{...req,actorId:actor},{...req,workspaceId:'foreign'},{...req,confirmed:false},{...req,expiresAt:new Date(now).toISOString()},{...req,expiresAt:new Date(now+600001).toISOString()}]){const f=fixture();assert.equal((await f.service().command(input)).status,'invalid_request');assert.equal(f.reads(),0);assert.equal(f.calls.length,0);}
});
test('foreign/missing/non-pending/stale/current hard BLOCK and unknown action cannot create decisions',async()=>{
 const cases=[{loadIntent:async()=>null},{loadIntent:async()=>({...intent,workspaceId:'foreign'})},{loadIntent:async()=>({...intent,status:'executed'})},{loadIntent:async()=>({...intent,payload:{...payload,data:{tampered:true}}})},{evaluate:()=>({outcome:'BLOCK'})},{loadIntent:async()=>({...intent,toolName:'invented_unmapped_tool'})}];
 for(const deps of cases){const f=fixture(deps);assert.notEqual((await f.service().command(req)).status,'recorded');assert.equal(f.calls.length,0);}
});
test('malformed or cross-bound ACK is unconfirmed, never recorded; no retry',async()=>{
 for(const data of [null,{},[],{status:'created',decision:{...observation(),actorId:id}},{status:'created',decision:{...observation(),executionAuthorized:true}},{status:'created',decision:{...observation(),payloadJson:'{}'}},{status:'created',decision:{...observation(),expiresAt:new Date(now+60000).toISOString()}}]){const calls=[];const f=fixture({getClient:()=>({rpc:async(...args)=>{calls.push(args);return{data,error:null};}})});assert.equal((await f.service().command(req)).status,'unconfirmed');assert.equal(calls.length,1);}
});
test('lost ACK makes no retry; recover only classifies same request and never loads/creates',async()=>{
 const calls=[];const f=fixture({getClient:()=>({rpc:async(fn)=>{calls.push(fn);if(fn==='create_approval_decision')throw Error('ACK lost');return{data:observation('consumed'),error:null};}})});
 const s=f.service();assert.equal((await s.command(req)).status,'unconfirmed');assert.equal((await s.command(recover)).decision.state,'consumed');assert.deepEqual(calls,['create_approval_decision','classify_approval_decision']);assert.equal(f.reads(),1);
});
test('missing observation is not proof of no mutation, and historical states never renew',async()=>{
 for(const state of ['missing','invalid','expired','revoked','consumed']){const data=['missing','invalid'].includes(state)?{state}:observation(state);const f=fixture({getClient:()=>({rpc:async(fn,args)=>{f.calls.push({fn,args});return{data,error:null};}})});const r=await f.service().command(recover);assert.equal(r.status,['missing','invalid'].includes(state)?'reconciliation_required':'observed');assert.equal(f.reads(),0);assert.deepEqual(f.calls.map(c=>c.fn),['classify_approval_decision']);}
});
test('existing receipt is observation only, refusal does not create an automatic retry',async()=>{
 for(const status of ['existing','already_decided','conflict','not_found','invalid_request']){const f=fixture({getClient:()=>({rpc:async()=>({data:status==='existing'?{status,decision:observation('expired')}:{status},error:null})})});const r=await f.service().command(req);assert.equal(r.status,status==='existing'?'observed':status);}
});
test('offline producer tests never attempted fetch',()=>assert.equal(fetches,0));
test('default authorization wiring derives actual session identity and config workspace before data',async()=>{
 // Run with a clean environment, no Supabase credentials. Only the session I/O
 // module is replaced; real resolveAuthzContext/membership rules are exercised.
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {spawnSync}=await import('node:child_process');
 const dir=mkdtempSync(path.join(tmpdir(),'oria-producer-auth-'));
 try{
  const stub=path.join(dir,'owner.mjs');writeFileSync(stub,`export async function getCurrentAuthUser(){globalThis.authReads++;if(globalThis.failAuth)throw Error('session');return globalThis.authUser;} export function authzIdentity(u){return {userId:u.id,email:u.email,emailVerified:Boolean(u.email&&u.email_confirmed_at)};}`);
  const program=`import assert from 'node:assert/strict';import{createJiti}from'jiti';import path from'node:path';globalThis.fetch=()=>{throw Error('unexpected network');};globalThis.authReads=0;const j=createJiti(path.join(process.cwd(),'proofs/auth-check.mjs'),{moduleCache:false,alias:{'@/server/auth/owner':${JSON.stringify(stub)},'@':path.resolve('src'),'server-only':path.resolve('src/scripts/smoke/server-only-stub.mjs')}});const{createApprovalDecisionProducer}=await j.import('@/server/agents/approval-decision-producer');let reads=0;const s=createApprovalDecisionProducer({loadIntent:async(ws,id)=>{reads++;assert.equal(ws,'session-workspace');assert.equal(id,'fixture-intent');return null;},getClient:()=>{throw Error('unexpected client');}});const request=${JSON.stringify(req)};request.expiresAt=new Date(Date.now()+60000).toISOString();for(const user of [null,{id:'33333333-3333-4333-8333-333333333333'},{id:'44444444-4444-4444-8444-444444444444',email:'owner@example.test'}]){globalThis.authUser=user;assert.equal((await s.command(request)).status,'forbidden');}assert.equal(reads,0);globalThis.authUser={id:${JSON.stringify(actor)}};assert.equal((await s.command(request)).status,'not_found');assert.equal(reads,1);globalThis.failAuth=true;assert.equal((await s.command(request)).status,'forbidden');assert.equal(reads,1);assert.equal(globalThis.authReads,5);`;
  const run=spawnSync(process.execPath,['--input-type=module','-e',program],{cwd:process.cwd(),encoding:'utf8',timeout:10000,env:{NODE_ENV:'test',ORIA_WORKSPACE_MEMBERS:JSON.stringify([{userId:actor,workspaceId:'session-workspace',role:'owner'},{userId:'33333333-3333-4333-8333-333333333333',workspaceId:'session-workspace',role:'member'},{email:'owner@example.test',workspaceId:'session-workspace',role:'owner'}])}});
  assert.equal(run.status,0,run.stderr);assert.equal(run.signal,null);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('actual existing licence policy refuses locked agent without a write',async()=>{
 const locked={...intent,agentId:'closer',payload:{...payload,agentId:'closer'}};
 const f=fixture({loadIntent:async()=>locked,evaluate:undefined});
 assert.equal((await f.service().command({...req,expectedPayloadHash:hashExecutionIntentPayload(locked.payload),expectedIntentHash:hashExecutionIntentPayload({workspaceId:intent.workspaceId,actorId:actor,intentId:intent.intentId,snapshot:{...snapshot,agentId:'closer',payload:locked.payload}})})).status,'blocked');assert.equal(f.calls.length,0);
});

test('review is authenticated read-only; full reviewed intent binding prevents same-payload tool drift',async()=>{
 const f=fixture();const reviewed=await f.service().command({command:'review',intentId:intent.intentId});
 assert.equal(reviewed.status,'reviewed');assert.equal(reviewed.review.expectedPayloadHash,hash);assert.equal(reviewed.review.expectedIntentHash,intentHash);assert.deepEqual(reviewed.review.snapshot,snapshot);assert.equal(reviewed.review.executionAuthorized,false);assert.equal(f.calls.length,0);
 for(const change of [{toolName:'engineering_package_deliver'},{autonomyLevel:2}]){const g=fixture({loadIntent:async()=>({...intent,...change})});assert.equal((await g.service().command(req)).status,'conflict');assert.equal(g.calls.length,0);}
 const other=fixture({loadIntent:async()=>({...intent,intentId:'other'})});assert.equal((await other.service().command({...req,intentId:'other'})).status,'conflict');assert.equal(other.calls.length,0);
 const missing=fixture();const bad=structuredClone(req);delete bad.expectedIntentHash;assert.equal((await missing.service().command(bad)).status,'invalid_request');assert.equal(missing.reads(),0);
});
