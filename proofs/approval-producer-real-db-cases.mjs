/** Imported by the existing disposable proof ONLY. No import-time effects.
 * Real PG persistence; owner identity is a named synthetic DI boundary, not live auth.
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
const pause=()=>new Promise(r=>setTimeout(r,10));
export async function proveApprovalProducer({sql,PSQL,createIntent,stableStringify,hashOf,actorId,workspaceId,producer}){
 const [cmd,...args]=PSQL.split(' ');
 const run=statement=>{const p=spawn(cmd,[...args,'-At','-c',"set statement_timeout='8s';"+statement],{stdio:['ignore','pipe','pipe']});let out='',err='';
  p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);const timer=setTimeout(()=>p.kill('SIGTERM'),10000);
  return new Promise((resolve,reject)=>{p.on('error',e=>{clearTimeout(timer);reject(e);});p.on('close',code=>{clearTimeout(timer);if(code===0)resolve(JSON.parse(out.trim()));else reject(Error(err||'proof child failed'));});});};
 const make=async tag=>{const intentId=await createIntent(tag);const row=JSON.parse(sql(`select to_jsonb(i) from agent_execution_intents i where workspace_id=${quote(workspaceId)} and intent_id=${quote(intentId)}`));
  const payloadJson=stableStringify(row.payload),payloadHash=hashOf(row.payload),requestId=randomUUID();
  const snapshot={agentId:row.agent_id,skillId:row.skill_id,toolName:row.tool_name,autonomyLevel:row.autonomy_level,payload:row.payload};
  return{intentId,requestId,payloadJson,payloadHash,snapshot,rationale:'Explicit synthetic owner confirmation for disposable proof',expiresAt:JSON.parse(sql("select to_jsonb(clock_timestamp()+interval '5 minutes')"))};};
 const call=(f,extra={})=>{const v={...f,...extra};return `set role qualification_service;select public.create_approval_decision(${quote(v.workspaceId??workspaceId)},${quote(v.actorId??actorId)}::uuid,${quote(v.intentId)},${quote(v.requestId)}::uuid,${quote(v.payloadHash)},${quote(v.payloadJson)},${quote(JSON.stringify(v.snapshot))}::jsonb,${v.confirmed===false?'false':'true'},${quote(v.rationale)},${quote(v.expiresAt)}::timestamptz)`;};
 const result=(f,extra)=>JSON.parse(sql(call(f,extra)));
 const classify=f=>JSON.parse(sql(`set role qualification_service;select public.classify_approval_decision(${quote(workspaceId)},${quote(actorId)}::uuid,${quote(f.intentId)},${quote(f.requestId)}::uuid,${quote(f.payloadHash)})`));
 const facts=f=>JSON.parse(sql(`select jsonb_build_object('intent',to_jsonb(i),'decisions',(select coalesce(jsonb_agg(to_jsonb(d) order by id),'[]') from agent_review_approval_events d where workspace_id=i.workspace_id and intent_id=i.intent_id),'ledger',(select coalesce(jsonb_agg(to_jsonb(l) order by id),'[]') from action_ledger l where metadata->>'intentId'=i.intent_id)) from agent_execution_intents i where workspace_id=${quote(workspaceId)} and intent_id=${quote(f.intentId)}`));
 const positive=await make('producer-ts');
 const review=await producer.command({command:'review',intentId:positive.intentId});assert.equal(review.status,'reviewed');
 assert.equal(review.review.expectedIntentHash,hashOf({workspaceId,actorId,intentId:positive.intentId,snapshot:positive.snapshot}));
 const command={expectedIntentHash:review.review.expectedIntentHash,command:'confirm',intentId:positive.intentId,requestId:positive.requestId,expectedPayloadHash:positive.payloadHash,confirmed:true,rationale:positive.rationale,expiresAt:positive.expiresAt};
 const before=facts(positive),created=await producer.command(command);
 assert.equal(created.status,'recorded',JSON.stringify(created));assert.equal(created.decision.executionAuthorized,false);assert.equal(created.decision.state,'approved');
 const after=facts(positive);assert.equal(after.decisions.length,1);assert.deepEqual(after.intent,before.intent);assert.deepEqual(after.ledger,before.ledger);
 assert.equal(after.decisions[0].consumed_at,null);for(const k of ['ledger_required_before_execution','no_runtime_execution_authorized','no_auto_approval','approval_event_only'])assert.equal(after.decisions[0][k],true);
 assert.equal(result(positive).status,'existing');assert.deepEqual(facts(positive),after);
 assert.equal(result(positive,{rationale:'changed'}).status,'conflict');assert.deepEqual(facts(positive),after);
 const cross=await make('producer-collision');assert.equal(result(cross,{requestId:positive.requestId}).status,'conflict');assert.equal(facts(cross).decisions.length,0);
 const bad=await make('producer-refusals'),badBefore=facts(bad);
 for(const extra of [{confirmed:false},{payloadHash:'0'.repeat(64)},{snapshot:{...bad.snapshot,toolName:'tampered'}},{payloadJson:'{}'},{expiresAt:'2000-01-01T00:00:00Z'},{expiresAt:'2100-01-01T00:00:00Z'}])assert.ok(['conflict','invalid_request'].includes(result(bad,extra).status));
 assert.equal(result(bad,{workspaceId:'foreign'}).status,'not_found');assert.equal(result(bad,{intentId:'missing-intent'}).status,'not_found');assert.deepEqual(facts(bad),badBefore);
 // Both independent sessions must be observed waiting on the same locked intent.
 const race=await make('producer-concurrent'),raceBefore=facts(race);const blocker=spawn(cmd,[...args,'-At'],{stdio:['pipe','pipe','pipe']});let output='',error='';
 blocker.stdout.on('data',b=>output+=b);blocker.stderr.on('data',b=>error+=b);
 const timer=setTimeout(()=>blocker.kill('SIGTERM'),12000),done=new Promise((resolve,reject)=>{blocker.on('error',reject);blocker.on('close',code=>{clearTimeout(timer);if(code===0)resolve();else reject(Error(error||'blocker failed'));});});done.catch(()=>{});
 blocker.stdin.write(`begin;set local statement_timeout='8s';select id from agent_execution_intents where workspace_id=${quote(workspaceId)} and intent_id=${quote(race.intentId)} for update;select 'LOCK:'||pg_backend_pid();\n`);
 let pending,outputs;
 try{
  let lock;const deadline=Date.now()+5000;while(!(lock=/LOCK:(\d+)/.exec(output))){assert.ok(Date.now()<deadline,'intent blocker unavailable');await pause();}
  pending=Promise.all([run(call(race)),run(call(race,{requestId:randomUUID()}))]);pending.catch(()=>{});
  let count=0;const waitDeadline=Date.now()+5000;while(count<2){count=Number(sql(`with recursive blocked(pid) as(select pid from pg_stat_activity where ${Number(lock[1])}=any(pg_blocking_pids(pid)) union select a.pid from pg_stat_activity a join blocked b on b.pid=any(pg_blocking_pids(a.pid))) select count(distinct a.pid) from pg_stat_activity a join blocked b using(pid) where a.datname=current_database() and a.wait_event_type='Lock' and a.query like '%public.create_approval_decision%'`));assert.ok(Date.now()<waitDeadline,'two producer waiters not observed');if(count<2)await pause();}
  assert.deepEqual(facts(race),raceBefore);console.log('OBSERVED_APPROVAL_PRODUCER_WAITERS=2');
 }finally{blocker.stdin.end('rollback;\n');await done;outputs=pending?await pending:undefined;}
 assert.ok(outputs);assert.deepEqual(outputs.map(x=>x.status).sort(),['already_decided','created']);const raced=facts(race);assert.equal(raced.decisions.length,1);assert.deepEqual(raced.intent,raceBefore.intent);assert.deepEqual(raced.ledger,raceBefore.ledger);
 // Historical decisions are never reactivated, even when a new request is presented.
 sql(`select count(*) from consume_approval_decision(${quote(workspaceId)},${quote(positive.requestId)}::uuid,${quote(positive.intentId)},${quote(positive.payloadHash)})`);
 assert.equal(classify(positive).state,'consumed');assert.equal(result(positive,{requestId:randomUUID()}).status,'already_decided');
 for(const state of ['revoked','expired']){const f=await make('producer-'+state);assert.equal(result(f).status,'created');
  sql(state==='revoked'?`update agent_review_approval_events set revoked_at=clock_timestamp() where id=${quote(f.requestId)}::uuid`:`update agent_review_approval_events set created_at=clock_timestamp()-interval '1 minute',expires_at=clock_timestamp() where id=${quote(f.requestId)}::uuid`);
  assert.equal(classify(f).state,state);assert.equal(result(f,{requestId:randomUUID()}).status,'already_decided');assert.equal(facts(f).decisions.length,1);
 }
 // Force failure AFTER the event is visible to an AFTER INSERT trigger. The
 // statement must roll that insert back and leave intent/action-ledger intact.
 const rollback=await make('producer-rollback'),rollbackBefore=facts(rollback);
 sql(`create function public.proof_reject_approval_insert() returns trigger language plpgsql as $$begin
  if new.intent_id=${quote(rollback.intentId)} then
   if not exists(select 1 from agent_review_approval_events where id=new.id) then raise exception 'proof_insert_not_observed'; end if;
   raise exception 'proof_after_approval_insert';
  end if;return new;end $$;
  create trigger proof_reject_approval_insert after insert on agent_review_approval_events for each row execute function public.proof_reject_approval_insert();`);
 try{await assert.rejects(run(call(rollback)),/proof_after_approval_insert/);}
 finally{sql('drop trigger proof_reject_approval_insert on agent_review_approval_events;drop function public.proof_reject_approval_insert();');}
 assert.deepEqual(facts(rollback),rollbackBefore);
 const recover=await producer.command({command:'recover',intentId:positive.intentId,requestId:positive.requestId,expectedPayloadHash:positive.payloadHash});assert.equal(recover.status,'observed');assert.equal(recover.decision.state,'consumed');
 console.log('APPROVAL_PRODUCER_ASSERTIONS=canonical_ts_rpc,no_dispatch,replay,collision,invalid,foreign,missing,observed_race,consumed,revoked,expired,post_insert_rollback,read_only_recovery');
}
