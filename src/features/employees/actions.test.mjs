import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createJiti} from 'jiti';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'oria-employee-actions-'));
fs.writeFileSync(path.join(dir,'owner.ts'),'export async function requireOwnerAccess(){globalThis.__employeeAuthCalls++;if(globalThis.__employeeAuthThrows)throw Error("auth required");return globalThis.__employeeAccess;}');
fs.writeFileSync(path.join(dir,'store.ts'),'export function createEmployeeStore(){globalThis.__employeeStoreCalls++;return globalThis.__employeeStore;}');
fs.writeFileSync(path.join(dir,'ventures.ts'),'export function getVenturePersistenceMode(){return globalThis.__employeeMode;} export async function getVentureById(w,id){globalThis.__employeeVentureCalls.push([w,id]); return id==="a"?{id}:null;}');
fs.writeFileSync(path.join(dir,'flag.ts'),'export const EMPLOYEE_DIRECTORY_LIVE = true;');
const aliases={'@':path.resolve('src'),'@/server/auth/owner':path.join(dir,'owner.ts'),'@/server/employees/store':path.join(dir,'store.ts'),'@/server/ventures/venture-repository':path.join(dir,'ventures.ts')};
const closed=await createJiti(import.meta.url,{alias:aliases}).import('./actions.ts');
// Test-only module replacement: no production flag switch or test hook exists.
const open=await createJiti(import.meta.url,{alias:{...aliases,'@/server/employees/flag':path.join(dir,'flag.ts')},moduleCache:false}).import('./actions.ts');
const input={operation:'create',creationKey:'11111111-1111-4111-8111-111111111111',displayName:'Bob',specialty:'Recherche',instructions:'Analyser',assignmentRole:'Analyste',assignmentContext:'Business A'};
function reset(){globalThis.__employeeAuthCalls=0;globalThis.__employeeStoreCalls=0;globalThis.__employeeVentureCalls=[];globalThis.__employeeAuthThrows=false;globalThis.__employeeAccess={status:'authorized',user:{id:'owner'}};globalThis.__employeeMode='supabase';globalThis.__employeeStore={list:async s=>{globalThis.__employeeSeenScope=s;return []}};}
test('closed real flag prevents adapter creation and venture access, never saved',async()=>{reset();assert.equal((await closed.readEmployeesAction('a')).status,'unavailable');assert.equal((await closed.saveEmployeeAction('a',input)).status,'unavailable');assert.equal(globalThis.__employeeStoreCalls,0);assert.equal(globalThis.__employeeVentureCalls.length,0);});
test('auth rejection and missing session precede storage',async()=>{reset();globalThis.__employeeAccess={status:'forbidden',user:{id:'other'}};assert.equal((await open.readEmployeesAction('a')).status,'forbidden');assert.equal((await open.saveEmployeeAction('a',input)).status,'forbidden');assert.equal(globalThis.__employeeStoreCalls,0);globalThis.__employeeAuthThrows=true;await assert.rejects(open.readEmployeesAction('a'));});
test('synthetic enabled action derives owner/workspace; missing venture and local persistence refuse',async()=>{reset();assert.equal((await open.readEmployeesAction('a')).status,'ready');assert.equal(globalThis.__employeeSeenScope.ownerId,'owner');assert.equal(globalThis.__employeeSeenScope.ventureId,'a');assert.equal(globalThis.__employeeSeenScope.workspaceId,globalThis.__employeeVentureCalls[0][0]);assert.equal((await open.readEmployeesAction('b')).status,'forbidden');globalThis.__employeeMode='local';assert.equal((await open.readEmployeesAction('a')).status,'unavailable');});
test('unknown fields, forged ownership and malformed venture rejected',async()=>{reset();for(const key of ['ownerId','workspaceId','runtimeId','tools'])assert.equal((await open.saveEmployeeAction('a',{...input,[key]:'foreign'})).status,'invalid');assert.equal(globalThis.__employeeStoreCalls,0);assert.equal((await open.readEmployeesAction({ventureId:'a',ownerId:'foreign'})).status,'invalid');});
