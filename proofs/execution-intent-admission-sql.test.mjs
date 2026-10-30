import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base = new URL('../db/migrations/drafts/', import.meta.url);
const read = suffix => readFileSync(new URL(`execution_intent_admission_v1${suffix}.sql`, base), 'utf8');
// Source contracts only. These tests do not parse or execute SQL and do not prove DB atomicity.
function enforce(source) {
  const admission = source.slice(source.indexOf('create function public.admit_execution_intent_v1'));
  const positions = ['for update;', "pg_advisory_xact_lock(hashtextextended('atelier-ledger:'", 'for update;', 'public.consume_approval_decision(', 'public.append_atelier_owner_spec_ledger_v2(', 'update public.agent_execution_intents', 'public.check_execution_intent_admission_v1('];
  let cursor = 0;
  for (const token of positions) { const next = admission.indexOf(token, cursor); assert.ok(next >= cursor, `ordered boundary missing: ${token}`); cursor = next + token.length; }
  assert.match(admission, /observed->>'state' is distinct from 'approved'/);
  assert.match(admission, /i.status is distinct from 'pending' or i.action_ref is not null/);
  assert.ok((admission.match(/expires_at<=clock_timestamp\(\)/g) ?? []).length >= 2);
  assert.match(admission, /raise exception 'execution_intent_admission_append_failed'/);
  assert.match(admission, /raise exception 'execution_intent_admission_postcondition_failed'/);
  const afterConsume = admission.slice(admission.indexOf('public.consume_approval_decision('));
  assert.doesNotMatch(afterConsume, /return jsonb_build_object\('status','(?:conflict|approval_required|invalid_request|not_found)'/);
  assert.doesNotMatch(source, /exception when others|security definer|create table|alter table|grant .* to (?:public|anon|authenticated)/i);
}
test('atomic admission source preserves lock ordering and rollback-only post-effect failures', () => {
 const source=read(''); enforce(source);
 for (const [token,replacement] of [["'atelier-ledger:'","'other-lock:'"],["raise exception 'execution_intent_admission_append_failed'","return jsonb_build_object('status','conflict')"],["observed->>'state' is distinct from 'approved'","false"]]) assert.throws(()=>enforce(source.replace(token,replacement)));
});
test('check RPC stays read-only and scope/source/provenance/seal fields are explicit',()=>{
 const source=read('');const check=source.slice(source.indexOf('create function public.check_execution_intent_admission_v1'),source.indexOf('create function public.admit_execution_intent_v1'));
 assert.doesNotMatch(check,/for update|pg_advisory|\b(insert into|update public|delete from)\b|consume_approval_decision\(/i);
 for(const token of ['classify_approval_decision','p_source_json::jsonb','p_payload_json::jsonb',"'requiresCeoApproval',true","'consumed'",'expires_at<=clock_timestamp()',"'attempt:'||p_attempt_id::text","'workspace_owner'","'actualAgentId'","'actualSkillId'","'execution_intent.owner_admitted'","'payload','{}'::jsonb",'canonical_version is distinct from 1'])assert.ok(check.includes(token),token);
 assert.ok(check.includes("jsonb_build_object('agent_id',null,'skill_id',null)||to_jsonb(l)"));
 assert.match(source,/octet_length\(p_payload_json\) not between 1 and 64000/);assert.match(source,/octet_length\(p_source_json\) not between 1 and 70000/);
 assert.ok(source.includes("'public.consume_approval_decision(text,uuid,text,text)'"));
 assert.ok(source.includes("'public.append_atelier_owner_spec_ledger_v2(text,jsonb,jsonb)'"));
 assert.equal((source.match(/grant execute on function/g)||[]).length,2);
});
test('verification and rollback preserve data and expose only service RPCs',()=>{
 const verify=read('_verify'),revert=read('_revert');
 assert.match(verify,/has_function_privilege/);assert.match(verify,/prosecdef/);assert.match(verify,/proconfig/);assert.match(verify,/aclexplode/);
 assert.doesNotMatch(revert,/drop table|delete from|truncate|cascade/i);assert.equal((revert.match(/drop function/g)||[]).length,2);
});
