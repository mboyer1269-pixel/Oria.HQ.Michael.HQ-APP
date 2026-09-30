import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

test('approval records the session actor, never the configured owner, and refuses a missing actor', async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'hq-memory-actor-'));
  const previous=process.env.NODE_ENV;
  try {
    await writeFile(path.join(directory,'auth.mjs'),'export const requireOwnerApiSession=async()=>null; export const getAuthenticatedActorId=async()=>globalThis.__memoryActorFixture;');
    await writeFile(path.join(directory,'workspace.mjs'),"export const getActiveWorkspaceContext=()=>({userId:'configured-owner',workspace:{id:'actor-fixture'}});");
    await writeFile(path.join(directory,'repository.mjs'),'export const approveMemoryVaultEntry=(input)=>{globalThis.__memoryApprovalFixture=input;return {ok:true,entry:input}}; export const proposeMemoryVaultEntry=()=>{throw Error("unexpected propose")}; export const rejectMemoryVaultEntry=()=>{throw Error("unexpected reject")};');
    const jiti=createJiti(import.meta.url,{moduleCache:false,fsCache:false,alias:{
      '@/server/auth/owner':path.join(directory,'auth.mjs'),
      '@/core/workspace-context':path.join(directory,'workspace.mjs'),
      '@/server/memory/memory-vault-repository':path.join(directory,'repository.mjs'),
      '@':path.resolve('src'),
    }});
    const {POST}=await jiti.import(path.resolve('src/app/api/memory/route.ts'));
    process.env.NODE_ENV='test';
    const request=()=>new Request('http://localhost/api/memory',{method:'POST',body:JSON.stringify({action:'approve',id:'entry',approvedBy:'forged-client',workspaceId:'forged-workspace'})});
    globalThis.__memoryActorFixture='authenticated-owner';
    assert.equal((await POST(request())).status,200);
    assert.deepEqual(globalThis.__memoryApprovalFixture,{entryId:'entry',workspaceId:'actor-fixture',approvedBy:'authenticated-owner'});
    delete globalThis.__memoryApprovalFixture;
    globalThis.__memoryActorFixture=null;
    assert.equal((await POST(request())).status,401);
    assert.equal(globalThis.__memoryApprovalFixture,undefined);
  } finally {
    delete globalThis.__memoryActorFixture;delete globalThis.__memoryApprovalFixture;
    if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;
    await rm(directory,{recursive:true,force:true});
  }
});
test('authenticated production memory writes fail before touching the ephemeral store', async()=>{
  const previous=process.env.NODE_ENV;
  const jiti=createJiti(import.meta.url,{alias:{'@':path.resolve('src'),'server-only':path.resolve('src/scripts/smoke/server-only-stub.mjs')}});
  const {POST}=await jiti.import(path.resolve('src/app/api/memory/route.ts'));
  globalThis.__ownerApiSessionTestResult=null;
  process.env.NODE_ENV='production';
  try {
    for(const action of ['propose','approve','reject']){
      const response=await POST(new Request('http://localhost/api/memory',{method:'POST',body:JSON.stringify({action,title:'Temporary',content:'Do not store',id:'fixture'})}));
      assert.equal(response.status,503);
      assert.equal((await response.json()).code,'memory_persistence_unavailable');
    }
    globalThis.__ownerApiSessionTestResult=new Response(null,{status:401});
    assert.equal((await POST(new Request('http://localhost/api/memory',{method:'POST'}))).status,401);
  } finally {delete globalThis.__ownerApiSessionTestResult;if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
});
