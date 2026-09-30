import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {createJiti} from 'jiti';
const jiti=createJiti(import.meta.url,{alias:{'@':path.join(process.cwd(),'src'),'server-only':path.join(process.cwd(),'src/scripts/smoke/server-only-stub.mjs')}});
const {createOpenHandsHandler}=await jiti.import('./handler.ts');
const body={action:'confirm',missionId:'4143a0f1-a67c-4d1c-8646-12577d6ad4c8',expectedUpdatedAt:'2026-09-30T00:00:00Z',commitSha:'a'.repeat(40),executorVersion:'1.2.3',budget:{maxCostCents:1,maxTokens:10,maxIterations:1,timeoutSeconds:10},expectedPayloadHash:'b'.repeat(64),confirm:true};
const request=(data=body,origin='https://hq.example')=>new Request('http://internal/api/orchestration/openhands',{method:'POST',headers:{origin,'content-type':'application/json','x-forwarded-host':'forged.invalid'},body:JSON.stringify(data)});
function fixture(overrides={}){let auth=0;const calls=[];return {calls,auth:()=>auth,handler:createOpenHandsHandler({authenticate:async()=>{auth++;return {actorId:'actual-session-owner'};},enabled:()=>true,workspaceId:()=> 'server-workspace',publicOrigin:()=> 'https://hq.example',service:async(...args)=>{calls.push(args);return {status:'reserved',externalEffectAllowed:false};},...overrides})};}

test('launch uses server context, explicit hash, and refuses client executor configuration',async()=>{
 const calls=[];const f=fixture({launch:async(...args)=>{calls.push(args);return {status:'claimed',externalEffectAllowed:false};}});
 const launch={action:'confirm_launch',missionId:body.missionId,confirm:true,expectedLaunchHash:'c'.repeat(64)};
 assert.equal((await f.handler(request(launch))).status,200);
 assert.deepEqual(calls[0],[{actorId:'actual-session-owner',workspaceId:'server-workspace'},body.missionId,{confirm:true,expectedLaunchHash:'c'.repeat(64)}]);
 for(const patch of [{config:{}},{runnerId:'foreign'},{workspaceId:'foreign'},{confirm:false},{expectedLaunchHash:undefined}]) {
  assert.equal((await f.handler(request({...launch,...patch}))).status,400);
 }
 assert.equal(calls.length,1);assert.equal(f.calls.length,0);
 assert.equal((await f.handler(request({action:'prepare_launch',missionId:body.missionId}))).status,200);
 assert.equal(calls[1][2],undefined);
 assert.equal((await fixture().handler(request(launch))).status,503);
 const failed=fixture({launch:async()=>{throw Error('private details');}});
 const response=await failed.handler(request(launch));assert.equal(response.status,503);
 assert.deepEqual(await response.json(),{status:'reconciliation_required',externalEffectAllowed:false});
});
test('session identity and workspace come only from server; single auth lookup and no-store',async()=>{const f=fixture();const r=await f.handler(request());assert.equal(r.status,200);assert.equal(f.auth(),1);assert.deepEqual(f.calls[0][0],{actorId:'actual-session-owner',workspaceId:'server-workspace'});assert.equal(f.calls[0][2].confirm,true);assert.ok(r.headers.get('cache-control').includes('no-store'));});
test('unauthenticated/nonowner/disabled blocked before writes',async()=>{for(const status of [401,403]){const f=fixture({authenticate:async()=>new Response(null,{status})});assert.equal((await f.handler(request())).status,status);assert.equal(f.calls.length,0);}const f=fixture({enabled:()=>false});assert.equal((await f.handler(request())).status,503);assert.equal(f.calls.length,0);});
test('strict origin behind proxy rejects forged origin and malformed configured origin',async()=>{for(const origin of ['https://evil.invalid','http://internal']){const f=fixture();assert.equal((await f.handler(request(body,origin))).status,403);assert.equal(f.calls.length,0);}const f=fixture({publicOrigin:()=> 'https://hq.example/path'});assert.equal((await f.handler(request())).status,403);});
test('client authority fields, missing explicit confirm/hash and oversized body rejected',async()=>{for(const patch of [{actorId:'forged'},{workspaceId:'foreign'},{reviewerId:'forged'},{confirm:false},{expectedPayloadHash:''},{extra:'x'.repeat(9000)}]){const f=fixture();assert.equal((await f.handler(request({...body,...patch}))).status,400);assert.equal(f.calls.length,0);}});
test('prepare does not supply a confirmation; conflict remains explicit',async()=>{const f=fixture();const {confirm,expectedPayloadHash,...rest}=body;void confirm;void expectedPayloadHash;assert.equal((await f.handler(request({...rest,action:'prepare'}))).status,200);assert.equal(f.calls[0][2],undefined);const conflict=fixture({service:async()=>({status:'dossier_changed',externalEffectAllowed:false})});assert.equal((await conflict.handler(request())).status,409);});

test('attachment uses authenticated identity and rejects browser namespace or credentials',async()=>{
 const {confirm,expectedPayloadHash,...rest}=body;void confirm;void expectedPayloadHash;
 const attachment={...rest,action:'attach_memory',projectId:'project-a'};let calls=0;
 const f=fixture({attachMemory:async(ctx,input)=>{calls++;assert.deepEqual(ctx,{workspaceId:'server-workspace',actorId:'actual-session-owner'});assert.equal(input.projectId,'project-a');assert.equal(input.action,undefined);return {status:'attached',externalEffectAllowed:false};}});
 assert.equal((await f.handler(request(attachment))).status,200);assert.equal(calls,1);assert.equal(f.calls.length,0);
 for(const patch of [{namespace:'org:foreign'},{endpoint:'https://evil.invalid/mcp'},{readHandle:'secret'},{actorId:'forged'}]) {
  assert.equal((await f.handler(request({...attachment,...patch}))).status,400);
 }
 assert.equal(calls,1);
 const uncertain=fixture({attachMemory:async()=>{throw Error('unknown write');}});
 const response=await uncertain.handler(request(attachment));assert.equal(response.status,503);assert.equal((await response.json()).status,'attachment_outcome_unknown');
});
