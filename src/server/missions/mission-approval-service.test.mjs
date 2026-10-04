import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createJiti} from 'jiti';
const jiti=createJiti(import.meta.url,{alias:{'@':path.join(process.cwd(),'src'),'server-only':path.join(process.cwd(),'src/scripts/smoke/server-only-stub.mjs')}});
const {createMissionApprovalService}=await jiti.import('./mission-approval-service.ts');
const {createDevelopmentService}=await jiti.import('./development-mission.ts');
const {buildOpenHandsSubmission}=await jiti.import('./openhands-submission.ts');
const {createMissionApprovalHandler}=await jiti.import('../../app/api/missions/approval/handler.ts');
const {createGatedOpenHandsLaunch}=await jiti.import('./model-emission-launch-gate.ts');
const {createOpenHandsConfirmationService}=await jiti.import('./openhands-confirmation.ts');
const context={workspaceId:'w',actorId:'11111111-1111-4111-8111-111111111111'};
const config={foundationModelId:'claude-fixture-1',imageDigest:'sha256:'+'a'.repeat(64),executorVersion:'1.50.0',runnerId:'runner',permissionPolicy:'deny',maxCostCents:100,maxTokens:1000,maxIterations:2,timeoutSeconds:30,hardTokenLimitEnforced:false,
 providerProfile:{id:'claude-approved',policySha256:'e'.repeat(64),provider:'claude',authentication:'subscription',network:'restricted-proxy',accountConnectors:'disabled'}};
async function fixture(activeConfig=config){
 let row;
 await createDevelopmentService({enabled:()=>true,store:()=>({save:async m=>(row=m),load:async()=>row})}).create(
  {requestId:'714ac9b7-6bce-4eb4-b3bd-08d3df8ad46e',title:'Synthetic mission',objective:'Verify approval boundaries',scope:'One file',acceptanceCriteria:'Tests pass'},
  {...context,modeId:'hq'});
 const dossier=buildOpenHandsSubmission(row,'w',{missionId:row.id,expectedUpdatedAt:row.updatedAt,commitSha:'a'.repeat(40),executorVersion:'1.50.0',foundationModelId:activeConfig.foundationModelId,
  budget:{maxCostCents:100,maxTokens:1000,maxIterations:2,timeoutSeconds:30}}).dossier;
 row.input._openhandsReservation={version:1,reservationId:'22222222-2222-4222-8222-222222222222',state:'audit_recorded',workspaceId:'w',missionId:row.id,
  missionVersion:row.updatedAt,idempotencyKey:dossier.idempotencyKey,payloadHash:dossier.payloadHash,authorizationId:'33333333-3333-4333-8333-333333333333',actorId:context.actorId,
  reservedAt:row.updatedAt,authorizationExpiresAt:new Date(Date.now()+600000).toISOString(),auditId:'audit'};
 let record=null, account='opaque-account-one', active=true, writes=0, launchCalls=0;
 const store={load:async()=>structuredClone(row),readSubmission:async()=>structuredClone(dossier)};
 const probe=async()=>active?{connectionState:'connected',source:'cli-subscription-login',accountId:account}:{connectionState:'connection_required',source:'cli-subscription-login'};
 const service=createMissionApprovalService({store:()=>store,configuration:()=>activeConfig,probe,loadRecord:async()=>record,
  commit:async(mission,prior,next)=>{if(mission.updatedAt!==row.updatedAt || prior!==(record?.id??null))return false;record=structuredClone(next);writes++;return true;}});
 const gated=createGatedOpenHandsLaunch({loadMission:store.load,loadApprovalRecord:async()=>record,loadLaunchConfig:()=>activeConfig,connectionProbe:probe,
  launch:async(_context,_id,confirmation)=>{launchCalls++;assert.equal(confirmation.approvalRecordId,record.id);return {status:'claimed'};}});
 const prepare=()=>service(context,{action:'prepare',missionId:row.id});
 return {service,prepare,gated,row,record:()=>record,writes:()=>writes,launchCalls:()=>launchCalls,setAccount:a=>account=a,disconnect:()=>active=false,
  setRecord:r=>record=r};
}

test('owner reviews persisted dossier and exact account before approve; approve does not launch',async()=>{
 const f=await fixture(), review=await f.prepare();assert.equal(review.status,'prepared');assert.equal(f.writes(),0);
 assert.equal(review.binding.access.accountId,'opaque-account-one');assert.equal(review.binding.launch.config.maxCostCents,100);
 assert.equal(review.mission.scope,'One file');
 const decision=await f.service(context,{action:'approve',missionId:f.row.id,expectedReviewHash:review.reviewHash});
 assert.equal(decision.status,'approved');assert.equal(f.writes(),1);assert.equal(f.launchCalls(),0);
 const launched=await f.gated(context,f.row.id,{confirm:true,expectedLaunchHash:review.binding.launch.launchHash});
 assert.equal(launched.status,'claimed');assert.equal(f.launchCalls(),1);
});
test('configured subscription preparation injects exact model, rejects mismatch and refuses an unspecified model',async()=>{
 const f=await fixture();delete f.row.input._openhandsReservation;
 const req={missionId:f.row.id,expectedUpdatedAt:f.row.updatedAt,commitSha:'a'.repeat(40),executorVersion:'1.50.0',
  budget:{maxCostCents:100,maxTokens:1000,maxIterations:2,timeoutSeconds:30}};
 const prepare=createOpenHandsConfirmationService({store:()=>({load:async()=>f.row}),configuration:()=>config});
 const result=await prepare(context,req);assert.equal(result.status,'prepared');assert.equal(result.dossier.contractVersion,3);
 assert.equal(result.dossier.foundationModelId,config.foundationModelId);
 assert.equal((await prepare(context,{...req,foundationModelId:'claude-fixture-2'})).status,'model_selection_changed');
 const unspecified={...config};delete unspecified.foundationModelId;
 assert.equal((await createOpenHandsConfirmationService({configuration:()=>unspecified})(context,req)).status,'model_selection_required');
 let called=false;
 const gate=createGatedOpenHandsLaunch({loadMission:async()=>f.row,loadLaunchConfig:()=>unspecified,
  loadApprovalRecord:async()=>{called=true;return null;},launch:async()=>{called=true;return {status:'claimed'};}});
 assert.equal((await gate(context,f.row.id,{confirm:true,expectedLaunchHash:'a'.repeat(64)})).status,'model_selection_required');
 assert.equal(called,false,'model requirement refuses before approval lookup or launch');
});

test('ACP default approval requires a runner-attested account and keeps default as the approved ACP identity',async()=>{
 const defaultConfig={...config,foundationModelId:'default',providerProfile:{...config.providerProfile,id:'claude-subscription-default-v1'}};
 const noInjectedProbe=await fixture(defaultConfig);
 const unprobed=createMissionApprovalService({store:()=>noInjectedProbe.store,configuration:()=>defaultConfig,loadRecord:async()=>null,
  commit:async()=>{throw new Error('approval must not be committed without an official probe binding');}});
 assert.equal((await unprobed(context,{action:'prepare',missionId:noInjectedProbe.row.id})).status,'unavailable');

 const f=await fixture(defaultConfig), review=await f.prepare();
 assert.equal(review.status,'prepared');
 assert.equal(review.binding.launch.config.foundationModelId,'default');
 assert.equal(review.binding.access.accountId,'opaque-account-one');
 const decision=await f.service(context,{action:'approve',missionId:f.row.id,expectedReviewHash:review.reviewHash});
 assert.equal(decision.status,'approved');
 assert.equal(f.writes(),1);
});
test('foreign workspace and injected authority never write or disclose a review',async()=>{
 const f=await fixture();assert.equal((await f.service({...context,workspaceId:'foreign'},{action:'prepare',missionId:f.row.id})).status,'not_found');
 assert.equal((await f.service(context,{action:'approve',missionId:f.row.id,expectedReviewHash:'a'.repeat(64),accountId:'injected'})).status,'invalid_request');
 assert.equal(f.writes(),0);
});
test('changed account and changed persisted mission invalidate the browser review',async()=>{
 for(const kind of ['account','mission','version']){
  const f=await fixture(), review=await f.prepare();
  if(kind==='account')f.setAccount('another-account');
  if(kind==='mission')f.row.objective='Changed after preview';
  if(kind==='version')f.row.updatedAt=new Date(Date.now()+2000).toISOString();
  const result=await f.service(context,{action:'approve',missionId:f.row.id,expectedReviewHash:review.reviewHash});
  assert.ok(['review_changed','submission_required'].includes(result.status),result.status);assert.equal(f.writes(),0);
 }
});
test('concurrent decisions have one winner and stale approval cannot overwrite rejection',async()=>{
 const f=await fixture(),review=await f.prepare();
 const args={missionId:f.row.id,expectedReviewHash:review.reviewHash};
 const results=await Promise.all([f.service(context,{...args,action:'reject'}),f.service(context,{...args,action:'approve'})]);
 assert.equal(results.filter(x=>['approved','rejected'].includes(x.status)).length,1);assert.equal(f.writes(),1);
 assert.equal(f.record().status,'rejected');
});
test('revoke survives lost connection and prevents the next launch',async()=>{
 const f=await fixture(),review=await f.prepare();
 await f.service(context,{action:'approve',missionId:f.row.id,expectedReviewHash:review.reviewHash});
 const approvalId=f.record().id;f.disconnect();
 assert.equal((await f.prepare()).previousDecision.id,approvalId);
 assert.equal((await f.service(context,{action:'revoke',missionId:f.row.id,expectedApprovalId:approvalId})).status,'revoked');
 assert.equal(f.record().status,'revoked');assert.equal(f.launchCalls(),0);
 assert.notEqual((await f.gated(context,f.row.id,{confirm:true,expectedLaunchHash:review.binding.launch.launchHash})).status,'claimed');
});
test('gate rejects legacy approvals and changed account/model/budget/plan bindings',async()=>{
 for(const change of ['legacy','account','model','foundation','budget','workspace','version','launch']){
  const f=await fixture(),review=await f.prepare();
  await f.service(context,{action:'approve',missionId:f.row.id,expectedReviewHash:review.reviewHash});
  const record=structuredClone(f.record());
  if(change==='legacy')delete record.binding;
  if(change==='account')record.binding.access.accountId='wrong-account';
  if(change==='model')record.binding.access.modelId='another-model';
  if(change==='foundation')record.binding.launch.config.foundationModelId='claude-fixture-2';
  if(change==='budget')record.binding.launch.config.maxTokens++;
  if(change==='workspace')record.binding.access.workspaceId='foreign';
  if(change==='version')record.binding.missionVersion=new Date(0).toISOString();
  if(change==='launch')record.binding.launch.launchHash='d'.repeat(64);
  f.setRecord(record);
  assert.equal((await f.gated(context,f.row.id,{confirm:true,expectedLaunchHash:review.binding.launch.launchHash})).status,'approval_binding_changed',change);
  assert.equal(f.launchCalls(),0);
 }
});
test('HTTP owner/auth/origin/body boundaries run before decision service',async()=>{
 let calls=0;
 const deps={authenticate:async()=>context,workspaceId:()=>context.workspaceId,publicOrigin:()=>undefined,service:async()=>{calls++;return {status:'prepared'};}};
 const req=(origin='https://hq.test',body={action:'prepare',missionId:'11111111-1111-4111-8111-111111111111'})=>new Request('https://hq.test/api/missions/approval',{
  method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 for(const status of [401,403])assert.equal((await createMissionApprovalHandler({...deps,authenticate:async()=>Response.json({status:'denied'},{status})})(req())).status,status);
 assert.equal((await createMissionApprovalHandler(deps)(req('https://foreign.test'))).status,403);
 assert.equal((await createMissionApprovalHandler(deps)(req(undefined,{action:'prepare',missionId:'wrong'}))).status,400);
 assert.equal(calls,0);assert.equal((await createMissionApprovalHandler(deps)(req())).status,200);assert.equal(calls,1);
});
