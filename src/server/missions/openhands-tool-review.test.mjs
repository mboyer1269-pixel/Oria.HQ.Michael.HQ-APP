import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createJiti} from 'jiti';
const jiti=createJiti(import.meta.url,{alias:{'@':path.join(process.cwd(),'src'),'server-only':path.join(process.cwd(),'src/scripts/smoke/server-only-stub.mjs')}});
const {createOpenHandsToolReview}=await jiti.import('./openhands-tool-review.ts');
const {bindToolPermission}=await jiti.import('./openhands-tool-permission.ts');
const now=Date.parse('2026-09-30T12:00:00Z');
const owner={workspaceId:'w',actorId:'owner'};
const request={version:1,workspaceId:'w',missionId:'11111111-1111-4111-8111-111111111111',launchId:'22222222-2222-4222-8222-222222222222',runnerId:'r',containerId:'a'.repeat(64),sessionId:'s',toolCallId:'c',inputJson:'{"command":"npm test"}',options:[{optionId:'once',kind:'allow_once'}],requestedAt:new Date(now).toISOString(),expiresAt:new Date(now+20000).toISOString()};
const selection={requestId:'33333333-3333-4333-8333-333333333333',expectedRequestHash:bindToolPermission(request,now).requestHash,optionId:'once'};

test('review uses host request/config and owner scope, never browser arguments',async()=>{
 let seen;const config={trusted:true};
 const review=createOpenHandsToolReview({now:()=>now,loadPending:async(context,id)=>{
  assert.deepEqual(context,owner);assert.equal(id,selection.requestId);
  return {request,config,actorId:'owner',runnerId:'r'};
 },approve:async(...args)=>{seen=args;return {status:'recorded'};}});
 assert.equal((await review(owner,selection)).status,'recorded');
 assert.deepEqual(seen,[{...owner,runnerId:'r'},request,config,'once']);
 seen=null;
 assert.equal((await review(owner,{...selection,request:{command:'other'}})).status,'invalid_selection');
 assert.equal(seen,null);
});

test('changed, expired, foreign and missing requests cannot approve',async()=>{
 for(const patch of [null,{actorId:'other'},{request:{...request,inputJson:'{"command":"changed"}'}},
   {request:{...request,workspaceId:'other'}},{request:{...request,expiresAt:new Date(now).toISOString()}}]){
  let called=false;
  const review=createOpenHandsToolReview({now:()=>now,loadPending:async()=>patch===null?null:{request,config:{},actorId:'owner',runnerId:'r',...patch},approve:async()=>{called=true;return {status:'recorded'};}});
  assert.notEqual((await review(owner,selection)).status,'recorded');assert.equal(called,false);
 }
});
