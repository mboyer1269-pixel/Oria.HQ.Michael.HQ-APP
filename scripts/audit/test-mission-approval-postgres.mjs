// Explicit isolated PostgreSQL verification; never opens a production connection.
import { spawnSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const name=`hq-approval-test-${process.pid}`;
function docker(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||r.stdout);return r.stdout.trim();}
const sql=text=>docker(['exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-At'],text);
function concurrent(text){return new Promise((resolve,reject)=>{const child=spawn('docker',['exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-At']);let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.on('error',reject);child.on('exit',code=>code===0?resolve(out):reject(Error(err)));child.stdin.end(text);});}
const actor='11111111-1111-4111-8111-111111111111';
const first='22222222-2222-4222-8222-222222222222';
const second='33333333-3333-4333-8333-333333333333';
const version='2026-10-01T00:00:00Z';
const binding={version:1,missionVersion:version,launch:{missionId:'mission',workspaceId:'w',launchHash:'a'.repeat(64)},access:{workspaceId:'w',modelId:'logical-profile'}};
const record=(id,status='approved')=>JSON.stringify({id,missionId:'mission',status,approvedBy:actor,expiresAt:new Date(Date.now()+600000).toISOString(),binding});
const decide=(id,prior='null',status='approved')=>`select commit_mission_approval_decision('w','mission','${version}',${prior},'${record(id,status)}'::jsonb);`;
try {
 docker(['run','--pull','never','-d','--rm','--name',name,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16-alpine']);
 let ready=false;for(let i=0;i<40;i++){const r=spawnSync('docker',['exec',name,'pg_isready','-U','postgres']);if(r.status===0){ready=true;break;}await new Promise(r=>setTimeout(r,250));}assert.ok(ready);
 sql(`create role anon;create role authenticated;create role service_role bypassrls;
 create table public.missions(id text primary key,workspace_id text,updated_at timestamptz,input jsonb default '{}');
 create table public.action_ledger(id uuid primary key,user_id uuid,workspace_id text,mission_id text,action_type text,event_type text,summary text,autonomy_level int,requires_confirmation bool,payload jsonb,metadata jsonb,model_id text,cost_mode text);`);
 sql(readFileSync('db/migrations/0015_mission_approvals.sql','utf8'));
 sql(readFileSync('db/migrations/0030_mission_approval_binding.sql','utf8'));
 sql(`grant select,insert,update on public.missions,public.mission_approvals,public.action_ledger to service_role;
 insert into missions values('mission','w','${version}','{}');`);
 assert.equal(sql(`select has_function_privilege('anon','public.commit_mission_approval_decision(text,text,timestamptz,text,jsonb)','execute');`),'f');
 assert.equal(sql(`select has_function_privilege('authenticated','public.commit_mission_approval_decision(text,text,timestamptz,text,jsonb)','execute');`),'f');
 assert.equal(sql(`select commit_mission_approval_decision('foreign','mission','${version}',null,'${record(first)}');`),'f');
 assert.equal(sql(`select commit_mission_approval_decision('w','mission','2000-01-01',null,'${record(first)}');`),'f');
 // A failed ledger insertion must roll back the approval in the same transaction.
 sql(`alter table action_ledger add constraint synthetic_ledger_failure check (false);
 do $$ begin
  begin perform commit_mission_approval_decision('w','mission','${version}',null,'${record(first)}');raise exception 'unexpected_success';
  exception when check_violation then null;end;
 end $$;`);
 assert.equal(sql('select count(*) from mission_approvals;'),'0');
 sql('alter table action_ledger drop constraint synthetic_ledger_failure;');
 // Two real DB sessions, not a fake async repository. Exactly one records a decision.
 const results=await Promise.all([concurrent(`begin;set local role service_role;${decide(first)}select pg_sleep(0.15);commit;`),concurrent(`begin;set local role service_role;${decide(second)}commit;`)]);
 assert.equal(results.filter(x=>x.split('\n').includes('t')).length,1);
 assert.equal(sql('select count(*) from mission_approvals;'),'1');assert.equal(sql('select count(*) from action_ledger;'),'1');
 const winner=sql('select id from mission_approvals;');
 const claim={state:'claimed',approvalRecordId:winner,actorId:actor,launchHash:'a'.repeat(64)};
 for(const altered of [{...claim,approvalRecordId:second===winner?first:second},{...claim,launchHash:'b'.repeat(64)},{...claim,actorId:'wrong-owner'}]){
  sql(`do $$ begin begin update missions set input=jsonb_build_object('_openhandsLaunch','${JSON.stringify(altered)}'::jsonb) where id='mission';raise exception 'unexpected_claim';
    exception when others then if sqlerrm <> 'mission_execution_approval_changed' then raise;end if;end;end $$;`);
 }
 sql(`set role service_role;update missions set input=jsonb_build_object('_openhandsLaunch','${JSON.stringify(claim)}'::jsonb) where id='mission';`);
 // Race revocation against creation request. A creation request can commit only
 // before revocation; after both settle, the next start is always refused.
 const revoked='44444444-4444-4444-8444-444444444444';
 await Promise.all([concurrent(`begin;${decide(revoked,`'${winner}'`,'revoked')}select pg_sleep(0.15);commit;`),
  concurrent(`do $$ begin update missions set input=jsonb_set(input,'{_openhandsLaunch,state}','"creation_requested"') where id='mission'; exception when others then if sqlerrm <> 'mission_execution_approval_changed' then raise; end if; end $$;`)]);
 assert.equal(sql(`select status from mission_approvals order by decision_sequence desc limit 1;`),'revoked');
 sql(`do $$ begin
  begin update missions set input=jsonb_set(input,'{_openhandsLaunch,state}','"start_requested"') where id='mission';raise exception 'unexpected_start';
  exception when others then if sqlerrm <> 'mission_execution_approval_changed' then raise;end if;end;
 end $$;`);
 // Observation and result reconciliation remain writable, without inventing stop.
 sql(`update missions set input=jsonb_set(input,'{_openhandsLaunch,state}','"execution_finished"') where id='mission';`);
 assert.equal(sql('select count(*) from action_ledger;'),'2');
 console.log('PostgreSQL 16 PASS: real 0015 + 0030, role denial, workspace/stale CAS, concurrent decision, queued revocation race, result observation.');
} finally {try{docker(['rm','-f',name]);}catch{}}
