import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createJiti} from 'jiti';

test('recovery endpoint authenticates before access and forwards only canonical owner scope',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'hq-recovery-route-'));
 const state={user:null,owner:false,calls:[],result:{status:'ready'}};
 globalThis.__hqRecoveryRoute=state;
 try{
  await writeFile(path.join(directory,'owner.mjs'),`export async function getCurrentAuthUser(){return globalThis.__hqRecoveryRoute.user} export function isOwnerUser(){return globalThis.__hqRecoveryRoute.owner}`);
  await writeFile(path.join(directory,'workspace.mjs'),`export function getActiveWorkspaceContext(){return {workspace:{id:'canonical-workspace'}}}`);
  await writeFile(path.join(directory,'reader.mjs'),`export function createOpenHandsRecoveryReader(){return async(...args)=>{const state=globalThis.__hqRecoveryRoute;state.calls.push(args);if(state.fail)throw Error('private detail');return state.result}}`);
  const jiti=createJiti(import.meta.url,{moduleCache:false,alias:{'@/server/auth/owner':path.join(directory,'owner.mjs'),'@/core/workspace-context':path.join(directory,'workspace.mjs'),'@/server/missions/openhands-recovery':path.join(directory,'reader.mjs')}});
  const {GET}=await jiti.import('../../app/api/orchestration/openhands/recovery/[missionId]/route.ts');
  const id='11111111-1111-4111-8111-111111111111';
  const context={params:Promise.resolve({missionId:id})};
  const url='http://localhost/api/orchestration/openhands/recovery/'+id;
  assert.equal((await GET(new Request(url),context)).status,401);
  state.user={id:'owner'};assert.equal((await GET(new Request(url),context)).status,403);
  state.owner=true;
  assert.equal((await GET(new Request(url),{params:Promise.resolve({missionId:'../secret'})})).status,400);
  assert.equal((await GET(new Request(url+'?workspaceId=foreign'),context)).status,400);
  assert.equal(state.calls.length,0);
  const response=await GET(new Request(url),context);
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.deepEqual(state.calls,[[{actorId:'owner',workspaceId:'canonical-workspace'},id]]);
  state.result={status:'not_found'};assert.equal((await GET(new Request(url),context)).status,404);
  state.fail=true;const unavailable=await GET(new Request(url),context);
  assert.equal(unavailable.status,503);assert.deepEqual(await unavailable.json(),{status:'unavailable'});
 }finally{delete globalThis.__hqRecoveryRoute;await rm(directory,{recursive:true,force:true});}
});
