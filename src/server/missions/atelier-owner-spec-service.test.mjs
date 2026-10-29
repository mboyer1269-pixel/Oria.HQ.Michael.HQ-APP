import test from 'node:test';
import assert from 'node:assert/strict';
let fetches=0;globalThis.fetch=()=>{fetches++;throw Error('unexpected network');};
const {fixture,C,result,jiti}=await import('./test-fixtures/atelier-owner-spec.mjs');
const {createOwnerSpecService}=await jiti.import('@/server/missions/atelier-owner-spec-service.ts');
const {guardGovernedAction}=await jiti.import('@/server/runtime/execution-guard');
async function setup(overrides={}){
 const f=await fixture(),stats={admit:0,spawn:0,record:0,current:0};let current=structuredClone(f.mission);
 const store={load:async()=>structuredClone(current),review:async(m,ctx,p)=>{const review={payloadJson:JSON.stringify(p),payloadHash:C.sha256(JSON.stringify(p))};current.input[C.OWNER_SPEC_KEY]={review};return{status:'reviewed',review};},
 admit:async(p,hash)=>{stats.admit++;if(current.input[C.OWNER_SPEC_KEY]?.admission)return{status:'existing',receipt:current.input[C.OWNER_SPEC_KEY].admission};const receipt={...f.receipt,payloadHash:hash};current.input[C.OWNER_SPEC_KEY].admission=receipt;return{status:'admitted',receipt};},
 current:async()=>{stats.current++;return true;},record:async(e,r)=>{stats.record++;current.input[C.OWNER_SPEC_KEY].result=r;return{status:'recorded'};}};
 const deps={store,host:{installationId:f.payload.installationId,qualify:async()=>true},engine:{execute:async e=>{stats.spawn++;return result(e);}},...overrides};
 const service=createOwnerSpecService(deps);const command=command=>({command,missionId:f.mission.id,runId:f.request.runId});
 async function review(){return service.command(command('review'),f.context);}
 async function confirm(){const r=await review();return service.command({...command('confirm'),expectedReviewHash:r.review.payloadHash},f.context);}
 return{f,stats,store,deps,service,review,confirm,command,get:()=>current,set:m=>{current=m;}};
}
test('review → real admission port → engine → canonical result, restart recovery never spawns',async()=>{
 const s=await setup(),done=await s.confirm();assert.equal(done.status,'recorded');assert.deepEqual(s.stats,{admit:1,spawn:1,record:1,current:1});
 const restarted=createOwnerSpecService({...s.deps,host:null,engine:null});const recovered=await restarted.command(s.command('recover'),s.f.context);
 assert.equal(recovered.status,'recovered');assert.deepEqual(recovered.result,done.result);assert.equal(s.stats.spawn,1);
 const again=await s.service.command({...s.command('confirm'),expectedReviewHash:done.receipt.payloadHash},s.f.context);assert.equal(again.status,'reconciliation_required');assert.equal(s.stats.spawn,1);
});
test('concurrent explicit confirmations admit at most one engine via fresh-ACK fence',async()=>{
 const s=await setup(),r=await s.review(),req={...s.command('confirm'),expectedReviewHash:r.review.payloadHash};
 const answers=await Promise.all([s.service.command(req,s.f.context),s.service.command(req,s.f.context)]);
 assert.equal(answers.filter(a=>a.status==='recorded').length,1);assert.equal(s.stats.spawn,1);
});
for(const mode of ['lost_ack','historical','revoked','invalid_receipt','record_lost_ack','bad_result'])test(mode+' fails closed, never retries',async()=>{
 const s=await setup();if(mode==='lost_ack')s.store.admit=async()=>({status:'reconciliation_required'});
 if(mode==='historical')s.store.admit=async()=>({status:'existing',receipt:s.f.receipt});
 if(mode==='revoked')s.store.current=async()=>false;
 if(mode==='invalid_receipt')s.store.admit=async()=>({status:'admitted',receipt:{...s.f.receipt,actorId:s.f.request.runId}});
 if(mode==='record_lost_ack')s.store.record=async()=>({status:'reconciliation_required'});
 if(mode==='bad_result')s.deps.engine.execute=async e=>({...result(e),sessionId:null});
 const response=await s.confirm();assert.equal(response.status,'reconciliation_required');assert.equal(s.stats.spawn,mode==='record_lost_ack'?1:mode==='bad_result'?0:0);
});
test('changed source, forged hash, host refusal and default-null provider cannot consume',async()=>{
 const s=await setup(),r=await s.review();const req={...s.command('confirm'),expectedReviewHash:r.review.payloadHash};
 assert.equal((await s.service.command({...req,expectedReviewHash:'0'.repeat(64)},s.f.context)).status,'conflict');
 const m=s.get();m.title+=' changed';s.set(m);assert.equal((await s.service.command(req,s.f.context)).status,'conflict');assert.equal(s.stats.admit,0);
 const closed=await setup({host:null});assert.equal((await closed.review()).status,'unavailable');assert.equal(closed.stats.admit,0);
 const unqualified=await setup();unqualified.deps.host.qualify=async()=>false;assert.equal((await unqualified.review()).status,'unavailable');
});
test('recover foreign identity and tampered stored artifact are refused',async()=>{
 const s=await setup();await s.confirm();assert.equal((await s.service.command(s.command('recover'),{...s.f.context,actorId:s.f.request.runId})).status,'not_found');
 s.get().input[C.OWNER_SPEC_KEY].result.evidence.specText+='tamper';assert.equal((await s.service.command(s.command('recover'),s.f.context)).status,'reconciliation_required');
});
test('narrow action recognition is approval-required, never unknown BLOCK conversion',()=>{
 const check=action=>guardGovernedAction({agentId:'owner-operated-atelier',action,payloadHash:'a'.repeat(64)},()=>{throw Error('never');});
 assert.equal(check('atelier.spec.start').verdict,'REQUIRE_APPROVAL');assert.equal(check('atelier.spec.resume').verdict,'BLOCK');assert.equal(check('unknown').verdict,'BLOCK');assert.equal(fetches,0);
});
test('explicit recover republishes validated local evidence idempotently without execute',async()=>{const s=await setup();let local;const original=s.deps.engine.execute;s.deps.engine.execute=async e=>(local=await original(e));const record=s.store.record;s.store.record=async()=>({status:'reconciliation_required'});assert.equal((await s.confirm()).status,'reconciliation_required');assert.equal(s.stats.spawn,1);s.store.record=record;const recovery=createOwnerSpecService({...s.deps,host:null,engine:{execute:async()=>{throw Error('must not run');},recover:()=>local}});assert.equal((await recovery.command(s.command('recover'),s.f.context)).status,'recovered');assert.equal((await recovery.command(s.command('recover'),s.f.context)).status,'recovered');assert.equal(s.stats.spawn,1);assert.equal(s.stats.record,1);});
test('source snapshot excludes only owner review state; repeat review preserves unrelated evidence',async()=>{const s=await setup();s.get().input.other={keep:true};const before=C.ownerSpecSnapshot(s.get());await s.review();assert.deepEqual(C.ownerSpecSnapshot(s.get()),before);assert.equal((await s.review()).status,'reviewed');assert.deepEqual(C.ownerSpecSnapshot(s.get()).input.other,{keep:true});});
