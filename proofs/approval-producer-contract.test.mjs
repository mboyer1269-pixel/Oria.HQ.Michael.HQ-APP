import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';
const file='db/migrations/drafts/approval_decision_producer_v1.sql';
const sql=()=>{assert.ok(existsSync(file),'reviewable producer SQL exists');return readFileSync(file,'utf8');};
test('producer is an invoker-only draft with explicit role revocations and no new policy',()=>{
 const s=sql();assert.equal((s.match(/create function public\./g)||[]).length,2);assert.equal((s.match(/security invoker/g)||[]).length,2);
 assert.doesNotMatch(s,/security definer|create policy|alter table|grant .* to (anon|authenticated)|update public\.|delete from public\./i);
 for(const name of ['classify_approval_decision','create_approval_decision']){assert.match(s,new RegExp(`revoke all on function public\\.${name}\\([^;]+from public, anon, authenticated`));assert.match(s,new RegExp(`grant execute on function public\\.${name}\\([^;]+to service_role`));}
});
test('create locks real intent then validates exact snapshot before any insert; never consumes',()=>{
 const s=sql().split('create function public.create_approval_decision')[1];
 assert.match(s,/agent_execution_intents[\s\S]+workspace_id = p_workspace_id[\s\S]+intent_id = p_intent_id[\s\S]+for update/i);
 assert.ok(s.indexOf('for update')<s.indexOf('insert into'));assert.match(s,/p_expected_snapshot is distinct from/);assert.match(s,/payload is distinct from p_payload_json::jsonb/);assert.match(s,/sha256\(convert_to\(p_payload_json,'UTF8'\)\)/);
 assert.match(s,/p_confirmed is distinct from true/);assert.match(s,/interval '10 minutes'/);assert.match(s,/already_decided/);assert.doesNotMatch(s,/perform.*consume_approval|select.*consume_approval/);
});
test('classification is observation only, with revocation/consumption/expiry and mandatory flags',()=>{
 const s=sql().split('create function public.create_approval_decision')[0];
 for(const token of ['revoked_at','consumed_at','expires_at','ledger_required_before_execution','no_runtime_execution_authorized','no_auto_approval','approval_event_only','executionAuthorized','p_actor_id'])assert.ok(s.includes(token),token);
 assert.doesNotMatch(s,/insert into|update public\.|delete from/i);
});
test('real DB proof target preflight refuses non-loopback or arbitrary psql before any effect',async()=>{
 const {assertApprovalProofTarget}=await import('./approval-proof-readiness.mjs');
 assert.equal(typeof assertApprovalProofTarget,'function');
 assert.doesNotThrow(()=>assertApprovalProofTarget('http://127.0.0.1:3000','psql postgres://postgres@127.0.0.1:5432/postgres -X -q -v ON_ERROR_STOP=1'));
 for(const rest of ['https://example.test','http://localhost:3000','http://127.0.0.1:3000/remote','http://x@127.0.0.1:3000','http://127.0.0.1:3000?x'])assert.throws(()=>assertApprovalProofTarget(rest,'psql postgres://postgres@127.0.0.1:5432/postgres -X -q -v ON_ERROR_STOP=1'));
 for(const command of ['psql postgres://postgres@remote:5432/postgres','sh unsafe','psql postgres://postgres@127.0.0.1:5432/prod -X -q -v ON_ERROR_STOP=1'])assert.throws(()=>assertApprovalProofTarget('http://127.0.0.1:3000',command));
});

test('verification fails closed on absent search_path and queued DB proof retains real lifecycle negatives',()=>{
 const verify=readFileSync('db/migrations/drafts/approval_decision_producer_v1_verify.sql','utf8');assert.match(verify,/proconfig[\s\S]*is distinct from true/);
 const cases=readFileSync('proofs/approval-producer-real-db-cases.mjs','utf8');
 for(const fact of ['producer.command(command)','OBSERVED_APPROVAL_PRODUCER_WAITERS=2','pg_blocking_pids','already_decided','proof_after_approval_insert','assert.rejects','consumed','revoked','expired'])assert.ok(cases.includes(fact),fact);
 assert.doesNotMatch(cases,/\.skip\(|continue-on-error/);
});
