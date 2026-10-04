import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createJiti} from 'jiti';
import {createClient} from '@supabase/supabase-js';
const jiti=createJiti(import.meta.url,{alias:{'@':path.join(process.cwd(),'src'),'server-only':path.join(process.cwd(),'src/scripts/smoke/server-only-stub.mjs')}});
const {createDevelopmentService}=await jiti.import('./development-mission.ts');
const {buildOpenHandsSubmission}=await jiti.import('./openhands-submission.ts');
const {createOpenHandsReservationService,OPENHANDS_RESERVATION_KEY,validateOpenHandsAuthorization}=await jiti.import('./openhands-reservation.ts');
const {createOpenHandsReservationStore}=await jiti.import('./openhands-reservation-store.ts');
let original;
await createDevelopmentService({enabled:()=>true,store:()=>({save:async(m)=>{original=m;return m;},load:async()=>original})}).create({requestId:'714ac9b7-6bce-4eb4-b3bd-08d3df8ad46e',title:'Synthetic',objective:'Verify reservation',scope:'One bounded file',acceptanceCriteria:'Tests pass'},{workspaceId:'synthetic-a',modeId:'hq',actorId:'owner'});
const request={missionId:original.id,expectedUpdatedAt:original.updatedAt,commitSha:'a'.repeat(40),executorVersion:'1.2.3',budget:{maxCostCents:100,maxTokens:10000,maxIterations:10,timeoutSeconds:120}};
const context={workspaceId:'synthetic-a',actorId:'owner'};
const now=Date.parse('2026-09-30T12:00:00Z');
function approval(d){return {version:1,id:'4873e1c7-d1ee-47ec-a90a-7a12c7f85734',scope:'openhands.submission',workspaceId:d.mission.workspaceId,missionId:d.mission.id,missionVersion:d.mission.version,idempotencyKey:d.idempotencyKey,payloadHash:d.payloadHash,actorId:'owner',approvedAt:'2026-09-30T11:59:00Z',expiresAt:'2026-09-30T12:10:00Z'};}
function fixture(options={}){
 let row=structuredClone(original);let audits=0,writes=0;
 const store={load:async()=>structuredClone(row),compareAndSwap:async(m,receipt)=>{
  if(JSON.stringify(row.input)!==JSON.stringify(m.input)||row.updatedAt!==m.updatedAt||row.workspaceId!==m.workspaceId)return null;
  row={...row,input:{...row.input,[OPENHANDS_RESERVATION_KEY]:structuredClone(receipt)},updatedAt:new Date(now+(++writes)).toISOString()};
  if(options.ambiguous&&writes===1)throw Error('write committed, response lost');
  return structuredClone(row);
 },audit:async()=>{audits++;if(options.auditFail)throw Error('audit unavailable');return 'ledger-id';}};
 return {store,row:()=>row,stats:()=>({audits,writes}),service:createOpenHandsReservationService({store:()=>store,resolveAuthorization:async(d)=>approval(d),now:()=>now})};
}
test('one winner across concurrent submissions; duplicates never audit/reserve again',async()=>{
 const f=fixture();const results=await Promise.all([f.service(context,request),f.service(context,request)]);
 assert.equal(results.filter(r=>r.status==='reserved').length,1);assert.equal(results.filter(r=>r.status==='conflict').length,1);
 assert.deepEqual(f.stats(),{audits:1,writes:2});
 const again=await f.service(context,request);assert.equal(again.status,'already_reserved');assert.equal(again.externalEffectAllowed,false);assert.deepEqual(f.stats(),{audits:1,writes:2});
});
test('same version changed payload conflicts; foreign workspace and other actor cannot inherit receipt',async()=>{
 const f=fixture();await f.service(context,request);
 assert.equal((await f.service(context,{...request,commitSha:'b'.repeat(40)})).status,'conflict');
 assert.equal((await f.service({...context,workspaceId:'foreign'},request)).status,'not_found');
 assert.equal((await f.service({...context,actorId:'another'},request)).status,'authorization_denied');assert.equal(f.stats().audits,1);
});
test('audit failure and ambiguous CAS remain closed on retry; no automatic resend',async()=>{
 for(const options of [{auditFail:true},{ambiguous:true}]){
  const f=fixture(options);assert.equal((await f.service(context,request)).status,'reconciliation_required');
  const before=f.stats();assert.equal((await f.service(context,request)).status,'reconciliation_required');assert.deepEqual(f.stats(),before);
 }
 const f=fixture();f.row().input[OPENHANDS_RESERVATION_KEY]=null;assert.equal((await f.service(context,request)).status,'reconciliation_required');assert.equal(f.stats().writes,0);
 const uncertain=fixture();await uncertain.service(context,request);uncertain.row().input[OPENHANDS_RESERVATION_KEY].state='outcome_unknown';const before=uncertain.stats();assert.equal((await uncertain.service(context,request)).status,'reconciliation_required');assert.deepEqual(uncertain.stats(),before);
});
test('complete authority is hash/version/actor/workspace bound and expiry mandatory; broad mission approval rejected',async()=>{
 const d=buildOpenHandsSubmission(original,context.workspaceId,request).dossier;const a=approval(d);
 for(const patch of [{expiresAt:'2026-09-30T12:00:00Z'},{approvedAt:'invalid'},{approvedAt:'2026-09-30T12:01:00Z'},{expiresAt:'2026-10-02T12:00:00Z'},{workspaceId:'foreign'},{actorId:'another'},{payloadHash:'b'.repeat(64)},{missionVersion:'2020-01-01T00:00:00Z'},{scope:'full_mission'}])assert.equal(validateOpenHandsAuthorization({...a,...patch},d,'owner',now),null);
 const f=fixture();const service=createOpenHandsReservationService({store:()=>f.store,resolveAuthorization:async()=>({...a,expiresAt:'2026-09-30T12:00:00Z'}),now:()=>now});
 assert.equal((await service(context,request)).status,'authorization_denied');assert.deepEqual(f.stats(),{audits:0,writes:0});
});
test('expiry rechecked after slow authority lookup; no configured durable store fails closed',async()=>{
 const f=fixture();let time=now;
 const service=createOpenHandsReservationService({store:()=>f.store,resolveAuthorization:async(d)=>{time+=3600000;return approval(d);},now:()=>time});
 assert.equal((await service(context,request)).status,'authorization_denied');assert.equal(f.stats().writes,0);
 assert.equal((await createOpenHandsReservationService({store:()=>null,resolveAuthorization:async()=>null})(context,request)).status,'unavailable');
});
test('real Supabase builder CAS pins id/workspace/status/version/full prior input and preserves development fields',async()=>{
 let call;
 const client=createClient('https://synthetic.invalid','test-key',{auth:{persistSession:false},global:{fetch:async(url,init)=>{call={url:new URL(url),method:init.method,body:JSON.parse(init.body)};return new Response('[]',{status:200,headers:{'content-type':'application/json'}});}}});
 const store=createOpenHandsReservationStore(client);const receipt={version:1,state:'reserved'};
 assert.equal(await store.compareAndSwap(original,receipt),null);
 assert.equal(call.method,'PATCH');for(const [k,v] of Object.entries({id:original.id,workspace_id:original.workspaceId,status:'draft',updated_at:original.updatedAt,input:JSON.stringify(original.input)}))assert.equal(call.url.searchParams.get(k),`eq.${v}`);
 assert.deepEqual(call.body.input.development,original.input.development);assert.deepEqual(call.body.input[OPENHANDS_RESERVATION_KEY],receipt);
});
