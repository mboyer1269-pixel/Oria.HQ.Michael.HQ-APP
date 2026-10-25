import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createJiti} from 'jiti';
const root=process.cwd();
const temp=mkdtempSync(path.join(tmpdir(),'oria-brief-contract-'));
const fixture=(name,code)=>{const p=path.join(temp,name+'.mjs');writeFileSync(p,code);return p;};
const holder='__oriaBriefDocumentContract';
globalThis[holder]={documents:null,authorized:true};
const jiti=createJiti(import.meta.url,{moduleCache:false,fsCache:false,alias:{
 '@':path.join(root,'src'),
 'server-only':fixture('server-only','export {};'),
 '@/server/calendar/calendar-service':fixture('calendar','export async function listCalendarEvents(){return [];}'),
 '@/server/contact/contact-lead-repository':fixture('contact','export function createContactLeadRepository(){return {listRecent:async()=>[]};} export class ContactLeadRepositoryError extends Error {}'),
 '@/server/calendar/calendar-repository':fixture('calendar-error','export class CalendarRepositoryError extends Error {}'),
 '@/server/brief/document-index':fixture('documents',`export async function getDocumentBriefSnapshot(){return globalThis.${holder}.documents;}`),
 '@/server/auth/owner':fixture('owner',`export async function requireOwnerApiSession(){return globalThis.${holder}.authorized?null:new Response('Unauthorized',{status:401});}`),
}});
const {buildCeoBriefSnapshot}=await jiti.import(path.join(root,'src/server/brief/ceo-brief-service.ts'));
const {GET}=await jiti.import(path.join(root,'src/app/api/brief/ceo/route.ts'));
test.after(()=>{delete globalThis[holder];rmSync(temp,{recursive:true,force:true});});
for(const reason of ['disabled','missing','read_error','invalid_data']) test(`service and real API preserve unknown count: ${reason}`,async()=>{
 globalThis[holder].documents={source:'local_fixture',status:'unavailable',reason,totalCount:null,byHat:{},recent:[]};
 const brief=await buildCeoBriefSnapshot();
 assert.equal(brief.documents.totalCount,null);assert.equal(brief.documents.reason,reason);
 assert.match(brief.headline,/absence ne peut pas être confirmée/);assert.doesNotMatch(brief.headline,/HQ calme|coffre privé/);
 const response=await GET();assert.equal(response.status,200);
 const body=await response.json();assert.deepEqual(body.brief.documents,brief.documents);
 assert.equal('recent' in body.brief.documents,false);
});
for(const count of [0,1]) test(`available fixture count ${count} is serialized without pretending production`,async()=>{
 globalThis[holder].documents={source:'local_fixture',status:'available',reason:null,totalCount:count,byHat:count?{hq:1}:{},recent:count?[{id:'synthetic',filename:'demo.md',hat:'hq'}]:[]};
 const brief=await buildCeoBriefSnapshot();assert.equal(brief.documents.totalCount,count);assert.equal(brief.documents.status,'available');
 if(count)assert.match(brief.headline,/fixture locale de démonstration/);
 const body=await (await GET()).json();assert.deepEqual(body.brief.documents.recentFilenames,count?['demo.md']:[]);
});
test('API owner refusal remains before brief creation (synthetic auth dependency)',async()=>{
 globalThis[holder].authorized=false;globalThis[holder].documents=null;
 assert.equal((await GET()).status,401);
});
