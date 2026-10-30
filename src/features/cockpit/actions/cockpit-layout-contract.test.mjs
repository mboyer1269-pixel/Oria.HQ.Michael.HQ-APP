import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { createJiti } from "jiti";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-action-di-'));
// Dependency replacements exist only in this test's temp directory, never a production auth flag.
fs.writeFileSync(path.join(dir,'owner.mjs'), `export async function requireOwnerAccess(p){globalThis.__cockpitActionFixture.calls.push(['owner',p]);if(globalThis.__cockpitActionFixture.authError)throw globalThis.__cockpitActionFixture.authError;return globalThis.__cockpitActionFixture.access;}`);
fs.writeFileSync(path.join(dir,'admin.mjs'), `export function createOptionalSupabaseAdminClient(){globalThis.__cockpitActionFixture.calls.push(['client']);if(globalThis.__cockpitActionFixture.clientError)throw Error('private setup detail');return globalThis.__cockpitActionFixture.client;}`);
fs.writeFileSync(path.join(dir,'store.mjs'), `export function createCockpitLayoutPersistence(c,id){globalThis.__cockpitActionFixture.calls.push(['store',c,id]);return {read:async()=>{globalThis.__cockpitActionFixture.calls.push(['read']);return globalThis.__cockpitActionFixture.read},save:async(q)=>{globalThis.__cockpitActionFixture.calls.push(['save',q]);return globalThis.__cockpitActionFixture.save}}}`);
const jiti = createJiti(import.meta.url, { fsCache: false, alias: {
  '@/server/auth/owner': path.join(dir,'owner.mjs'), '@/server/supabase/admin': path.join(dir,'admin.mjs'), '@/server/cockpit/layout-persistence': path.join(dir,'store.mjs'), '@': path.join(process.cwd(),'src'),
} });
const action = await jiti.import('./cockpit-layout.ts');
function setup() { return globalThis.__cockpitActionFixture={calls:[],access:{status:'authorized',user:{id:'server-owner'}},client:{fixture:true},read:{status:'missing',order:[],revision:null},save:{status:'unconfirmed'}}; }

test('each action calls owner gate itself and derives identity only from returned session',async()=>{
  let f=setup();assert.deepEqual(await action.getCockpitLayout(),f.read);assert.deepEqual(f.calls.map(c=>c[0]),['owner','client','store','read']);assert.equal(f.calls[2][2],'server-owner');
  f=setup();const request={order:[],expectedRevision:null};assert.deepEqual(await action.saveCockpitLayout(request),{status:'unconfirmed'});assert.deepEqual(f.calls.map(c=>c[0]),['owner','client','store','save']);assert.equal(f.calls[2][2],'server-owner');assert.equal(f.calls[3][1],request);
});
test('forbidden owner never creates a service-role client or dispatches a repository call',async()=>{
  const f=setup();f.access.status='forbidden';assert.deepEqual(await action.getCockpitLayout(),{status:'forbidden'});assert.deepEqual(await action.saveCockpitLayout({}),{status:'not_attempted',reason:'forbidden'});assert.deepEqual(f.calls.map(c=>c[0]),['owner','owner']);
});
test('unauthenticated redirect/auth exception propagates, never disguised as a successful layout',async()=>{
  const f=setup();f.authError=Error('synthetic redirect');await assert.rejects(()=>action.getCockpitLayout(),/synthetic redirect/);await assert.rejects(()=>action.saveCockpitLayout({}),/synthetic redirect/);assert.deepEqual(f.calls.map(c=>c[0]),['owner','owner']);
});
test('client initialization failure is pre-dispatch no-effect without raw error exposure',async()=>{
  const f=setup();f.clientError=true;assert.deepEqual(await action.getCockpitLayout(),{status:'unavailable'});assert.deepEqual(await action.saveCockpitLayout({}),{status:'not_attempted',reason:'unavailable'});assert.ok(!f.calls.some(c=>c[0]==='store'));
});
