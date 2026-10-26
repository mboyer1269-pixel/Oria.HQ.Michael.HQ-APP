import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createJiti} from 'jiti';
const jiti=createJiti(import.meta.url,{alias:{'@':path.join(process.cwd(),'src'),'server-only':path.join(process.cwd(),'src/scripts/smoke/server-only-stub.mjs')}});
const {createDevelopmentService}=await jiti.import('./development-mission.ts');
const {createEmployeePreparationVerifier}=await jiti.import('../employees/preparation.ts');
const {getDefaultWorkspace}=await jiti.import('../../core/workspaces/registry.ts');
const {missionDossierSummary}=await jiti.import('../../features/missions/mission-dossier.ts');
const {employeePreparationHref,parseEmployeePreparationParams}=await jiti.import('../../core/employees/preparation.ts');
const {performDevelopmentRequest}=await jiti.import('../../features/missions/development-mission-session.ts');
const {createDevelopmentHandlers}=await jiti.import('../../app/api/missions/development/handlers.ts');
const workspace=getDefaultWorkspace({ownerUserId:'owner'});
const ctx={workspaceId:workspace.id,modeId:'hq',actorId:'owner'};
const reference={version:1,employeeId:'emp_12345678-1234-4234-8234-123456789abc',revision:1,ventureId:'business-a'};
const input={requestId:'12345678-1234-4234-8234-123456789abc',title:'Prepare research',objective:'Document findings',scope:'Read local files',acceptanceCriteria:'Cite sources',employeePreparation:reference};
function harness(){
 const rows=new Map(); let writes=0,reads=0;
 const profile={id:reference.employeeId,ownerId:'owner',workspaceId:workspace.id,ventureId:'business-a',state:'draft',revision:1,displayName:'Research',specialty:'Research',instructions:'Inspect sources',assignmentRole:'Analyst',assignmentContext:'Local business'};
 const verifier=createEmployeePreparationVerifier({enabled:()=>true,durable:()=>true,venture:async(ws,id)=>ws===workspace.id&&id==='business-a'?{id}:null,store:()=>({list:async scope=>{reads++;return profile.ownerId===scope.ownerId&&profile.workspaceId===scope.workspaceId&&profile.ventureId===scope.ventureId?[structuredClone(profile)]:[];}})});
 const store={save:async mission=>{writes++;if(!rows.has(mission.id))rows.set(mission.id,structuredClone(mission));return structuredClone(rows.get(mission.id));},load:async(ws,id)=>rows.get(id)?.workspaceId===ws?structuredClone(rows.get(id)):null};
 const service=createDevelopmentService({enabled:()=>true,store:()=>store,verifyEmployee:verifier});
 return {rows,store,profile,service,verifier,get writes(){return writes},get reads(){return reads}};
}
test('synthetic scoped composition persists nonexecuting provenance and shows it in receipt/dossier',async()=>{
 const h=harness();const receipt=await h.service.create(input,ctx);assert.equal(receipt.status,'saved');assert.equal(receipt.executionRequested,false);assert.deepEqual(receipt.employeePreparation,reference);
 const mission=h.rows.get(receipt.missionId);assert.equal(mission.assignedAgentId,'');assert.equal(mission.status,'draft');assert.equal(mission.autonomyLevel,0);assert.equal(mission.input.development.version,2);assert.equal(mission.input.development.createdBy,'owner');assert.equal(missionDossierSummary(mission).owner,'Non attribué');assert.deepEqual(missionDossierSummary(mission).employeePreparation,reference);assert.equal(h.writes,1);
 const url=new URL(employeePreparationHref(reference),'http://localhost');assert.deepEqual(parseEmployeePreparationParams(Object.fromEntries(url.searchParams)),reference);
});
test('forged ID/ownership fields, missing or foreign business, owner/workspace, archive and stale revision refuse before save',async()=>{
 for(const patch of [{employeeId:'joris'},{ownerId:'owner'},{workspaceId:workspace.id},{version:2},{revision:0}]){const h=harness();assert.equal((await h.service.create({...input,employeePreparation:{...reference,...patch}},ctx)).status,'invalid_request');assert.equal(h.writes,0);}
 for(const change of [h=>h.profile.state='archived',h=>h.profile.revision=2,h=>h.profile.ownerId='other',h=>h.profile.workspaceId='other',h=>h.profile.ventureId='other']){const h=harness();change(h);assert.equal((await h.service.create(input,ctx)).status,'conflict');assert.equal(h.writes,0);}
 for(const [request,context] of [[{...input,employeePreparation:{...reference,ventureId:'foreign'}},ctx],[input,{...ctx,actorId:'other'}],[input,{...ctx,workspaceId:'foreign'}]]){const h=harness();assert.equal((await h.service.create(request,context)).status,'conflict');assert.equal(h.writes,0);}
});
test('real closed directory flag and unavailable durable sources never qualify or write',async()=>{
 const h=harness();const service=createDevelopmentService({enabled:()=>true,store:()=>h.store});assert.equal((await service.create(input,ctx)).status,'disabled');assert.equal(h.writes,0);
 const verify=createEmployeePreparationVerifier({enabled:()=>true,durable:()=>false,store:()=>{throw Error('must not open')}});assert.equal(await verify(reference,ctx),'unavailable');
});
test('lost ACK replays and looks up historical provenance after profile archived without another write',async()=>{
 const h=harness(),save=h.store.save;h.store.save=async mission=>{await save(mission);throw Error('ACK lost')};assert.equal((await h.service.create(input,ctx)).status,'outcome_unknown');h.profile.state='archived';h.profile.revision=2;
 const receipt=await h.service.lookup(input.requestId,ctx.workspaceId,ctx);assert.equal(receipt.status,'saved');assert.deepEqual(receipt.employeePreparation,reference);assert.equal((await h.service.create(input,ctx)).status,'saved');assert.equal(h.writes,1);assert.equal(h.reads,1);assert.equal(h.rows.size,1);
 assert.equal((await h.service.lookup(input.requestId,ctx.workspaceId,{...ctx,actorId:'other'})).status,'conflict');assert.equal((await h.service.lookup(input.requestId,ctx.workspaceId)).status,'conflict');
 assert.equal((await h.service.create({...input,requestId:'22345678-1234-4234-8234-123456789abc'},ctx)).status,'conflict');assert.equal(h.writes,1);
});
test('same key changed provenance or body conflicts; tampered stored provenance rejected on lookup',async()=>{
 const h=harness();const saved=await h.service.create(input,ctx);
 for(const employeePreparation of [{...reference,revision:2},{...reference,ventureId:'other'},{...reference,employeeId:'emp_22345678-1234-4234-8234-123456789abc'}])assert.equal((await h.service.create({...input,employeePreparation},ctx)).status,'conflict');
 assert.equal((await h.service.create({...input,title:'changed'},ctx)).status,'conflict');assert.equal(h.writes,1);
 h.rows.get(saved.missionId).input.employeePreparation.revision=9;assert.equal((await h.service.lookup(input.requestId,ctx.workspaceId,ctx)).status,'conflict');assert.equal((await h.service.create(input,ctx)).status,'conflict');
});
test('legacy v1 hash and receipt stay unchanged and require no employee resolution',async()=>{
 const h=harness();const {employeePreparation:_,...legacy}=input;const receipt=await h.service.create(legacy,ctx);assert.equal(receipt.status,'saved');assert.ok(!('employeePreparation' in receipt));assert.equal(h.reads,0);const mission=h.rows.get(receipt.missionId);assert.equal(mission.input.development.version,1);
 assert.equal(mission.input.development.payloadHash,createHash('sha256').update(JSON.stringify([legacy.title,legacy.objective,legacy.scope,legacy.acceptanceCriteria,ctx.modeId,ctx.actorId])).digest('hex'));
 assert.equal((await h.service.lookup(input.requestId,ctx.workspaceId)).status,'saved');assert.equal((await h.service.create(legacy,ctx)).status,'saved');
});
test('GET forwards authenticated actor and mode for v2 receipt isolation',async()=>{
 const h=harness();await h.service.create(input,ctx);let actorId='owner';const handlers=createDevelopmentHandlers({authenticate:async()=>({actorId}),context:()=>ctx,publicOrigin:()=>undefined,create:h.service.create,lookup:h.service.lookup});
 const request=()=>new Request('http://localhost/api/missions/development?requestId='+input.requestId);
 assert.equal((await (await handlers.GET(request())).json()).status,'saved');actorId='other';assert.equal((await (await handlers.GET(request())).json()).status,'conflict');
});
test('transport preserves receipt provenance and rejects malformed references',async()=>{
 const h=harness();const receipt=await h.service.create(input,ctx);
 const request=body=>performDevelopmentRequest({method:'GET',requestId:input.requestId,payload:null,fetchImpl:async()=>Response.json(body)});
 assert.deepEqual((await request(receipt)).employeePreparation,reference);assert.equal((await request({...receipt,employeePreparation:{...reference,employeeId:'joris'}})).status,'unavailable');
});

test('simultaneous same-key preparations converge on one row and changed provenance conflicts',async()=>{
 const h=harness();const results=await Promise.all([h.service.create(input,ctx),h.service.create(input,ctx)]);assert.deepEqual(results.map(r=>r.status),['saved','saved']);assert.equal(results[0].missionId,results[1].missionId);assert.equal(h.rows.size,1);
 // The fixture models insert-or-ignore only, not PostgreSQL transaction isolation.
 assert.equal((await h.service.create({...input,employeePreparation:{...reference,revision:2}},ctx)).status,'conflict');assert.equal(h.rows.size,1);
});
test('server projection suppresses corrupted or foreign provenance without changing the mission',async()=>{
 const {projectDevelopmentMission}=await jiti.import('./development-mission.ts');const h=harness();const receipt=await h.service.create(input,ctx);const mission=h.rows.get(receipt.missionId);
 assert.deepEqual(missionDossierSummary(projectDevelopmentMission(mission,ctx)).employeePreparation,reference);
 for(const context of [{...ctx,actorId:'other'},{...ctx,modeId:'other'}])assert.equal(missionDossierSummary(projectDevelopmentMission(mission,context)).employeePreparation,null);
 const corrupt=structuredClone(mission);corrupt.input.employeePreparation.revision=2;const projected=projectDevelopmentMission(corrupt,ctx);assert.equal(missionDossierSummary(projected).employeePreparation,null);assert.equal(corrupt.input.employeePreparation.revision,2);assert.equal(projected.id,mission.id);
});
test('linked form remounts for employee, revision, business and workspace changes; v1 key survives',async()=>{
 const React=await import('react');globalThis.React=React;
 const componentJiti=createJiti(import.meta.url,{jsx:true,alias:{'@':path.join(process.cwd(),'src'),'next/navigation':path.join(process.cwd(),'src/__server-only-noop.js')}});
 const {DevelopmentMissionForm}=await componentJiti.import('../../features/missions/components/development-mission-form.tsx');
 const linked=DevelopmentMissionForm({workspaceId:ctx.workspaceId,employeePreparation:reference});assert.deepEqual(linked.props.employeePreparation,reference);
 for(const employeePreparation of [{...reference,revision:2},{...reference,ventureId:'other'},{...reference,employeeId:'emp_22345678-1234-4234-8234-123456789abc'}])assert.notEqual(DevelopmentMissionForm({workspaceId:ctx.workspaceId,employeePreparation}).key,linked.key);
 assert.notEqual(DevelopmentMissionForm({workspaceId:'other',employeePreparation:reference}).key,linked.key);assert.equal(DevelopmentMissionForm({workspaceId:ctx.workspaceId}).key,ctx.workspaceId);
});

test('lost ACK remains resumable from generic or revised profile entry before a new intention',async()=>{
 const {developmentMissionTrackingKey,planIntent}=await jiti.import('../../features/missions/development-mission-session.ts');
 const h=harness(),save=h.store.save;h.store.save=async mission=>{await save(mission);throw Error('ACK lost')};const session=new Map([[developmentMissionTrackingKey(ctx.workspaceId),input.requestId]]);
 assert.equal((await h.service.create(input,ctx)).status,'outcome_unknown');h.profile.revision=2;h.profile.state='archived';
 for(const referenceOnReturn of [undefined,{...reference,revision:2}]){
  const pending=session.get(developmentMissionTrackingKey(ctx.workspaceId));const state={tracking:'ok',activeRequestId:null,pendingRequestId:pending,releasedRequestId:null,hasFrozenPayload:false,inputComplete:true};
  assert.equal(planIntent(state,'create').reason,'resume-decision-required');const plan=planIntent(state,'read-pending');assert.equal(plan.kind,'read');const receipt=await h.service.lookup(plan.requestId,ctx.workspaceId,ctx);assert.equal(receipt.status,'saved');assert.deepEqual(receipt.employeePreparation,reference);assert.notDeepEqual(receipt.employeePreparation,referenceOnReturn);
  const newPlan=planIntent({...state,pendingRequestId:null,releasedRequestId:pending},'create');assert.equal(newPlan.kind,'create');
 }
 assert.equal(h.writes,1);
 // The actual form must consume this shared key, not its narrower unsent-draft scope.
 const {readFile}=await import('node:fs/promises');const source=await readFile(new URL('../../features/missions/components/development-mission-form.tsx',import.meta.url),'utf8');assert.match(source,/const key=developmentMissionTrackingKey\(workspaceId\)/);
});

test('tab marker prevents unknown old employee payload from being retried via generic or changed profile form',async()=>{
 const {retainEmployeePreparationIntent,requiresEmployeePreparationRestart}=await jiti.import('../../features/missions/development-mission-session.ts');const values=new Map();const storage={setItem:(key,value)=>values.set(key,value),getItem:key=>values.get(key)??null};
 retainEmployeePreparationIntent(storage,ctx.workspaceId,input.requestId);
 assert.equal(requiresEmployeePreparationRestart(storage,ctx.workspaceId,input.requestId,false,false),true);
 assert.equal(requiresEmployeePreparationRestart(storage,ctx.workspaceId,input.requestId,true,false),true);
 assert.equal(requiresEmployeePreparationRestart(storage,ctx.workspaceId,input.requestId,true,true),false);
 assert.equal(requiresEmployeePreparationRestart(storage,ctx.workspaceId,'legacy-id',false,false),false);
 assert.throws(()=>retainEmployeePreparationIntent({setItem(){throw Error('blocked')}},ctx.workspaceId,input.requestId));
 assert.throws(()=>requiresEmployeePreparationRestart({getItem(){throw Error('blocked')}},ctx.workspaceId,input.requestId,false,false));
 // Markers never affect read plans; a previously saved receipt is still recoverable.
 const {planIntent}=await jiti.import('../../features/missions/development-mission-session.ts');assert.equal(planIntent({tracking:'unavailable',activeRequestId:input.requestId,pendingRequestId:null,releasedRequestId:null,hasFrozenPayload:false,inputComplete:false},'read-active').kind,'read');
});

test('recovered not_found can be explicitly set aside while old receipt remains readable and retry is not reopened',async()=>{
 const {releaseRecoveredDevelopmentRequest,planIntent,retainEmployeePreparationIntent,requiresEmployeePreparationRestart}=await jiti.import('../../features/missions/development-mission-session.ts');
 const state={tracking:'ok',activeRequestId:input.requestId,pendingRequestId:null,releasedRequestId:null,hasFrozenPayload:false,inputComplete:true};
 const released=releaseRecoveredDevelopmentRequest({...state,busy:false});assert.equal(released.releasedRequestId,input.requestId);
 const next={...state,...released};assert.equal(planIntent(next,'create').kind,'create');assert.deepEqual(planIntent(next,'read-released'),{kind:'read',requestId:input.requestId});assert.equal(planIntent(next,'retry').kind,'refused');
 assert.equal(releaseRecoveredDevelopmentRequest({...state,hasFrozenPayload:true,busy:false}),null);assert.equal(releaseRecoveredDevelopmentRequest({...state,busy:true}),null);
 const rows=new Map(),storage={setItem:(key,value)=>rows.set(key,value),getItem:key=>rows.get(key)??null};retainEmployeePreparationIntent(storage,ctx.workspaceId,input.requestId);assert.equal(requiresEmployeePreparationRestart(storage,ctx.workspaceId,input.requestId,false,false),true);
 const {readFile}=await import('node:fs/promises');const source=await readFile(new URL('../../features/missions/components/development-mission-form.tsx',import.meta.url),'utf8');assert.match(source,/Mettre cette demande de côté et préparer une nouvelle mission/);assert.match(source,/releasedRequestId:s\.releasedRequestId/);
});
