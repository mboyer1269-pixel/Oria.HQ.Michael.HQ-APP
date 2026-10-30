import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { APPROVAL_PROOF_IDS, inspectApprovalProofReadiness, readApprovalProofReadiness, assertCompletedApprovalProofs } from './approval-proof-readiness.mjs';
const fixture=()=>({runnerSource:APPROVAL_PROOF_IDS.map(id=>`await step("${id}. synthetic", async()=>{});`).join('\n'),
 workflowSource:"grep -Fx 'ALL 10 REAL-DB PROOFS PASSED' /tmp/test.log",
 schemaSql:['create function public.consume_approval_decision() returns void;','create or replace function public.classify_approval_decision() returns void;','create function public.create_approval_decision() returns void;']});
test('static readiness inventories every distinct proof including2a/2b, never DB evidence',()=>{
 const r=inspectApprovalProofReadiness(fixture());assert.equal(r.ready,true);assert.equal(r.expectedProofCount,10);
 assert.deepEqual(r.proofIds,['1','2a','2b','3','4','5','6','7','8','9']);assert.equal(r.dbExecuted,false);assert.deepEqual(r.blockers,[]);
});
test('draft producer is included only in disposable schema; declarations are not DB proof',()=>{
 const r=readApprovalProofReadiness(process.cwd());assert.equal(r.ready,true);assert.equal(r.expectedProofCount,10);
 assert.deepEqual(r.missingFunctions,[]);assert.deepEqual(r.unavailableProofIds,[]);
 assert.deepEqual(r.schemaReadyProofIds,APPROVAL_PROOF_IDS);
 const missing=fixture();missing.schemaSql=missing.schemaSql.slice(0,1);const notReady=inspectApprovalProofReadiness(missing);
 assert.deepEqual(notReady.missingFunctions,['classify_approval_decision','create_approval_decision']);assert.deepEqual(notReady.unavailableProofIds,['8','9']);
 assert.equal(r.dbExecuted,false);assert.equal(r.ciExpectedProofCount,10);
});
test('wrong count, dropped/duplicated proof and comment-only schema declarations fail closed',()=>{
 for(const count of [7,8,9]){const f=fixture();f.workflowSource=f.workflowSource.replace('ALL 10','ALL '+count);const r=inspectApprovalProofReadiness(f);assert.equal(r.ready,false);assert.ok(r.blockers.includes('ci_proof_count_mismatch'));}
 for(const code of ['','await step("8. dropped other proofs",async()=>{});',fixture().runnerSource+'\nawait step("9. duplicate",async()=>{});']){
  const r=inspectApprovalProofReadiness({...fixture(),runnerSource:code});assert.equal(r.ready,false);assert.ok(r.blockers.includes('proof_inventory_mismatch'));
 }
 const f=fixture();f.schemaSql=f.schemaSql.map(s=>'-- '+s+'\n/* '+s+' */');assert.equal(inspectApprovalProofReadiness(f).ready,false);
});
test('CLI reports only source prerequisites without needing database, provider or secrets',()=>{
 const child=spawnSync(process.execPath,['proofs/approval-proof-readiness.mjs','--check',process.cwd()],{encoding:'utf8',env:{NODE_ENV:'test'},timeout:5000});
 assert.equal(child.status,0);assert.equal(child.signal,null);const r=JSON.parse(child.stdout.trim());
 assert.equal(r.status,'source_prerequisites_present');assert.equal(r.dbExecuted,false);assert.deepEqual(r.unavailableProofIds,[]);
 assert.doesNotMatch(child.stdout,/ALL \d+ REAL-DB PROOFS PASSED/);
});
test('a partial or reordered run can never emit complete proof acceptance',()=>{
 const complete=APPROVAL_PROOF_IDS.map(id=>`${id}. proven`);assertCompletedApprovalProofs(complete);
 for(const bad of [complete.slice(0,7),complete.slice(0,8),complete.slice(0,9),[...complete].reverse(),[...complete,complete[0]]])assert.throws(()=>assertCompletedApprovalProofs(bad));
});
test('actual direct runner stops before any socket or child command on arbitrary target',()=>{
 const sentinel=`import http from 'node:http';import net from 'node:net';import cp from 'node:child_process';import{syncBuiltinESMExports}from'node:module';const deny=()=>{throw Error('UNEXPECTED_EFFECT_BEFORE_PREFLIGHT');};http.createServer=deny;net.connect=deny;cp.spawn=deny;cp.spawnSync=deny;globalThis.fetch=deny;syncBuiltinESMExports();`;
 const child=spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(sentinel),'proofs/prove-approval-real-db.mjs'],{
  encoding:'utf8',env:{NODE_ENV:'test',HQ_ROOT:process.cwd(),POSTGREST_DIRECT_URL:'http://127.0.0.1:9',PSQL_CMD:'never-run'},timeout:5000});
 assert.equal(child.status,1);assert.match(child.stderr,/APPROVAL_PROOF_TARGET_REFUSED/);
 assert.doesNotMatch(child.stderr,/UNEXPECTED_EFFECT_BEFORE_PREFLIGHT/);assert.doesNotMatch(child.stdout,/PROVEN \(real DB\)|ALL \d+/);
});
test('both direct runner and shell gate preflight before gateway, psql or schema apply; success requires exact inventory',()=>{
 const runner=readFileSync(new URL('./prove-approval-real-db.mjs',import.meta.url),'utf8');
 const shell=readFileSync(new URL('./run-approval-real-db.sh',import.meta.url),'utf8');
 assert.ok(runner.indexOf('assertApprovalProofReadiness(ROOT)')<runner.indexOf('const REST ='));
 assert.ok(runner.includes('assertCompletedApprovalProofs(results)'));
 assert.ok(shell.indexOf('approval-proof-readiness.mjs')<shell.indexOf('apply_schema()'));
 assert.equal((runner.match(/await step\(/g)||[]).length,10);assert.doesNotMatch(runner,/\.skip\(|continue-on-error/);
});
