import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createJiti } from 'jiti';
// Synthetic transport for the REAL adapter: no session, network or PostgreSQL.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'oria-names-adapter-'));
fs.writeFileSync(path.join(dir,'client.ts'),'export const createServerSupabaseClient = async () => globalThis.__nameAdapterTestDb;');
const jiti=createJiti(import.meta.url,{alias:{'@':path.resolve('src'),'@/lib/supabase/server':path.join(dir,'client.ts'),'server-only':path.resolve('src/scripts/smoke/server-only-stub.mjs')}});
const {createAgentNameStore}=await jiti.import('./supabase-store.ts');
const scope={ownerId:'owner-a',workspaceId:'w-a'},row={user_id:'owner-a',workspace_id:'w-a',agent_id:'joris',display_name:'Bob'};
function fake(responses){const calls=[];return {calls,from(table){const chain={};calls.push(['from',table]);for(const method of ['select','eq','update','insert','delete','single','maybeSingle'])chain[method]=(...args)=>{calls.push([method,...args]);return chain;};chain.then=(yes,no)=>Promise.resolve(responses.shift()??{data:[],error:null}).then(yes,no);return chain;}}}
test('read uses authenticated client and exact owner/workspace filters',async()=>{
 const db=fake([{data:[row],error:null}]);globalThis.__nameAdapterTestDb=db;assert.deepEqual(await (await createAgentNameStore()).read(scope),[row]);assert.deepEqual(db.calls,[['from','agent_display_names'],['select','user_id,workspace_id,agent_id,display_name'],['eq','user_id','owner-a'],['eq','workspace_id','w-a']]);
});
test('update mutates display_name only and validates returned identity',async()=>{
 const db=fake([{data:row,error:null}]);globalThis.__nameAdapterTestDb=db;await(await createAgentNameStore()).write(scope,'joris','Bob');assert.deepEqual(db.calls.find(c=>c[0]==='update'),['update',{display_name:'Bob'}]);assert.ok(db.calls.some(c=>c[0]==='eq'&&c[1]==='agent_id'&&c[2]==='joris'));
 globalThis.__nameAdapterTestDb=fake([{data:{...row,user_id:'foreign'},error:null}]);await assert.rejects((await createAgentNameStore()).write(scope,'joris','Bob'));
});
test('first write inserts scoped row; insert error never acknowledged',async()=>{
 const db=fake([{data:null,error:null},{data:row,error:null}]);globalThis.__nameAdapterTestDb=db;await(await createAgentNameStore()).write(scope,'joris','Bob');assert.deepEqual(db.calls.find(c=>c[0]==='insert'),['insert',row]);
 globalThis.__nameAdapterTestDb=fake([{data:null,error:null},{data:null,error:{message:'missing table'}}]);await assert.rejects((await createAgentNameStore()).write(scope,'joris','Bob'));
});
test('reset deletes only scoped override, never default registry or identity',async()=>{
 const db=fake([{error:null},{data:null,error:null}]);globalThis.__nameAdapterTestDb=db;await(await createAgentNameStore()).write(scope,'joris',null);assert.deepEqual(db.calls,[['from','agent_display_names'],['delete'],['eq','user_id','owner-a'],['eq','workspace_id','w-a'],['eq','agent_id','joris'],['from','agent_display_names'],['select','agent_id'],['eq','user_id','owner-a'],['eq','workspace_id','w-a'],['eq','agent_id','joris'],['maybeSingle']]);
 globalThis.__nameAdapterTestDb=fake([{error:null},{data:{agent_id:'joris'},error:null}]);await assert.rejects((await createAgentNameStore()).write(scope,'joris',null));
});
