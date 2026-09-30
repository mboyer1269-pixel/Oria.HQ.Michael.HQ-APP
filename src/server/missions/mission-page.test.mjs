import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createJiti} from 'jiti';
import {createClient} from '@supabase/supabase-js';
const jiti=createJiti(import.meta.url,{alias:{'@':path.join(process.cwd(),'src'),'server-only':path.join(process.cwd(),'src/scripts/smoke/server-only-stub.mjs')}});
const {parseMissionPageFilter,paginateLocalMissions,listMissionPage,missionSearchFilter,missionPageHref}=await jiti.import('./mission-page.ts');
const missions=Array.from({length:73},(_,i)=>({id:String(i).padStart(3,'0'),workspaceId:'a',modeId:'m',title:`Mission ${i}`,objective:i===70?'needle':'ordinary',status:i===70?'needs_approval':'draft',riskLevel:'low',autonomyLevel:0,requiresApproval:i===69,input:{},assignedAgentId:'',expectedOutput:'Tests',createdAt:'2026-09-30',updatedAt:'2026-09-30'}));
test('pagination covers entire history with stable tie ordering and global counters',()=>{
 const pages=[1,2,3].map(page=>paginateLocalMissions(missions,{page,q:'',status:'all'}));
 assert.deepEqual(pages.map(p=>p.missions.length),[25,25,23]);
 assert.equal(new Set(pages.flatMap(p=>p.missions.map(m=>m.id))).size,73);
 for(const p of pages){assert.equal(p.summary.total,73);assert.equal(p.summary.needs_approval,1);assert.equal(p.reviewTotal,2);}
});
test('global title/objective search and review find records outside initial page',()=>{
 const result=paginateLocalMissions(missions,{page:1,q:'NEEDLE',status:'review'});
 assert.equal(result.missions[0].id,'070');assert.equal(result.filteredTotal,1);assert.equal(result.summary.total,73);
 assert.equal(paginateLocalMissions(missions,{page:1,q:'',status:'review'}).filteredTotal,2);
 assert.equal(paginateLocalMissions(missions,{page:999,q:'',status:'all'}).missions.length,0);
});
test('parameters bounded; links retain filters; regex and OR punctuation are quoted literals',()=>{
 assert.deepEqual(parseMissionPageFilter({page:'Infinity',status:'invalid',q:'x'.repeat(500)}),{page:1,status:'all',q:'x'.repeat(200)});
 assert.equal(parseMissionPageFilter({page:['2'],q:['x']}).page,1);
 assert.equal(new URL(missionPageHref({page:2,q:'a&b',status:'review'}),'http://test').searchParams.get('q'),'a&b');
 const q='a.*%_,"(x)\\'; const filter=missionSearchFilter(q);
 assert.ok(filter.startsWith('title.imatch.')); const literal=JSON.parse(filter.slice('title.imatch.'.length,filter.indexOf(',objective.imatch.')));
 assert.ok(new RegExp(literal,'i').test(q));assert.ok(!new RegExp(literal,'i').test('aZZsomething'));
});
function fakeClient(fail=false){
 const calls=[];
 const client=createClient('https://synthetic.invalid','fake-test-key',{auth:{persistSession:false},global:{fetch:async(url,init)=>{
  const u=new URL(url);calls.push({url:u,method:init.method});
  if(fail)return new Response(JSON.stringify({message:'synthetic failure'}),{status:400});
  const count=init.method==='HEAD'?7:73;
  return new Response(init.method==='HEAD'?null:'[]',{status:200,headers:{'content-type':'application/json','content-range':`0-0/${count}`}});
 }}});return {client,calls};
}
test('real Supabase query builder sends bounded rows and server-only counts scoped to workspace AND mode',async()=>{
 const {client,calls}=fakeClient();const result=await listMissionPage({workspaceId:'a',modeId:'m'},{page:3,q:'a*',status:'review'},client);
 assert.equal(calls.length,9);assert.equal(calls.filter(c=>c.method==='HEAD').length,8);
 for(const c of calls){assert.equal(c.url.searchParams.get('workspace_id'),'eq.a');assert.equal(c.url.searchParams.get('mode_id'),'eq.m');}
 const data=calls.find(c=>c.method!=='HEAD').url;
 assert.equal(data.searchParams.get('limit'),'25');assert.equal(data.searchParams.get('offset'),'50');
 assert.equal(data.searchParams.getAll('or').length,1);assert.ok(data.searchParams.get('or').startsWith('(and(or('));
 assert.ok(data.searchParams.get('or').includes('imatch'));assert.equal(result.filteredTotal,73);assert.equal(result.summary.total,49);
});
test('failed counts fail closed rather than displaying partial totals',async()=>{
 const {client}=fakeClient(true);await assert.rejects(listMissionPage({workspaceId:'a'},{page:1,q:'',status:'all'},client),/unavailable/);
});

test('stale PostgREST range recovers once to first page; unrelated errors are not hidden',async()=>{
 let dataCalls=0;
 const client=createClient('https://synthetic.invalid','fake-test-key',{auth:{persistSession:false},global:{fetch:async(url,init)=>{
  const u=new URL(url);
  if(init.method!=='HEAD'){
   dataCalls++;
   if(u.searchParams.get('offset')==='24975')return new Response(JSON.stringify({code:'PGRST103',message:'Requested range not satisfiable'}),{status:416,headers:{'content-type':'application/json'}});
  }
  return new Response(init.method==='HEAD'?null:'[]',{status:200,headers:{'content-type':'application/json','content-range':'0-0/1'}});
 }}});
 const result=await listMissionPage({workspaceId:'a'},{page:1000,q:'needle',status:'review'},client);
 assert.equal(result.pageNumber,1);assert.equal(dataCalls,2);assert.equal(result.filteredTotal,1);
});

test('review filter preserves all policy reasons, not only needs_approval status',()=>{
 const values=[{requiresApproval:true},{riskLevel:'high'},{autonomyLevel:4},{status:'needs_approval'},{}].map((patch,i)=>({...missions[0],id:String(i),...patch}));
 const result=paginateLocalMissions(values,{page:1,q:'',status:'review'});
 assert.equal(result.filteredTotal,4);assert.equal(result.reviewTotal,4);assert.equal(result.summary.total,5);
});
