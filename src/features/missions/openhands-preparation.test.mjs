import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {createJiti} from 'jiti';import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime.js';
globalThis.React=React;
const jiti=createJiti(import.meta.url,{jsx:true,alias:{'@':path.join(process.cwd(),'src')}});
const {parseOpenHandsPending,requestOpenHands}=await jiti.import('./openhands-preparation.ts');
const {OpenHandsDossierReview,OpenHandsPreparation}=await jiti.import('./components/openhands-preparation.tsx');
const missionId='3e0ff835-52c6-439d-8c4f-9ab91fd403ab',date='2026-09-30T00:00:00Z',hash='b'.repeat(64);
const packet={version:1,workspaceId:'w',request:{missionId,expectedUpdatedAt:date,commitSha:'a'.repeat(40),executorVersion:'1.2.3',budget:{maxCostCents:10,maxTokens:100,maxIterations:1,timeoutSeconds:60}},expectedPayloadHash:hash};
const dossier={contractVersion:1,executor:'openhands',executorVersion:'1.2.3',mission:{id:missionId,workspaceId:'w',modeId:'hq',version:date,title:'Synthetic',objective:'A',scope:'Only file A',acceptanceCriteria:'<script>alert(1)</script>',expectedOutput:'Test evidence',createdBy:'owner'},source:{commitSha:'a'.repeat(40),commitVerification:'not_verified'},budget:packet.request.budget,approvalRequired:true,executionRequested:false,idempotencyKey:'hq-openhands-v1-'+hash,payloadHash:hash};
const receipt={version:1,reservationId:missionId,state:'audit_recorded',workspaceId:'w',missionId,missionVersion:date,idempotencyKey:dossier.idempotencyKey,payloadHash:hash,authorizationId:missionId,actorId:'owner',reservedAt:date,authorizationExpiresAt:'2026-09-30T00:10:00Z',auditId:'ledger-id'};
const json=(value,status=200)=>Response.json(value,{status});
test('pending recovery is strictly bounded, workspace/mission bound and frozen; malformed session cannot unlock a new intent',()=>{
 const p=parseOpenHandsPending(JSON.stringify(packet),'w',missionId);assert.deepEqual(p,packet);assert.throws(()=>{p.request.budget.maxTokens=2;},TypeError);assert.equal(parseOpenHandsPending(null,'w',missionId),null);
 for(const raw of ['{',JSON.stringify({...packet,version:2}),JSON.stringify({...packet,extra:true}),JSON.stringify({...packet,expectedPayloadHash:'bad'}),'x'.repeat(5000)])assert.throws(()=>parseOpenHandsPending(raw,'w',missionId));
 assert.throws(()=>parseOpenHandsPending(JSON.stringify(packet),'foreign',missionId));
});
test('preparation validates all reviewed fields against request and freezes snapshot; rejects unsupported additions',async()=>{
 const response=()=>json({status:'prepared',dossier,externalEffectAllowed:false});const r=await requestOpenHands('prepare',packet,response);assert.equal(r.kind,'prepared');assert.throws(()=>{r.dossier.mission.scope='changed';},TypeError);
 for(const d of [{...dossier,mission:{...dossier.mission,workspaceId:'foreign'}},{...dossier,budget:{...dossier.budget,maxTokens:101}},{...dossier,unknownPermission:true},{...dossier,executionRequested:true}])assert.equal((await requestOpenHands('prepare',packet,()=>json({status:'prepared',dossier:d,externalEffectAllowed:false}))).kind,'blocked');
 assert.equal((await requestOpenHands('confirm',packet,response)).kind,'uncertain');
});
test('confirmation posts displayed hash and frozen parameters once, never follows ambiguity with another submit',async()=>{
 let calls=0;const r=await requestOpenHands('confirm',packet,async(url,init)=>{calls++;assert.equal(url,'/api/orchestration/openhands');const body=JSON.parse(init.body);assert.equal(body.expectedPayloadHash,hash);assert.equal(body.confirm,true);assert.deepEqual(body.budget,packet.request.budget);throw Error('lost response');});assert.equal(r.kind,'uncertain');assert.equal(calls,1);
 let action;await requestOpenHands('prepare',packet,async(url,init)=>{action=JSON.parse(init.body);return json({status:'reconciliation_required',externalEffectAllowed:false},409);});assert.equal(action.action,'prepare');assert.equal(action.confirm,undefined);
});
test('only bound audited receipt is accepted, malformed or foreign successful response stays uncertain',async()=>{
 assert.equal((await requestOpenHands('confirm',packet,()=>json({status:'reserved',receipt,externalEffectAllowed:false}))).kind,'reserved');
 for(const r of [{...receipt,workspaceId:'foreign'},{...receipt,payloadHash:'a'.repeat(64)},{...receipt,auditId:undefined},{...receipt,version:2}])assert.equal((await requestOpenHands('confirm',packet,()=>json({status:'reserved',receipt:r,externalEffectAllowed:false}))).kind,'uncertain');
 assert.equal((await requestOpenHands('confirm',packet,()=>json({status:'authorization_outcome_unknown'},503))).kind,'uncertain');
 assert.equal((await requestOpenHands('confirm',packet,()=>new Response('x'.repeat(70000),{headers:{'content-type':'application/json'}}))).kind,'uncertain');
});
test('actual rendered review escapes content and exposes scope, criteria, budget caveat',()=>{
 const html=renderToStaticMarkup(React.createElement(OpenHandsDossierReview,{dossier}));assert.ok(html.includes('Only file A'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('leur application par l’exécuteur n’est pas garantie'));assert.ok(html.includes(hash));assert.ok(html.includes('Aucun agent ne sera lancé'));

});

test('memory dossier requires v2, preserves exact context, and renders it as escaped data',async()=>{
 const content='<script>untrusted source</script>';
 const memory={contractVersion:1,sourceTool:'agentmemory_context_pack',workspaceId:'w',projectId:'project-a',namespace:'org:project-a',centerEntityId:'anchor',retrievedAtIso:date,content,contentChars:content.length,redactionsApplied:0,snapshotHash:hash};
 const d={...dossier,contractVersion:2,memory};
 const r=await requestOpenHands('prepare',packet,()=>json({status:'prepared',dossier:d,externalEffectAllowed:false}));
 assert.equal(r.kind,'prepared');assert.ok(Object.isFrozen(r.dossier.memory));assert.equal(r.dossier.memory.content,content);
 const html=renderToStaticMarkup(React.createElement(OpenHandsDossierReview,{dossier:r.dossier}));
 assert.ok(html.includes('Mémoire du projet'));assert.ok(html.includes('&lt;script&gt;untrusted source'));assert.ok(!html.includes('<script>'));
 for(const invalid of [{...d,contractVersion:1},{...d,memory:undefined},{...d,memory:{...memory,workspaceId:'foreign'}},{...d,memory:{...memory,contentChars:1}}]) {
  assert.equal((await requestOpenHands('prepare',packet,()=>json({status:'prepared',dossier:invalid,externalEffectAllowed:false}))).kind,'blocked');
 }
});

test('only recognized pre-effect failure permits a new preparation; ambiguous/conflict remain locked',async()=>{
 const stale=await requestOpenHands('confirm',packet,()=>json({status:'stale_version'},409));assert.equal(stale.canPrepareAgain,true);
 for(const [status,code] of [['conflict',409],['authorization_outcome_unknown',503],['stale_version',500]])assert.notEqual((await requestOpenHands('confirm',packet,()=>json({status},code))).canPrepareAgain,true);
});

test('disabled server flag renders no submission inputs or buttons',()=>{
 const html=renderToStaticMarkup(React.createElement(AppRouterContext.Provider,{value:{refresh(){}}},React.createElement(OpenHandsPreparation,{mission:{id:missionId,workspaceId:'w',input:{}},source:'supabase',enabled:false})));
 assert.ok(html.includes('sur le serveur.'));assert.ok(!html.includes('<button'));assert.ok(!html.includes('<input'));
});
