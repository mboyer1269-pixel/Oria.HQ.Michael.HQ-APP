import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createJiti} from 'jiti';
test('tool route authenticates, checks origin and blocks invalid launch before inbox access',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'hq-route-'));
 const previous=process.env.ORIA_ENABLE_OPENHANDS_TOOL_REVIEW;
 const previousOrigin=process.env.ORIA_HQ_PUBLIC_ORIGIN;
 const state={user:null,owner:false,calls:0};globalThis.__hqToolRouteTest=state;
 try{
  await writeFile(path.join(directory,'owner.mjs'),`export async function getCurrentAuthUser(){return globalThis.__hqToolRouteTest.user} export function isOwnerUser(){return globalThis.__hqToolRouteTest.owner}`);
  await writeFile(path.join(directory,'workspace.mjs'),`export function getActiveWorkspaceContext(){return {workspace:{id:'w'}}}`);
  await writeFile(path.join(directory,'inbox.mjs'),`export function createOpenHandsToolInbox(){globalThis.__hqToolRouteTest.calls++;return {list:async()=>({status:'ready',items:[]}),decide:async()=>({status:'recorded'})}}`);
  const jiti=createJiti(import.meta.url,{moduleCache:false,alias:{
   '@/server/auth/owner':path.join(directory,'owner.mjs'),
   '@/core/workspace-context':path.join(directory,'workspace.mjs'),
   '@/server/missions/openhands-tool-inbox':path.join(directory,'inbox.mjs'),
  }});
  const {GET,POST}=await jiti.import('../../app/api/orchestration/openhands/tools/[launchId]/route.ts');
  const context={params:Promise.resolve({launchId:'11111111-1111-4111-8111-111111111111'})};
  const url='http://localhost/api/orchestration/openhands/tools/'+(await context.params).launchId;
  assert.equal((await GET(new Request(url),context)).status,401);
  state.user={id:'o'};assert.equal((await GET(new Request(url),context)).status,403);
  state.owner=true;delete process.env.ORIA_ENABLE_OPENHANDS_TOOL_REVIEW;
  assert.equal((await GET(new Request(url),context)).status,503);
  process.env.ORIA_ENABLE_OPENHANDS_TOOL_REVIEW='1';process.env.ORIA_HQ_PUBLIC_ORIGIN='http://localhost';
  assert.equal((await POST(new Request(url,{method:'POST',headers:{origin:'http://foreign','content-type':'application/json'},body:'{}'}),context)).status,403);
  assert.equal((await GET(new Request(url),{params:Promise.resolve({launchId:'../bad'})})).status,400);
  assert.equal(state.calls,0);
  const response=await GET(new Request(url),context);assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(state.calls,1);
 }finally{
  if(previous===undefined)delete process.env.ORIA_ENABLE_OPENHANDS_TOOL_REVIEW;else process.env.ORIA_ENABLE_OPENHANDS_TOOL_REVIEW=previous;
  if(previousOrigin===undefined)delete process.env.ORIA_HQ_PUBLIC_ORIGIN;else process.env.ORIA_HQ_PUBLIC_ORIGIN=previousOrigin;
  delete globalThis.__hqToolRouteTest;await rm(directory,{recursive:true,force:true});
 }
});
