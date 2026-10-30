// Isolated preference proof ONLY. No production URL/key, provider, schema deployment or agent.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { createJiti } from 'jiti';
import { PostgrestClient } from '@supabase/postgrest-js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const BASE='8aec6ea3efa707b53d3ea48417019a5e256eed1d';
export function localConfig(pg,rest){
 assert.equal(pg,'postgres://postgres@127.0.0.1:5432/oria_test_cockpit_layout','disposable named loopback database only');
 assert.equal(rest,'http://127.0.0.1:3000','disposable loopback REST only');
 return {pg,rest};
}
export function allowedRequest(input,init={}){
 try {
 const u=new URL(String(input));const method=init.method??'GET';
 if(u.origin!=='http://127.0.0.1:3000'||u.username||u.password||u.hash||u.pathname!=='/cockpit_layout')return false;
 const keys=[...u.searchParams.keys()];if(keys.some(k=>!['select','user_id','updated_at'].includes(k)))return false;
 if(u.searchParams.get('select')!=='user_id,widget_order,updated_at')return false;
 if(method==='GET'||method==='PATCH'){
  if(!/^eq\.cockpit-proof-[a-z-]+$/.test(u.searchParams.get('user_id')??''))return false;
  if(method==='PATCH'&&!/^eq\.[0-9TZ:.+-]{20,40}$/.test(u.searchParams.get('updated_at')??''))return false;
  return true;
 }
 if(method==='POST'){
  const body=JSON.parse(init.body??'null');return keys.length===1&&body&&/^cockpit-proof-[a-z-]+$/.test(body.user_id)&&Array.isArray(body.widget_order)&&typeof body.updated_at==='string'&&Object.keys(body).sort().join(',')==='updated_at,user_id,widget_order';
 }
 return false;
 } catch { return false; }
}
export function localTransport(counts){return async(input,init={})=>{
 if(!allowedRequest(input,init)){counts.unexpected++;throw Error('unexpected network refused');}counts.allowed++;
 const u=new URL(String(input));return new Promise((resolve,reject)=>{
  const req=httpRequest({hostname:'127.0.0.1',port:3000,path:u.pathname+u.search,method:init.method??'GET',headers:Object.fromEntries(new Headers(init.headers)),agent:false,signal:init.signal??AbortSignal.timeout(5000)},res=>{
   const chunks=[];let bytes=0;res.on('data',c=>{bytes+=c.length;if(bytes>64000)req.destroy(Error('response too large'));else chunks.push(c)});res.on('error',reject);
   res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:Object.fromEntries(Object.entries(res.headers).filter(([,v])=>typeof v==='string'))})));
  });req.on('error',reject);req.end(init.body);
 });
};}
export async function requireCommittedPatchAck(response,request,owner,baseline){
 assert.ok(response.ok,'missing successful mutation HTTP response');
 const rows=await response.clone().json();assert.ok(Array.isArray(rows));assert.equal(rows.length,1);const ack=rows[0];assert.equal(ack.user_id,owner);assert.deepEqual(ack.widget_order,request.widget_order);
 assert.notDeepEqual(request.widget_order,baseline.order,'proof must change the stored order');
 assert.ok(Number.isFinite(Date.parse(ack.updated_at)));assert.equal(Date.parse(ack.updated_at),Date.parse(request.updated_at));
 assert.ok(Date.parse(ack.updated_at)>Date.parse(baseline.revision),'proof revision did not advance');return ack;
}
export function assertLostAckObservation({result,baseline,target,ack,recovered,mutations}){
 assert.equal(result.status,'unconfirmed');assert.equal(mutations,1);assert.ok(ack,'missing validated commit ACK before intentional loss');
 assert.notDeepEqual(target,baseline.order);assert.equal(recovered.status,'loaded');assert.deepEqual(recovered.order,target);
 assert.equal(recovered.revision,ack.updated_at);assert.ok(Date.parse(recovered.revision)>Date.parse(baseline.revision));
}
async function modules(fetch){
 const jiti=createJiti(import.meta.url,{fsCache:false,alias:{'@':path.join(ROOT,'src'),'server-only':path.join(ROOT,'src/scripts/smoke/server-only-stub.mjs')}});
 const {createCockpitLayoutPersistence}=await jiti.import('@/server/cockpit/layout-persistence');
 const {defaultCockpitOrder}=await jiti.import('@/features/cockpit/cockpit-layout-contract');
 const client=new PostgrestClient('http://127.0.0.1:3000',{fetch});
 return {service:id=>createCockpitLayoutPersistence(client,id),order:defaultCockpitOrder()};
}
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export async function main(pg,rest){
 const config=localConfig(pg,rest),counts={allowed:0,unexpected:0};const transport=localTransport(counts),oldFetch=globalThis.fetch;globalThis.fetch=transport;
 const env={PATH:process.env.PATH,PGCONNECT_TIMEOUT:'5',PGOPTIONS:'-c statement_timeout=10000 -c lock_timeout=8000'};
 const args=[config.pg,'-X','-qAt','-v','ON_ERROR_STOP=1'];
 const raw=q=>spawnSync('psql',args,{input:q,env,encoding:'utf8',timeout:15000});
 const sql=q=>{const r=raw(q);assert.equal(r.status,0,r.stderr);return r.stdout.trim()};
 const proofs=[];
 try{
  assert.equal(sql('select current_database()'),'oria_test_cockpit_layout');assert.equal(sql("select count(*) from pg_tables where schemaname='public'"),'0');
  const files=['db/migrations/0019_cockpit_layout.sql','db/migrations/0025_security_hardening.sql'];
  for(const file of files){const r=spawnSync('git',['show',`${BASE}:${file}`],{cwd:ROOT});assert.equal(r.status,0);assert.deepEqual(fs.readFileSync(path.join(ROOT,file)),r.stdout,'schema bytes changed; re-review proof')}
  sql("create role anon nologin;create role authenticated nologin;create role qualification_service nologin bypassrls;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
  sql(fs.readFileSync(path.join(ROOT,files[0]),'utf8'));
  const hardening=fs.readFileSync(path.join(ROOT,files[1]),'utf8');const start=hardening.indexOf('drop policy if exists "cockpit_layout_all"');const end=hardening.indexOf('-- 2. contact_leads:',start);assert.ok(start>0&&end>start);sql(hardening.slice(start,end));
  sql("grant usage on schema public to anon,authenticated,qualification_service;grant select,insert,update on cockpit_layout to anon,authenticated,qualification_service;notify pgrst,'reload schema';");
  const m=await modules(transport),id='cockpit-proof-owner',service=m.service(id),order=m.order,changed=[...order].reverse();
  let ready;for(let i=0;i<30;i++){ready=await service.read();if(ready.status==='missing')break;await pause(200)}assert.equal(ready.status,'missing');
  const step=async(name,fn)=>{await fn();proofs.push(name);console.log('PASS '+name)};
  const stored=()=>JSON.parse(sql(`select to_jsonb(c) from cockpit_layout c where user_id=${quote(id)}`));
  await step('1 actual insert ACK and fresh-process durable readback',async()=>{
   const saved=await service.save({order:changed,expectedRevision:null});assert.equal(saved.status,'confirmed');
   const r=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--read-child'],{cwd:ROOT,env:{PATH:process.env.PATH,CI_PG_URL:pg,POSTGREST_DIRECT_URL:rest},encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr);const read=JSON.parse(r.stdout.trim().split('\n').at(-1));assert.equal(read.status,'loaded');assert.deepEqual(read.order,changed);assert.equal(read.revision,saved.revision);
  });
  await step('2 actual owner-scoped conditional update ACK; foreign row untouched',async()=>{
   const foreign=m.service('cockpit-proof-foreign');assert.equal((await foreign.save({order,expectedRevision:null})).status,'confirmed');const before=await foreign.read();
   const current=await service.read(),saved=await service.save({order,expectedRevision:current.revision});assert.equal(saved.status,'confirmed');assert.deepEqual((await service.read()).order,order);assert.deepEqual(await foreign.read(),before);
  });
  await step('3 stale revision and false missing baseline have no write effect',async()=>{
   const before=stored();for(const expectedRevision of [null,'2000-01-01T00:00:00.000Z'])assert.equal((await service.save({order:changed,expectedRevision})).status,'conflict');assert.deepEqual(stored(),before);
  });
  await step('4 two observed update lock waiters yield exactly one write and one conflict',async()=>{
   const baseline=await service.read();const blocker=spawn('psql',args,{env,stdio:['pipe','pipe','pipe']});let output='',errors='';blocker.stdout.on('data',c=>output+=c);blocker.stderr.on('data',c=>errors+=c);
   const done=new Promise((resolve,reject)=>{blocker.on('error',reject);blocker.on('close',code=>code===0?resolve():reject(Error(errors)))});done.catch(()=>{});const timer=setTimeout(()=>blocker.kill('SIGTERM'),10000);let pending;
   try{
    blocker.stdin.write(`begin;select user_id from cockpit_layout where user_id=${quote(id)} for update;select 'LOCK:'||pg_backend_pid();\n`);
    let found;const deadline=Date.now()+5000;while(!(found=/LOCK:(\d+)/.exec(output))){assert.ok(Date.now()<deadline,'blocker not observed');await pause(10)}
    const alternate=[...order.slice(1),order[0]];pending=Promise.all([service.save({order:changed,expectedRevision:baseline.revision}),service.save({order:alternate,expectedRevision:baseline.revision})]);pending.catch(()=>{});
    let waiting=0;const end=Date.now()+5000;while(waiting<2){waiting=Number(sql(`with recursive blocked(pid) as(select pid from pg_stat_activity where ${Number(found[1])}=any(pg_blocking_pids(pid)) union select a.pid from pg_stat_activity a join blocked b on b.pid=any(pg_blocking_pids(a.pid))) select count(distinct a.pid) from pg_stat_activity a join blocked b using(pid) where a.datname=current_database() and a.wait_event_type='Lock' and a.query ilike '%cockpit_layout%'`));assert.ok(Date.now()<end,'two update waiters not observed');if(waiting<2)await pause(10)}
    console.log('OBSERVED_COCKPIT_UPDATE_WAITERS=2');
   }finally{blocker.stdin.end('rollback;\n');try{await done;if(pending)await pending}finally{clearTimeout(timer)}}
   const results=await pending;assert.equal(results.filter(r=>r.status==='confirmed').length,1,JSON.stringify(results));assert.equal(results.filter(r=>r.status==='conflict').length,1);assert.deepEqual((await service.read()).order,results.find(r=>r.status==='confirmed').order);
  });
  await step('5 real committed write with deliberately lost ACK is recoverable by read, never retry',async()=>{
   const exercise=async()=>{
    const baseline=await service.read();assert.equal(baseline.status,'loaded');const target=[...baseline.order.slice(1),baseline.order[0]];
    let mutations=0,ack=null;const lossy=await modules(async(url,init)=>{
     const response=await transport(url,init);if(init.method==='PATCH'){
      mutations++;ack=await requireCommittedPatchAck(response,JSON.parse(init.body),id,baseline);
      throw Error('synthetic ACK loss AFTER validated successful HTTP commit');
     }return response;
    });
    const result=await lossy.service(id).save({order:target,expectedRevision:baseline.revision});const recovered=await service.read();
    assertLostAckObservation({result,baseline,target,ack,recovered,mutations});
   };
   await exercise();
   // Negative control: the SAME proof must fail when a real DB trigger rejects PATCH.
   const before=stored();sql("create function reject_cockpit_ack_proof() returns trigger language plpgsql as $$begin raise exception 'synthetic negative proof refusal';end$$;create trigger cockpit_ack_negative before update on cockpit_layout for each row execute function reject_cockpit_ack_proof();");
   try{await assert.rejects(exercise,/missing validated commit ACK/);assert.deepEqual(stored(),before)}finally{sql('drop trigger cockpit_ack_negative on cockpit_layout;drop function reject_cockpit_ack_proof();')}
  });
  await step('6 failed pre-write read dispatches no mutation and preserves actual row',async()=>{
   const before=stored();let calls=0;const refused=await modules(async()=>{calls++;throw Error('synthetic transport unavailable before read')});assert.deepEqual(await refused.service(id).save({order,expectedRevision:before.updated_at}),{status:'not_attempted',reason:'read_failed'});assert.equal(calls,1);assert.deepEqual(stored(),before);
  });
  await step('7 real DB-rejected mutation is unconfirmed conservatively; transaction preserves row',async()=>{
   const before=stored();sql("create function reject_cockpit_test_write() returns trigger language plpgsql as $$begin raise exception 'synthetic proof write refusal';end$$;create trigger cockpit_proof_reject before update on cockpit_layout for each row execute function reject_cockpit_test_write();");
   try{const baseline=await service.read();assert.equal((await service.save({order,expectedRevision:baseline.revision})).status,'unconfirmed');assert.deepEqual(stored(),before)}finally{sql('drop trigger cockpit_proof_reject on cockpit_layout;drop function reject_cockpit_test_write();')}
  });
  await step('8 existing restrictive anon/authenticated policies deny direct reads and writes',async()=>{
   const readOwner='11111111-1111-4111-8111-111111111111',insertOwner='22222222-2222-4222-8222-222222222222';
   sql(`insert into cockpit_layout(user_id) values(${quote(readOwner)});grant usage on schema auth to anon,authenticated;`);
   assert.equal(sql("select count(*) from pg_policies where tablename='cockpit_layout' and permissive='RESTRICTIVE'"),'2');
   for(const role of ['anon','authenticated']){
    // Matching synthetic UID would satisfy0019's legacy owner policy without0025.
    assert.equal(sql(`set role ${role};set request.jwt.claim.sub=${quote(readOwner)};select count(*) from cockpit_layout`),'0');
    const r=raw(`set role ${role};set request.jwt.claim.sub=${quote(insertOwner)};insert into cockpit_layout(user_id) values(${quote(insertOwner)})`);
    assert.notEqual(r.status,0);assert.match(r.stderr,/row-level security/);
   }
  });
  assert.equal(counts.unexpected,0);assert.equal(proofs.length,8);console.log(JSON.stringify({proofs,allowedLoopback:counts.allowed,unexpectedNetwork:counts.unexpected}));console.log('UNEXPECTED_NETWORK=0');console.log('ALL 8 COCKPIT REAL-DB PROOFS PASSED');
 }finally{globalThis.fetch=oldFetch}
}
const entry=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(entry&&process.argv[2]==='--run')await main(process.env.CI_PG_URL,process.env.POSTGREST_DIRECT_URL);
if(entry&&process.argv[2]==='--read-child'){
 localConfig(process.env.CI_PG_URL,process.env.POSTGREST_DIRECT_URL);const counts={allowed:0,unexpected:0},fetch=localTransport(counts);globalThis.fetch=fetch;const m=await modules(fetch);console.log(JSON.stringify(await m.service('cockpit-proof-owner').read()));assert.equal(counts.unexpected,0);
}
