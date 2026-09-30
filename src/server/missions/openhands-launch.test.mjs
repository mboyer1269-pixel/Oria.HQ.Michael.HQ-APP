import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createJiti} from 'jiti';
const jiti=createJiti(import.meta.url,{alias:{'@':path.join(process.cwd(),'src'),'server-only':path.join(process.cwd(),'src/scripts/smoke/server-only-stub.mjs')}});
const {createOpenHandsLaunchService,launchBinding,OPENHANDS_LAUNCH_KEY}=await jiti.import('./openhands-launch.ts');
const {createConfiguredOpenHandsLaunch}=await jiti.import('./openhands-configured-launch.ts');
const {createPendingOpenHandsLaunchReader}=await jiti.import('./openhands-pending-launches.ts');
const {createOpenHandsLaunchStore}=await jiti.import('./openhands-launch-store.ts');
const {createOpenHandsLifecycleService}=await jiti.import('./openhands-lifecycle.ts');
const {admitOpenHandsToolRequest}=await jiti.import('./openhands-tool-admission.ts');
const {createOpenHandsToolService}=await jiti.import('./openhands-tool-service.ts');
const {createDevelopmentService}=await jiti.import('./development-mission.ts');
const {buildOpenHandsSubmission}=await jiti.import('./openhands-submission.ts');
let original;
await createDevelopmentService({enabled:()=>true,store:()=>({save:async(m)=>{original=m;return m;},load:async()=>original})}).create({requestId:'714ac9b7-6bce-4eb4-b3bd-08d3df8ad46e',title:'Synthetic',objective:'Verify launch',scope:'One file',acceptanceCriteria:'Tests pass'},{workspaceId:'w',modeId:'hq',actorId:'owner'});
const now=Date.parse('2026-09-30T12:00:00Z');
const context={workspaceId:'w',actorId:'owner'};
const config={imageDigest:'sha256:'+'a'.repeat(64),executorVersion:'1.50.0',runnerId:'runner',permissionPolicy:'deny',maxCostCents:100,maxTokens:1000,maxIterations:2,timeoutSeconds:30,hardTokenLimitEnforced:false};
const providerProfile={id:'claude-subscription-v1',policySha256:'e'.repeat(64),provider:'claude',authentication:'subscription',network:'restricted-proxy',accountConnectors:'disabled'};
test('provider policy changes invalidate preview and persisted launch authority',async()=>{
 for(const next of [providerProfile,{...providerProfile,id:'claude-subscription-v2'},{...providerProfile,policySha256:'f'.repeat(64)},undefined]){
  const f=fixture();
  const before=next===providerProfile?config:{...config,providerProfile};
  const after=next===undefined?config:{...config,providerProfile:next};
  const preview=await f.service(context,{...f.request,config:before});
  assert.equal(preview.status,'prepared');
  const confirmation={confirm:true,expectedLaunchHash:preview.binding.launchHash};
  assert.equal((await f.service(context,{...f.request,config:after},confirmation)).status,'dossier_changed');
  assert.equal(f.writes(),0);
  await f.store.persistAuthority(preview.binding,context.actorId,now);
  const updated=await f.service(context,{...f.request,config:after});
  assert.notEqual(updated.binding.launchHash,preview.binding.launchHash);
  assert.equal((await f.service(context,{...f.request,config:after},{confirm:true,expectedLaunchHash:updated.binding.launchHash})).status,'authorization_denied');
  assert.equal(f.writes(),0);
 }
});
test('provider contract rejects secrets, host paths, unknown policies and malformed digests',async()=>{
 for(const profile of [null,{...providerProfile,token:'synthetic'},{...providerProfile,authPath:'/private'},
  {...providerProfile,network:'host'},{...providerProfile,accountConnectors:'enabled'},
  {...providerProfile,policySha256:'invalid'},{...providerProfile,id:'../profile'}]){
  const f=fixture();assert.equal((await f.service(context,{...f.request,config:{...config,providerProfile:profile}})).status,'ineligible_mission');
  assert.equal(f.writes(),0);
 }
});
test('offline preview preserves its configuration without injecting provider defaults',async()=>{
 const f=fixture();const preview=await f.service(context,f.request);
 assert.deepEqual(preview.binding.config,config);
 assert.equal(Object.hasOwn(preview.binding.config,'providerProfile'),false);
});
function fixture(options={}) {
 let row={id:'11111111-1111-4111-8111-111111111111',workspaceId:'w',status:'draft',updatedAt:'2026-09-30T11:00:00Z',input:{_openhandsReservation:{version:1,reservationId:'22222222-2222-4222-8222-222222222222',state:'audit_recorded',workspaceId:'w',missionId:'11111111-1111-4111-8111-111111111111',missionVersion:'2026-09-30T11:00:00Z',idempotencyKey:'hq-openhands-v1-'+'a'.repeat(64),payloadHash:'b'.repeat(64),authorizationId:'33333333-3333-4333-8333-333333333333',actorId:'owner',reservedAt:'2026-09-30T11:59:00Z',authorizationExpiresAt:'2026-09-30T12:09:00Z',auditId:'audit'}}};
 const receipt=row.input._openhandsReservation;
 row=structuredClone(original);row.updatedAt='2026-09-30T11:00:00Z';
 const dossier=buildOpenHandsSubmission(row,'w',{missionId:row.id,expectedUpdatedAt:row.updatedAt,commitSha:'a'.repeat(40),executorVersion:'1.50.0',budget:{maxCostCents:100,maxTokens:1000,maxIterations:2,timeoutSeconds:30}}).dossier;
 row.input._openhandsReservation={...receipt,missionId:row.id,missionVersion:row.updatedAt,payloadHash:dossier.payloadHash,idempotencyKey:dossier.idempotencyKey};
 let authority;let writes=0;
 const store={readSubmission:async()=>options.noLedger?null:structuredClone(dossier),load:async()=>structuredClone(row),persistAuthority:async(binding,actor)=>{authority??={version:1,id:'44444444-4444-4444-8444-444444444444',scope:'openhands.launch',workspaceId:'w',missionId:row.id,reservationId:binding.reservationId,payloadHash:binding.payloadHash,launchHash:binding.launchHash,actorId:actor,approvedAt:new Date(now).toISOString(),expiresAt:new Date(now+(options.expired?0:600000)).toISOString()};return authority;},readAuthority:async()=>({...authority,...options.authorityPatch}),compareAndSwap:async(mission,claim)=>{if(JSON.stringify(mission)!==JSON.stringify(row))return null;writes++;row={...row,input:{...row.input,[OPENHANDS_LAUNCH_KEY]:claim}};if(options.ambiguous)throw Error('lost response');return structuredClone(row);}};
 const binding=launchBinding(row,'owner',config,dossier); const request={missionId:row.id,config};
 return {store,service:createOpenHandsLaunchService({store:()=>store,now:()=>now}),request,confirmation:{confirm:true,expectedLaunchHash:binding.launchHash},writes:()=>writes,row:()=>row};
}
test('concurrent claims have one winner; repeat stays closed',async()=>{const f=fixture();const r=await Promise.all([f.service(context,f.request,f.confirmation),f.service(context,f.request,f.confirmation)]);assert.equal(r.filter(x=>x.status==='claimed').length,1);assert.equal(f.writes(),1);assert.equal((await f.service(context,f.request,f.confirmation)).status,'reconciliation_required');assert.ok(r.every(x=>x.externalEffectAllowed===false));});

test('host discovery rechecks canonical authority and does not acquire or renew a job',async()=>{
 const f=fixture();await f.service(context,f.request,f.confirmation);
 const profile={context:{...context,runnerId:config.runnerId},config};
 const scan=async()=>[{id:f.row().id,input:structuredClone(f.row().input)}];
 const read=createPendingOpenHandsLaunchReader({scan,store:()=>f.store,now:()=>now});
 const result=await read(profile);assert.equal(result.status,'ready');assert.equal(result.jobs.length,1);assert.equal(result.scanned,1);
 assert.equal(result.jobs[0].launchId,f.row().input._openhandsLaunch.launchId);assert.equal(f.writes(),1);
 assert.equal(result.nextAfterMissionId,null);assert.equal(JSON.stringify(result).includes('dossier'),false);
 const expired=createPendingOpenHandsLaunchReader({scan,store:()=>f.store,now:()=>now+600001});
 assert.deepEqual((await expired(profile)).jobs,[]);
 assert.deepEqual((await read({...profile,context:{...profile.context,workspaceId:'foreign'}})).jobs,[]);
 assert.equal((await read(profile,'untrusted cursor')).status,'invalid_request');
 f.row().input._openhandsLaunch.state='creation_requested';assert.deepEqual((await read(profile)).jobs,[]);
 assert.equal(f.writes(),1);
});

test('host discovery reports canonical read failure rather than an empty healthy queue',async()=>{
 const f=fixture();await f.service(context,f.request,f.confirmation);
 const rows=[{id:f.row().id,input:structuredClone(f.row().input)}];
 f.store.load=async()=>{throw Error('database unavailable');};
 const read=createPendingOpenHandsLaunchReader({scan:async()=>rows,store:()=>f.store,now:()=>now});
 assert.deepEqual(await read({context:{...context,runnerId:config.runnerId},config}),{status:'unavailable'});
});

test('host discovery paginates rejected records and bounds concurrent rechecks',async()=>{
 const f=fixture();await f.service(context,f.request,f.confirmation);
 let active=0,max=0;const originalLoad=f.store.load;
 f.store.load=async(...args)=>{active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,3));const value=await originalLoad(...args);active--;return value;};
 const rows=Array.from({length:20},()=>({id:f.row().id,input:structuredClone(f.row().input)}));
 const read=createPendingOpenHandsLaunchReader({scan:async()=>rows,store:()=>f.store,now:()=>now+600001});
 const result=await read({context:{...context,runnerId:config.runnerId},config});
 assert.equal(result.status,'ready');assert.equal(result.rejected,20);assert.equal(result.nextAfterMissionId,f.row().id);assert.ok(max<=4);
});

test('configured launch is closed without valid server configuration and rebinds preview on change',async()=>{
 let storeReads=0;
 for(const raw of [undefined,'not json','x'.repeat(4097),JSON.stringify({...config,permissionPolicy:'allow'})]) {
  const launch=createConfiguredOpenHandsLaunch({enabled:()=>true,configuration:()=>raw,store:()=>{storeReads++;return null;}});
  assert.equal((await launch(context,original.id)).status,'unavailable');
 }
 const disabled=createConfiguredOpenHandsLaunch({enabled:()=>false,configuration:()=>{throw Error('should not read');}});
 assert.equal((await disabled(context,original.id)).status,'disabled');assert.equal(storeReads,0);
 const f=fixture();let current={...config};
 const launch=createConfiguredOpenHandsLaunch({enabled:()=>true,configuration:()=>JSON.stringify(current),store:()=>f.store});
 const preview=await launch(context,f.request.missionId);assert.equal(preview.status,'prepared');assert.equal(f.writes(),0);
 current={...config,imageDigest:'sha256:'+'f'.repeat(64)};
 const changed=await launch(context,f.request.missionId,{confirm:true,expectedLaunchHash:preview.binding.launchHash});
 assert.equal(changed.status,'dossier_changed');assert.equal(f.writes(),0);
});
test('expired and mismatched launch authority denied',async()=>{for(const options of [{expired:true},{authorityPatch:{scope:'openhands.submission'}},{authorityPatch:{launchHash:'c'.repeat(64)}}]){const f=fixture(options);assert.equal((await f.service(context,f.request,f.confirmation)).status,'authorization_denied');assert.equal(f.writes(),0);}});
test('ambiguous write never retries launch claim',async()=>{const f=fixture({ambiguous:true});assert.equal((await f.service(context,f.request,f.confirmation)).status,'reconciliation_required');assert.equal((await f.service(context,f.request,f.confirmation)).status,'reconciliation_required');assert.equal(f.writes(),1);});
test('preview does not reserve; changed config invalidates confirmation',async()=>{const f=fixture();assert.equal((await f.service(context,f.request)).status,'prepared');assert.equal((await f.service(context,{...f.request,config:{...config,maxIterations:3}},f.confirmation)).status,'ineligible_mission');assert.equal(f.writes(),0);});
test('altered mission and arbitrary extensions cannot inherit reservation',async()=>{
 for(const mutate of [m=>m.objective='changed',m=>m.input.development.scope='changed',m=>m.input.untrusted={accepted:true}]){
  const f=fixture();mutate(f.row());assert.equal((await f.service(context,f.request,f.confirmation)).status,'ineligible_mission');assert.equal(f.writes(),0);
 }
});
test('receipt without canonical submission ledger cannot authorize launch',async()=>{const f=fixture({noLedger:true});assert.equal((await f.service(context,f.request,f.confirmation)).status,'ineligible_mission');assert.equal(f.writes(),0);});
test('canonical launch ledger id must equal authorization metadata id',async()=>{
 const f=fixture();const preview=await f.service(context,f.request);const binding=preview.binding;
 let row;let corrupt=false;
 const client={from:()=>({upsert:async(value)=>{row=structuredClone(value);return {error:null};},select:()=>{
  const query={eq:()=>query,maybeSingle:async()=>{const data=structuredClone(row);if(corrupt)data.metadata.authorization.id='99999999-9999-4999-8999-999999999999';return {data,error:null};}};return query;
 }})};
 const store=createOpenHandsLaunchStore(client);
 const authority=await store.persistAuthority(binding,'owner',now);assert.equal(authority.id,row.id);
 corrupt=true;assert.equal(await store.readAuthority(binding,'owner'),null);
});

test('lifecycle CAS chooses one creator, binds container and records process without validation',async()=>{
 const f=fixture();const {claim}=await f.service(context,f.request,f.confirmation);
 const service=createOpenHandsLifecycleService({store:()=>f.store,now:()=>now});
 const ctx={...context,runnerId:'runner'};
 const request={...f.request,launchId:claim.launchId};
 const step=transition=>service(ctx,{...request,transition});
 const attempts=await Promise.all([step({expected:'claimed',next:'creation_requested'}),step({expected:'claimed',next:'creation_requested'})]);
 assert.equal(attempts.filter(x=>x.status==='recorded').length,1);
 assert.equal((await step({expected:'creation_requested',next:'container_created',containerId:'d'.repeat(64)})).status,'recorded');
 assert.equal((await step({expected:'container_created',next:'start_requested',containerId:'e'.repeat(64)})).status,'binding_mismatch');
 assert.equal((await step({expected:'container_created',next:'start_requested',containerId:'d'.repeat(64)})).status,'recorded');
 const result=await step({expected:'start_requested',next:'execution_finished',containerId:'d'.repeat(64),process:{exitCode:0,containerStopped:true,deadlineExceeded:false}});
 assert.equal(result.status,'recorded');assert.equal(result.independentValidationPassed,false);
 assert.equal(result.claim.state,'execution_finished');
});

test('lifecycle denies foreign runner and expired authority before creation',async()=>{
 const f=fixture();const {claim}=await f.service(context,f.request,f.confirmation);
 const request={...f.request,launchId:claim.launchId,transition:{expected:'claimed',next:'creation_requested'}};
 const service=createOpenHandsLifecycleService({store:()=>f.store,now:()=>now+600001});
 assert.equal((await service({...context,runnerId:'foreign'},request)).status,'binding_mismatch');
 assert.equal((await service({...context,runnerId:'runner'},request)).status,'authorization_denied');
 assert.equal(f.row().input._openhandsLaunch.state,'claimed');
});

test('canonical observation preserves binding checks without writes or renewed authority',async()=>{
 const f=fixture();const {claim}=await f.service(context,f.request,f.confirmation);
 const service=createOpenHandsLifecycleService({store:()=>f.store,now:()=>now+600001});
 const request={...f.request,launchId:claim.launchId,transition:{next:'read'}};
 const writes=f.writes();
 const result=await service({...context,runnerId:'runner'},request);
 assert.equal(result.status,'observed');assert.deepEqual(result.claim,claim);
 assert.equal(f.writes(),writes);
 assert.equal((await service({...context,runnerId:'foreign'},request)).status,'binding_mismatch');
 assert.equal((await service({...context,runnerId:'runner'},{...request,launchId:'wrong'})).status,'binding_mismatch');
 assert.equal(f.writes(),writes);
});

test('tool admission requires registered live session and denies stopped or expired jobs',async()=>{
 const f=fixture();const {claim}=await f.service(context,f.request,f.confirmation);
 const ctx={...context,runnerId:'runner'};
 const service=createOpenHandsLifecycleService({store:()=>f.store,now:()=>now});
 const step=transition=>service(ctx,{...f.request,launchId:claim.launchId,transition});
 for(const transition of [{expected:'claimed',next:'creation_requested'},{expected:'creation_requested',next:'container_created',containerId:'d'.repeat(64)},{expected:'container_created',next:'start_requested',containerId:'d'.repeat(64)}])assert.equal((await step(transition)).status,'recorded');
 const request={version:1,workspaceId:'w',missionId:f.request.missionId,launchId:claim.launchId,runnerId:'runner',containerId:'d'.repeat(64),sessionId:'session',toolCallId:'call',inputJson:'{"command":"npm test"}',options:[{optionId:'allow',kind:'allow_once'}],requestedAt:new Date(now).toISOString(),expiresAt:new Date(now+30000).toISOString()};
 assert.equal(await admitOpenHandsToolRequest(f.store,ctx,request,config,now),null);
 assert.equal((await step({expected:'start_requested',next:'running',containerId:'d'.repeat(64),sessionId:'session'})).status,'recorded');
 assert.ok(await admitOpenHandsToolRequest(f.store,ctx,request,config,now));
 let consumed=false;let cancelDuringConsume=false;
 const decisions={persist:async()=>({decision:{decisionId:'fixture'}}),consume:async()=>{
  if(consumed)return null;consumed=true;
  if(cancelDuringConsume)f.row().input._openhandsLaunch.state='cancelled';
  return {option:{optionId:'allow'}};
 }};
 const tools=createOpenHandsToolService({launches:()=>f.store,decisions:()=>decisions,now:()=>now});
 assert.equal((await tools.approve(ctx,request,config,'allow')).status,'recorded');
 assert.equal((await tools.consume(ctx,request,config)).outcome.outcome,'selected');
 assert.equal((await tools.consume(ctx,request,config)).outcome.outcome,'cancelled');
 consumed=false;cancelDuringConsume=true;
 assert.equal((await tools.consume(ctx,request,config)).outcome.outcome,'cancelled');
 f.row().input._openhandsLaunch.state='running';
 assert.equal(await admitOpenHandsToolRequest(f.store,ctx,{...request,sessionId:'other'},config,now),null);
 const later={...request,requestedAt:new Date(now+30000).toISOString(),expiresAt:new Date(now+60000).toISOString()};
 assert.equal(await admitOpenHandsToolRequest(f.store,ctx,later,config,now+30000),null);
 assert.equal((await step({expected:'running',next:'execution_finished',containerId:'d'.repeat(64),process:{exitCode:0,containerStopped:true,deadlineExceeded:false}})).status,'recorded');
 assert.equal(await admitOpenHandsToolRequest(f.store,ctx,request,config,now),null);
});

test('preparation exports only the canonical dossier with current launch authority',async()=>{
 const f=fixture();const {claim}=await f.service(context,f.request,f.confirmation);
 const ctx={...context,runnerId:'runner'};
 const request={...f.request,launchId:claim.launchId,transition:{next:'prepare'}};
 const service=createOpenHandsLifecycleService({store:()=>f.store,now:()=>now});
 const writes=f.writes();const result=await service(ctx,request);
 assert.equal(result.status,'observed');assert.equal(result.dossier.payloadHash,claim.payloadHash);
 assert.equal(result.dossier.source.commitSha,claim.commitSha);assert.equal(f.writes(),writes);
 assert.equal((await service({...ctx,runnerId:'foreign'},request)).status,'binding_mismatch');
 const expired=createOpenHandsLifecycleService({store:()=>f.store,now:()=>now+600001});
 assert.equal((await expired(ctx,request)).status,'authorization_denied');
 f.row().input._openhandsLaunch.state='creation_requested';
 assert.equal((await service(ctx,request)).status,'conflict');
});
