// DRAFT VALIDATION ONLY: real disposable PG + real controlled Node fixture child.
// No provider account, real model, bwrap confinement claim, route mounting or production DB.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import childProcess, { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { request as httpRequest } from 'node:http';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { BASE, SCHEMA_FILES, SYNTHETIC_KEY, localConfig, quote, loadContracts, canonicalFixture } from './prove-atelier-boundary-real-db.mjs';
import { createFakeBoundSpecProvider } from '../src/server/atelier/atelier-bound-spec.test-fixture.mjs';
import { runAdmissionProofs } from './prove-execution-intent-admission-real-db.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RPC = new Set(['read_atelier_ledger_tail','prepare_atelier_owner_spec_v2','admit_atelier_owner_spec_v2','check_atelier_owner_spec_admission_v2','record_atelier_owner_spec_result_v2',
 'create_approval_decision','classify_approval_decision','admit_execution_intent_v1','check_execution_intent_admission_v1']);
export function allowedRequest(input, init={}) {
 const u=new URL(typeof input==='string'||input instanceof URL?input:input.url),method=init.method??'GET';
 if(u.origin!=='http://127.0.0.1:3000'||u.username||u.password||u.hash)return false;
 if(method==='POST')return !u.search&&RPC.has(u.pathname.replace(/^\/rpc\//,''))&&u.pathname.startsWith('/rpc/');
 return method==='GET'&&u.pathname==='/missions'&&[...u.searchParams.keys()].sort().join(',')==='id,select,workspace_id'
  &&u.searchParams.get('select')==='*'&&/^eq\.[a-f0-9-]{36}$/.test(u.searchParams.get('id'))&&/^eq\.[a-zA-Z0-9_-]{1,160}$/.test(u.searchParams.get('workspace_id'));
}
export function localTransport(counts) {return async(input,init={})=>{
 if(!allowedRequest(input,init)){counts.unexpected++;throw Error('unexpected proof network');}counts.allowed++;
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 return new Promise((resolve,reject)=>{const req=httpRequest({hostname:'127.0.0.1',port:3000,method:init.method??'GET',path:url.pathname+url.search,
 headers:Object.fromEntries(new Headers(init.headers)),agent:false,signal:AbortSignal.timeout(10000)},res=>{const chunks=[];let bytes=0;
 res.on('data',c=>{bytes+=c.length;if(bytes>1000000)req.destroy(Error('oversize response'));else chunks.push(c);});res.on('error',reject);
 res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:Object.fromEntries(Object.entries(res.headers).filter(([,v])=>typeof v==='string'))})));});req.on('error',reject);req.end(init.body);
 });
};}
async function modules(root,fetch){
 const original=await loadContracts(root),{createJiti}=createRequire(path.join(root,'package.json'))('jiti');
 const jiti=createJiti(path.join(root,'package.json'),{jsx:{runtime:'automatic'},alias:{'@':path.join(root,'src'),'server-only':path.join(root,'src/scripts/smoke/server-only-stub.mjs')}});
 return{...original,O:await jiti.import('@/server/missions/atelier-owner-spec-contract'),S:await jiti.import('@/server/missions/atelier-owner-spec-store'),
 V:await jiti.import('@/server/missions/atelier-owner-spec-service'),H:await jiti.import('@/server/missions/atelier-owner-spec-handler'),
 R:await jiti.import('@/server/missions/atelier-owner-spec-read'),P:await jiti.import('@/features/missions/components/mission-result-panel'),
 E:await jiti.import('@/server/atelier/atelier-bound-spec'),db:new original.PostgrestClient('http://127.0.0.1:3000',{fetch})};
}
export async function main(root,rawConfig){
 const config=localConfig(rawConfig.pg,rawConfig.rest),counts={allowed:0,unexpected:0},transport=localTransport(counts),oldFetch=globalThis.fetch;
 globalThis.fetch=transport;
 const env={PATH:process.env.PATH,PGCONNECT_TIMEOUT:'5',PGOPTIONS:'-c statement_timeout=10000 -c lock_timeout=8000'};
 const args=[config.pg,'-X','-qAt','-v','ON_ERROR_STOP=1'];
 const sql=q=>{const r=spawnSync('psql',args,{input:q,encoding:'utf8',env});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 assert.equal(sql('select current_database()'),config.db);assert.equal(sql("select count(*) from pg_tables where schemaname='public'"),'0');
 for(const file of SCHEMA_FILES){const r=spawnSync('git',['show',`${BASE}:${file}`],{cwd:root});assert.equal(r.status,0);assert.deepEqual(readFileSync(path.join(root,file)),r.stdout,file);}
 const prior='db/migrations/drafts/atelier_execution_boundary.sql';
 assert.deepEqual(readFileSync(path.join(root,prior)),spawnSync('git',['show',`8e16f42b1dac82a1aaa81cff21f5cd5d6e3e44a3:${prior}`],{cwd:root}).stdout);
 sql(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create role qualification_service nologin bypassrls;
 create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as 'select null::uuid';`);
 for(const f of [...SCHEMA_FILES,prior,'db/migrations/drafts/atelier_owner_spec_v2.sql'])sql(readFileSync(path.join(root,f),'utf8'));
 sql("grant usage on schema public to service_role;grant select,insert,update on all tables in schema public to service_role;grant service_role to qualification_service;notify pgrst,'reload schema';");
 sql("set oria.allow_disposable_db_tests='on';"+readFileSync(path.join(root,'db/migrations/drafts/atelier_owner_spec_v2_verify.sql'),'utf8'));
 const m=await modules(root,transport),deps={hmacKey:()=>SYNTHETIC_KEY,enabled:()=>true},store=m.S.createOwnerSpecStore(m.db,deps),results=[],failures=[];
 const scratch=mkdtempSync(path.join(tmpdir(),'oria-owner-proof-')),repos=path.join(scratch,'repos');let spawned=0;
 const git=(dir,...args)=>{const r=spawnSync('git',['-C',dir,...args],{encoding:'utf8',env:{PATH:process.env.PATH,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'}});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 const fixture=async(workspace)=>{
  const f=await canonicalFixture(m,workspace);const relative='synthetic/'+f.mission.id,repo=path.join(repos,f.context.workspaceId,relative);mkdirSync(repo,{recursive:true});
  git(repo,'init','-q','-b','main');writeFileSync(path.join(repo,'README.md'),'Disposable test fixture only\n');git(repo,'add','README.md');
  git(repo,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','synthetic base');const sha=git(repo,'rev-parse','HEAD');
  f.mission.input._atelierRun.binding=m.D.buildAtelierDevelopmentBinding(f.mission,f.context,{missionId:f.mission.id,repository:{relativePath:relative,baseSha:sha},selection:f.input.payload.binding.selection,timeoutMs:5000});
  assert.ok(f.mission.input._atelierRun.binding);
  const row={...m.O.ownerSpecSnapshot(f.mission),updated_at:f.mission.updatedAt,created_at:f.mission.createdAt};
  sql(`insert into auth.users(id) values(${quote(f.context.actorId)});insert into missions select(jsonb_populate_record(null::missions,${quote(JSON.stringify(row))}::jsonb)).*;`);
  const host={installationId:f.request.installationId,qualify:async()=>true};
  const engine={recover:e=>m.E.createBoundSpecEngine({root:path.join(scratch,'runs'),env:{PATH:process.env.PATH,ORIA_ATELIER_REPOS_ROOT:repos},provider:null}).recover(e),execute:async e=>{const fake=createFakeBoundSpecProvider({instructionHash:e.payload.instructions.sha256,model:e.payload.binding.selection.modelId,specText:'# Controlled fake-provider spec\nMission '+e.payload.missionId+'\n'});
   const result=await m.E.createBoundSpecEngine({root:path.join(scratch,'runs'),env:{PATH:process.env.PATH,ORIA_ATELIER_REPOS_ROOT:repos},provider:fake.provider}).execute(e);spawned+=fake.calls.length;return result;}};
  const service=m.V.createOwnerSpecService({store,host,engine}),command=command=>({command,missionId:f.mission.id,runId:f.request.runId});
  const handler=m.H.createOwnerSpecHandler({session:async()=>({ctx:{workspaceId:f.context.workspaceId,userId:f.context.actorId,role:'owner'},user:{id:f.context.actorId}}),holder:()=>true,
   workspace:()=>({activeMode:{id:'hq'}}),service});
  const call=async value=>{const r=await handler(new Request('https://oria.test/unmounted-owner-spec',{method:'POST',headers:{origin:'https://oria.test','content-type':'application/json'},body:JSON.stringify(value)}));return{code:r.status,...await r.json()};};
  const review=async()=>{const r=await call(command('review'));assert.equal(r.status,'reviewed',JSON.stringify(r));return r.review;};
  return{...f,repo,sha,host,engine,service,command,call,review};
 };
 const facts=f=>JSON.parse(sql(`select jsonb_build_object('admitted',input#>'{_atelierOwnerSpecV2,admission}' is not null,'result',input#>'{_atelierOwnerSpecV2,result}' is not null,
 'decisions',(select count(*) from agent_review_approval_events where metadata->>'sourceMissionId'=missions.id),'ledger',(select count(*) from action_ledger where mission_id=missions.id)) from missions where id=${quote(f.mission.id)}`));
 const unchanged=f=>assert.deepEqual(facts(f),{admitted:false,result:false,decisions:0,ledger:0});
 const chain=workspace=>{const rows=JSON.parse(sql(`select coalesce(jsonb_agg(to_jsonb(l) order by created_at),'[]') from action_ledger l where workspace_id=${quote(workspace)}`));assert.deepEqual(m.verifier.verifyChain(rows.map(m.fields.toLedgerChainEntry),{hmacKey:SYNTHETIC_KEY}),{ok:true,count:rows.length});return rows;};
 const step=async(name,run)=>{try{await run();results.push(name);console.log('PROVEN (real PG + explicit fake provider): '+name);}catch(e){failures.push({name,message:e.message});console.error('FAILED '+name+': '+e.stack);}};
 const execution=async f=>{const review=await f.review(),payload=m.O.readOwnerSpecReview(review).payload,admit=await store.admit(payload,review.payloadHash);assert.equal(admit.status,'admitted',JSON.stringify(admit));return{payload,payloadHash:review.payloadHash,receipt:admit.receipt};};
 let saved;
 try{
  let ready=false;for(let i=0;i<40;i++){const r=await m.db.rpc('read_atelier_ledger_tail',{p_workspace_id:'readiness'});if(r.data?.status==='ready'){ready=true;break;}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
  await step('owner review/confirm -> G1 admission -> controlled child -> canonical artifact and sealed ledger',async()=>{
   const f=await fixture(),review=await f.review(),before=spawned,done=await f.call({...f.command('confirm'),expectedReviewHash:review.payloadHash});
   assert.equal(done.status,'recorded',JSON.stringify(done));assert.equal(done.result.status,'succeeded',JSON.stringify(done));assert.equal(spawned-before,1);
   assert.deepEqual(facts(f),{admitted:true,result:true,decisions:1,ledger:2});assert.equal(git(f.repo,'rev-parse','HEAD'),f.sha);assert.equal(chain(f.context.workspaceId).length,2);
   const decision=JSON.parse(sql(`select to_jsonb(d) from agent_review_approval_events d where id=${quote(done.receipt.decisionId)}`));assert.equal(decision.status,'consumed');assert.equal(decision.reviewer_id,f.context.actorId);assert.equal(decision.no_runtime_execution_authorized,true);
   saved={f,done};
  });
  await step('separate Node restart reads canonical artifact without engine or local runtime state',async()=>{
   assert.ok(saved);const {f,done}=saved,ctx=JSON.stringify({context:f.context,command:f.command('recover')});
   const r=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--recover-proof'],{cwd:root,encoding:'utf8',timeout:15000,
    env:{PATH:process.env.PATH,NODE_ENV:'test',ORIA_PROOF_RECOVER:ctx}});assert.equal(r.status,0,r.stderr);
   const recovered=JSON.parse(r.stdout.trim().split('\n').at(-1));assert.equal(recovered.status,'recovered');assert.deepEqual(recovered.result,done.result);assert.equal(recovered.readback.state,'recorded');
   assert.equal(recovered.readback.artifact.text,done.result.evidence.specText);assert.equal(recovered.readback.artifact.sha256,done.result.evidence.sha256);
   assert.equal(recovered.rendered,true);assert.equal(recovered.readback.executionAvailable,false);
  });
  async function blocker(f){const child=spawn('psql',args,{env,stdio:['pipe','pipe','pipe']});let output='',err='';child.stdout.on('data',v=>{output+=v;});child.stderr.on('data',v=>{err+=v;});
   const timer=setTimeout(()=>child.kill('SIGTERM'),10000),done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error(err));});});done.catch(()=>{});
   child.stdin.write(`begin;select id from missions where id=${quote(f.mission.id)} for update;select 'LOCK:'||pg_backend_pid();\n`);
   const deadline=Date.now()+5000;let found;try{while(!(found=/LOCK:(\d+)/.exec(output))){assert.ok(Date.now()<deadline);await new Promise(r=>setTimeout(r,10));}}catch(e){child.stdin.end('rollback;\n');await done.catch(()=>{});throw e;}
   return{pid:Number(found[1]),release:async()=>{child.stdin.end('rollback;\n');await done;}};}
  await step('two observed same-mission admission waiters yield one consume and one fake process',async()=>{
   const f=await fixture(),review=await f.review(),req={...f.command('confirm'),expectedReviewHash:review.payloadHash},b=await blocker(f),before=spawned;
   const pending=Promise.all([f.call(req),f.call(req)]);let observed=0;
   try{const deadline=Date.now()+5000;while(observed<2){observed=Number(sql(`with recursive blocked(pid) as(select pid from pg_stat_activity where ${b.pid}=any(pg_blocking_pids(pid)) union select a.pid from pg_stat_activity a join blocked b on b.pid=any(pg_blocking_pids(a.pid))) select count(distinct a.pid) from pg_stat_activity a join blocked b using(pid) where a.datname=current_database() and a.wait_event_type='Lock' and a.query like '%admit_atelier_owner_spec_v2%'`));assert.ok(Date.now()<deadline,'2 admission waiters not observed');if(observed<2)await new Promise(r=>setTimeout(r,10));}
    console.log('OBSERVED_OWNER_SPEC_WAITERS=2');unchanged(f);
   }finally{await b.release();await pending;}
   const answers=await pending;assert.equal(answers.filter(x=>x.status==='recorded').length,1,JSON.stringify(answers));assert.equal(spawned-before,1);assert.deepEqual(facts(f),{admitted:true,result:true,decisions:1,ledger:2});chain(f.context.workspaceId);
  });
  await step('second mission appends on a nonempty workspace chain without fork',async()=>{
   assert.ok(saved);const f=await fixture(saved.f.context.workspaceId),r=await f.review(),done=await f.call({...f.command('confirm'),expectedReviewHash:r.payloadHash});assert.equal(done.status,'recorded');assert.equal(chain(f.context.workspaceId).length,4);
  });
  await step('source changes after review refuse before producing approval',async()=>{
   const f=await fixture(),r=await f.review();sql(`update missions set objective='changed source' where id=${quote(f.mission.id)}`);assert.equal((await f.call({...f.command('confirm'),expectedReviewHash:r.payloadHash})).status,'conflict');unchanged(f);
  });
  await step('wrong hash, foreign actor and foreign workspace cannot admit',async()=>{
   const f=await fixture(),r=await f.review();assert.equal((await f.call({...f.command('confirm'),expectedReviewHash:'0'.repeat(64)})).status,'conflict');
   for(const change of [{p_actor_id:randomUUID()},{p_workspace_id:'foreign'}]){const out=await m.db.rpc('admit_atelier_owner_spec_v2',{p_workspace_id:f.context.workspaceId,p_actor_id:f.context.actorId,p_mission_id:f.mission.id,p_review_hash:r.payloadHash,p_decision_id:randomUUID(),p_attempt_id:randomUUID(),p_seal:null,...change});assert.ok(['not_found','conflict'].includes(out.data?.status));}
   const original=await store.load(f.context,f.mission.id),payload=m.O.readOwnerSpecReview(r).payload;
   for(const mutate of [...['/abs','../up','a\\b','a//b'].map(value=>b=>{b.repository.relativePath=value;}),b=>{b.selection.runtimeId='unrecognized';},b=>{b.limits.timeoutMs=0;},b=>{b.limits.timeoutMs=900001;},b=>{b.limits.extra='unapproved';},b=>{b.extra='unapproved';}]){
    const altered=structuredClone(original),p=structuredClone(payload);mutate(altered.input._atelierRun.binding);p.binding=altered.input._atelierRun.binding;
    sql(`update missions set input=${quote(JSON.stringify(altered.input))}::jsonb where id=${quote(f.mission.id)}`);
    const out=await m.db.rpc('prepare_atelier_owner_spec_v2',{p_workspace_id:f.context.workspaceId,p_actor_id:f.context.actorId,p_mission_id:f.mission.id,
     p_expected_updated_at:altered.updatedAt,p_expected_snapshot:m.O.ownerSpecSnapshot(altered),p_payload_json:JSON.stringify(p)});
    assert.equal(out.data?.status,'conflict',JSON.stringify(out));unchanged(f);
   }
   sql(`update missions set input=${quote(JSON.stringify(original.input))}::jsonb where id=${quote(f.mission.id)}`);unchanged(f);
  });
  await step('expired frozen review refuses before approval generation',async()=>{
   const f=await fixture();await f.review();const service=m.V.createOwnerSpecService({store,host:f.host,engine:f.engine,now:()=>Date.now()-299000});const r=await service.command(f.command('review'),f.context);assert.equal(r.status,'reviewed');await new Promise(r=>setTimeout(r,1200));const p=m.O.readOwnerSpecReview(r.review).payload;assert.equal((await store.admit(p,r.review.payloadHash)).status,'approval_required');unchanged(f);
  });
  await step('revoked consumed decision prevents fresh dispatch current-check',async()=>{
   const f=await fixture(),e=await execution(f),before=spawned;sql(`update agent_review_approval_events set revoked_at=clock_timestamp() where id=${quote(e.receipt.decisionId)}`);assert.equal(await store.current(e),false);assert.equal(spawned,before);
  });
  await step('expired consumed decision prevents fresh dispatch current-check',async()=>{
   const f=await fixture(),e=await execution(f);sql(`update agent_review_approval_events set expires_at=clock_timestamp()-interval '1 second' where id=${quote(e.receipt.decisionId)}`);assert.equal(await store.current(e),false);
  });
  const failLedger=(mission)=>sql(`create function public.owner_proof_fail() returns trigger language plpgsql as $$begin if new.mission_id=${quote(mission)} then raise exception 'synthetic ledger failure';end if;return new;end$$;create trigger owner_proof_fail before insert on action_ledger for each row execute function owner_proof_fail();`);
  const clearFailure=()=>sql('drop trigger owner_proof_fail on action_ledger;drop function public.owner_proof_fail();');
  await step('ledger failure rolls back real owner decision + consume + admission on nonempty chain',async()=>{
   assert.ok(saved);const f=await fixture(saved.f.context.workspaceId),r=await f.review(),p=m.O.readOwnerSpecReview(r).payload,before=chain(f.context.workspaceId).length;failLedger(f.mission.id);
   try{assert.equal((await store.admit(p,r.payloadHash)).status,'reconciliation_required');}finally{clearFailure();}unchanged(f);
   // Fail AFTER the actual G1 consume and sealed append, not merely before them.
   sql(`create function public.owner_proof_after_consume() returns trigger language plpgsql as $$begin
    if new.id=${quote(f.mission.id)} and new.input#>'{_atelierOwnerSpecV2,admission}' is not null then
     if not exists(select 1 from agent_review_approval_events where id=(new.input#>>'{_atelierOwnerSpecV2,admission,decisionId}')::uuid and status='consumed' and consumed_at is not null)
      or not exists(select 1 from action_ledger where id=(new.input#>>'{_atelierOwnerSpecV2,admission,ledgerId}')::uuid) then raise exception 'wrong_injection_phase';end if;
     raise exception 'observed_consumed_and_ledger_then_rollback';end if;return new;end$$;
    create trigger owner_proof_after_consume before update on missions for each row execute function owner_proof_after_consume();`);
   let observedError='';const faultDb={from:(...a)=>m.db.from(...a),rpc:async(name,params)=>{const out=await m.db.rpc(name,params);if(out.error)observedError=out.error.message;return out;}};
   try{assert.equal((await m.S.createOwnerSpecStore(faultDb,deps).admit(p,r.payloadHash)).status,'reconciliation_required');assert.match(observedError,/observed_consumed_and_ledger_then_rollback/);}
   finally{sql('drop trigger owner_proof_after_consume on missions;drop function public.owner_proof_after_consume();');}
   unchanged(f);assert.equal(chain(f.context.workspaceId).length,before);
  });
  await step('lost admission acknowledgement survives restart without automatic process replay',async()=>{
   const f=await fixture(),r=await f.review(),before=spawned;const lostDb={from:(...a)=>m.db.from(...a),rpc:async(name,params)=>{const out=await m.db.rpc(name,params);return name==='admit_atelier_owner_spec_v2'?{data:null,error:Error('synthetic lost ack')}:out;}};
   const lost=m.V.createOwnerSpecService({store:m.S.createOwnerSpecStore(lostDb,deps),host:f.host,engine:f.engine});const answer=await lost.command({...f.command('confirm'),expectedReviewHash:r.payloadHash},f.context);assert.equal(answer.status,'reconciliation_required');assert.deepEqual(facts(f),{admitted:true,result:false,decisions:1,ledger:1});
   assert.equal((await m.V.createOwnerSpecService({store}).command(f.command('recover'),f.context)).status,'reconciliation_required');assert.equal(spawned,before);
  });
  await step('tampered artifact is refused and result-ledger failure leaves no canonical result',async()=>{
   const f=await fixture(),e=await execution(f),result=await f.engine.execute(e);assert.equal(result.status,'succeeded');
   const bad=structuredClone(result);bad.evidence.manifest.headSha='b'.repeat(40);assert.equal((await store.record(e,bad)).status,'invalid_request');
   const raw=await m.db.rpc('record_atelier_owner_spec_result_v2',{p_workspace_id:f.context.workspaceId,p_actor_id:f.context.actorId,p_mission_id:f.mission.id,p_attempt_id:e.receipt.attemptId,p_review_hash:e.payloadHash,p_result:bad,p_result_id:randomUUID(),p_seal:null});assert.equal(raw.data?.status,'conflict');
   failLedger(f.mission.id);try{assert.equal((await store.record(e,result)).status,'reconciliation_required');}finally{clearFailure();}
   assert.deepEqual(facts(f),{admitted:true,result:false,decisions:1,ledger:1});const before=spawned;
   // The new process receives only context and an on-disk evidence location, not the result or engine closure.
   const ctx=JSON.stringify({mode:'publish-local',context:f.context,command:f.command('recover'),localRoot:path.join(scratch,'runs')});
   const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--recover-proof'],{cwd:root,encoding:'utf8',timeout:15000,
    env:{PATH:process.env.PATH,NODE_ENV:'test',ORIA_PROOF_RECOVER:ctx}});assert.equal(child.status,0,child.stderr);
   const recovered=JSON.parse(child.stdout.trim().split('\n').at(-1));
   assert.notEqual(recovered.pid,process.pid);assert.equal(recovered.pid,child.pid);
   assert.equal(recovered.status,'recovered');assert.equal(recovered.spawnAttempts,0);assert.equal(recovered.executeAttempts,0);
   assert.equal(recovered.publishedFromLocal,true);assert.equal(recovered.idempotent,true);
   assert.deepEqual(recovered.result,result);assert.equal(recovered.readback.artifact.sha256,result.evidence.sha256);
   assert.equal(spawned,before);assert.deepEqual(facts(f),{admitted:true,result:true,decisions:1,ledger:2});
   assert.equal((await store.record(e,result)).status,'existing');assert.equal(chain(f.context.workspaceId).length,2);
   console.log('OWNER_SPEC_LOCAL_RECOVERY_NEW_PROCESS=1');
  });
  // Extra mandatory qualification, before the shared sealed-writer revert.
  // Its twelve groups do not replace or suppress any of the thirteen owner-spec proofs.
  await runAdmissionProofs({root,sql,db:m.db,env,args});
  await step('actual anon/authenticated RPC denial and revert preserves recorded facts',async()=>{
   for(const role of ['anon','authenticated']){const r=spawnSync('psql',args,{input:`set role ${role};select public.prepare_atelier_owner_spec_v2('x',null,'x',now(),'{}','{}');`,encoding:'utf8',env});assert.notEqual(r.status,0);assert.match(r.stderr,/permission denied/);}
   const before=sql('select count(*) from action_ledger');sql(readFileSync(path.join(root,'db/migrations/drafts/atelier_owner_spec_v2_revert.sql'),'utf8'));assert.equal(sql('select count(*) from action_ledger'),before);assert.equal(sql("select to_regprocedure('public.admit_atelier_owner_spec_v2(text,uuid,text,text,uuid,uuid,jsonb)') is null"),'t');
  });
 }finally{globalThis.fetch=oldFetch;console.log('UNEXPECTED_NETWORK='+counts.unexpected);console.log(JSON.stringify({proofsPassed:results.length,failures,allowedLoopback:counts.allowed,controlledFakeChildLaunches:spawned}));}
 assert.equal(counts.unexpected,0);assert.deepEqual(failures,[]);assert.equal(results.length,13);console.log('ALL 13 OWNER-SPEC REAL-DB FAKE-CLI PROOFS PASSED');
}
const isEntrypoint=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isEntrypoint&&process.argv.includes('--recover-proof')){
 const counts={allowed:0,unexpected:0},fetch=localTransport(counts);globalThis.fetch=fetch;
 const input=JSON.parse(process.env.ORIA_PROOF_RECOVER);
 assert.ok(input.mode===undefined||input.mode==='publish-local');assert.equal(input.command.command,'recover');
 const publishLocal=input.mode==='publish-local';
 if(publishLocal)assert.ok(path.isAbsolute(input.localRoot)&&path.basename(path.dirname(input.localRoot)).startsWith('oria-owner-proof-')&&path.basename(input.localRoot)==='runs');
 const m=await modules(ROOT,fetch);
 // Fence the actual child after module loading. Any process/tool relaunch fails this proof, even if caught by a service.
 let processAttempts=0,executeAttempts=0;
 for(const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])childProcess[name]=()=>{processAttempts++;throw Error('recovery_process_forbidden');};
 syncBuiltinESMExports();
 const store=m.S.createOwnerSpecStore(m.db,{enabled:()=>publishLocal,hmacKey:()=>SYNTHETIC_KEY});
 let engine;
 if(publishLocal){
  const before=await store.load(input.context,input.command.missionId);
  assert.ok(before.input._atelierOwnerSpecV2.admission);assert.equal(before.input._atelierOwnerSpecV2.result,undefined);
  assert.equal(before.result?.atelierOwnerSpecV2,undefined);
  const local=m.E.createBoundSpecEngine({root:input.localRoot,env:{},provider:null});
  engine={recover:local.recover,execute:async()=>{executeAttempts++;throw Error('recovery_execute_forbidden');}};
 }
 const service=m.V.createOwnerSpecService({store,...(engine?{engine}:{})});const result=await service.command(input.command,input.context);
 assert.equal(result.status,'recovered');
 if(publishLocal){const again=await service.command(input.command,input.context);assert.deepEqual(again,result);}
 assert.equal(processAttempts,0);assert.equal(executeAttempts,0);
 const mission=await store.load(input.context,input.command.missionId),readback=m.R.readOwnerSpecEvidence(mission,input.context);
 assert.equal(readback.state,'recorded');assert.equal(readback.status,'succeeded');
 const require=createRequire(path.join(ROOT,'package.json')),{createElement}=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const html=renderToStaticMarkup(createElement(m.P.MissionResultPanel,{source:'supabase',showAtelierLink:false,
  output:{missionId:mission.id,state:'empty',text:null,receipt:null,process:null,atelierSpec:readback}}));
 assert.ok(html.includes('Spécification Atelier enregistrée'));assert.ok(html.includes('Télécharger SPEC.md'));
 const escapedSpec=renderToStaticMarkup(createElement('span',null,readback.artifact.text)).slice(6,-7);
 assert.ok(html.includes(escapedSpec),'the persisted SPEC bytes must be rendered as escaped text');
 assert.ok(html.includes(readback.artifact.sha256));assert.ok(!/Lancer|Enregistrer l’autorisation/.test(html));
 assert.equal(counts.unexpected,0);console.log(JSON.stringify({...result,readback,rendered:true,pid:process.pid,spawnAttempts:processAttempts,executeAttempts,publishedFromLocal:publishLocal,idempotent:publishLocal}));
}else if(isEntrypoint&&process.argv.includes('--run'))await main(ROOT,{pg:process.env.CI_PG_URL,rest:process.env.POSTGREST_DIRECT_URL});
