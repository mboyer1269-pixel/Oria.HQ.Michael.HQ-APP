import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{allowedRequest}from'./prove-owner-spec-real-db.mjs';import{localConfig}from'./prove-atelier-boundary-real-db.mjs';
test('owner proof target is strictly named disposable loopback without password or redirect',()=>{assert.ok(localConfig('postgres://postgres@127.0.0.1:5432/oria_test_owner_spec','http://127.0.0.1:3000'));for(const pg of ['postgres://postgres@remote:5432/oria_test_owner_spec','postgres://postgres@127.0.0.1:5432/production','postgres://postgres:secret@127.0.0.1:5432/oria_test_owner_spec'])assert.throws(()=>localConfig(pg,'http://127.0.0.1:3000'));});
test('only exact read missions and reviewed RPC endpoints reach loopback',()=>{assert.ok(allowedRequest('http://127.0.0.1:3000/rpc/admit_atelier_owner_spec_v2',{method:'POST'}));assert.ok(allowedRequest('http://127.0.0.1:3000/missions?select=*&workspace_id=eq.workspace-a&id=eq.11111111-1111-4111-8111-111111111111'));for(const url of ['https://remote/rpc/admit_atelier_owner_spec_v2','http://127.0.0.1:3000/rpc/other','http://127.0.0.1:3000/rpc/admit_atelier_owner_spec_v2?x=1','http://127.0.0.1:3000/missions?select=*'])assert.equal(allowedRequest(url,{method:'POST'}),false);});
test('atomic admission adds only exact RPCs in the same isolated database and remains mandatory',()=>{
 for(const name of ['create_approval_decision','classify_approval_decision','admit_execution_intent_v1','check_execution_intent_admission_v1']){
  assert.ok(allowedRequest('http://127.0.0.1:3000/rpc/'+name,{method:'POST'}));
  assert.equal(allowedRequest('http://127.0.0.1:3000/rpc/'+name,{method:'GET'}),false);
  assert.equal(allowedRequest('http://127.0.0.1:3000/rpc/'+name+'?x=1',{method:'POST'}),false);
 }
 const source=readFileSync(new URL('./prove-owner-spec-real-db.mjs',import.meta.url),'utf8');
 assert.ok(source.includes('await runAdmissionProofs({root,sql,db:m.db,env,args})'));
 const workflow=readFileSync(new URL('../.github/workflows/atelier-owner-spec-proof.yml',import.meta.url),'utf8');
 assert.ok(workflow.includes("grep -Fx 'ALL 12 EXECUTION-INTENT ADMISSION REAL-DB PROOFS PASSED'"));
 assert.ok(workflow.includes("grep -Fx 'ADMISSION_WAITERS=2'"));
});
test('13 mandatory proofs include observed race, restart process and no provider credentials',()=>{const source=readFileSync(new URL('./prove-owner-spec-real-db.mjs',import.meta.url),'utf8');assert.equal((source.match(/await step\('/g)||[]).length,13);assert.ok(source.includes('assert.equal(results.length,13)'));assert.ok(source.includes('assert.deepEqual(failures,[])'));assert.ok(source.includes('pg_blocking_pids'));assert.ok(source.includes("'--recover-proof'"));assert.doesNotMatch(source,/\.skip\(|shell:\s*true/);const job=readFileSync(new URL('../.github/workflows/atelier-owner-spec-proof.yml',import.meta.url),'utf8');assert.ok(job.includes('contents: read'));assert.ok(job.includes('persist-credentials: false'));assert.ok(job.includes('postgres:16.4-alpine'));assert.ok(job.includes('postgrest/postgrest:v12.2.0'));assert.doesNotMatch(job,/secrets\.|pull_request_target|workflow_dispatch|supabase\.co/);});

test('unpublished local artifact recovery uses a fresh process rather than a fresh service instance',()=>{
 const source=readFileSync(new URL('./prove-owner-spec-real-db.mjs',import.meta.url),'utf8');
 const recovery=source.slice(source.indexOf("await step('tampered artifact"),source.indexOf('// Extra mandatory qualification'));
 assert.match(recovery,/spawnSync\(process\.execPath/,'publication recovery must run in a separate Node process');
 assert.match(recovery,/'--recover-proof'/);
 assert.match(recovery,/mode:\s*'publish-local'/);
 assert.match(recovery,/assert\.notEqual\(recovered\.pid,process\.pid\)/);
 assert.match(recovery,/assert\.equal\(recovered\.spawnAttempts,0\)/);
 assert.match(recovery,/assert\.deepEqual\(recovered\.result,result\)/);
 assert.match(recovery,/admitted:true,result:true,decisions:1,ledger:2/);
 assert.doesNotMatch(recovery,/const restarted=m\.V\.createOwnerSpecService/);
});

test('recovery child is provider-free, refuses process creation, and repeats only evidence recovery',()=>{
 const source=readFileSync(new URL('./prove-owner-spec-real-db.mjs',import.meta.url),'utf8');
 const child=source.slice(source.indexOf("if(isEntrypoint&&process.argv.includes('--recover-proof'))"));
 assert.match(child,/provider:null/);
 assert.match(child,/recovery_process_forbidden/);
 assert.match(child,/syncBuiltinESMExports\(\)/);
 assert.match(child,/assert\.equal\(before\.input\._atelierOwnerSpecV2\.result,undefined\)/);
 assert.match(child,/assert\.deepEqual\(again,result\)/);
 assert.match(child,/spawnAttempts:processAttempts/);
 assert.match(child,/enabled:\(\)=>publishLocal/);
 assert.match(child,/hmacKey:\(\)=>SYNTHETIC_KEY/);
});
