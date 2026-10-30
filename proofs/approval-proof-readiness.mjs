/** Offline prerequisite diagnostics only. Never opens a database or grants execution.
 * Stable proof IDs retain all existing negative assertions, including future
 * producer contracts8/9. A source declaration is not proof the SQL works.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APPROVAL_PROOF_IDS=Object.freeze(['1','2a','2b','3','4','5','6','7','8','9']);
const requirements={
 '1':['consume_approval_decision'],'2a':['consume_approval_decision'],'2b':['consume_approval_decision'],
 '3':['consume_approval_decision'],'4':[],'5':['consume_approval_decision'],
 '6':['consume_approval_decision'],'7':['consume_approval_decision'],
 '8':['consume_approval_decision','classify_approval_decision','create_approval_decision'],
 '9':['create_approval_decision'],
};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function inspectApprovalProofReadiness({runnerSource,workflowSource,schemaSql}) {
 const proofIds=[...runnerSource.matchAll(/await\s+step\(["']([^"']+)\./g)].map(m=>m[1]);
 const expectedCounts=[...workflowSource.matchAll(/ALL (\d+) REAL-DB PROOFS PASSED/g)].map(m=>Number(m[1]));
 const declared=new Set();
 for(const source of schemaSql){
  const code=source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/--[^\n]*/g,'');
  for(const m of code.matchAll(/\bcreate\s+(?:or\s+replace\s+)?function\s+public\.([a-z_]+)\s*\(/gi))declared.add(m[1].toLowerCase());
 }
 const missingFunctions=[...new Set(Object.values(requirements).flat())].filter(name=>!declared.has(name));
 const unavailableProofIds=APPROVAL_PROOF_IDS.filter(id=>requirements[id].some(name=>!declared.has(name)));
 const blockers=[];
 if(!same(proofIds,APPROVAL_PROOF_IDS))blockers.push('proof_inventory_mismatch');
 if(expectedCounts.length!==1||expectedCounts[0]!==APPROVAL_PROOF_IDS.length)blockers.push('ci_proof_count_mismatch');
 if(missingFunctions.length)blockers.push('required_schema_functions_missing');
 return {status:blockers.length?'not_ready':'source_prerequisites_present',ready:blockers.length===0,
  dbExecuted:false,staticDeclarationsOnly:true,expectedProofCount:APPROVAL_PROOF_IDS.length,proofIds,
  ciExpectedProofCount:expectedCounts.length===1?expectedCounts[0]:null,
  declaredFunctions:[...declared].filter(name=>Object.values(requirements).flat().includes(name)).sort(),
  missingFunctions,schemaReadyProofIds:APPROVAL_PROOF_IDS.filter(id=>!unavailableProofIds.includes(id)),unavailableProofIds,blockers};
}
export function readApprovalProofReadiness(root) {
 const shell=readFileSync(path.join(root,'proofs/run-approval-real-db.sh'),'utf8');
 // Inspect only SQL files the existing runner actually applies; draft or unrelated
 // migration files cannot make this preflight claim a prerequisite is present.
 const schemaFiles=[...shell.matchAll(/cat "\$ROOT\/(db\/[A-Za-z0-9_./-]+\.sql)"/g)].map(m=>m[1]);
 assert.ok(schemaFiles.length>0,'No applied schema files found');
 for(const file of schemaFiles)assert.ok(!file.split('/').includes('..'),'Invalid schema path');
 const r=inspectApprovalProofReadiness({
  runnerSource:readFileSync(path.join(root,'proofs/prove-approval-real-db.mjs'),'utf8'),
  workflowSource:readFileSync(path.join(root,'.github/workflows/ci.yml'),'utf8'),
  schemaSql:schemaFiles.map(file=>readFileSync(path.join(root,file),'utf8')),
 });
 return {...r,schemaFiles};
}
export function assertApprovalProofReadiness(root) {
 const report=readApprovalProofReadiness(root);
 if(!report.ready)throw new Error(`APPROVAL_PROOF_NOT_READY ${JSON.stringify(report)}`);
 return report;
}
export function assertCompletedApprovalProofs(results) {
 const ids=results.map(name=>name.slice(0,name.indexOf('.')));
 assert.deepEqual(ids,APPROVAL_PROOF_IDS,'Every required proof must actually finish, in order; no partial ALL success');
}
/** Test infrastructure only: reject remote endpoints/arbitrary subprocess commands before effects. */
export function assertApprovalProofTarget(rest, command) {
 const url=new URL(rest);
 assert.ok(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port&&url.pathname==='/'&&!url.username&&!url.password&&!url.search&&!url.hash,'APPROVAL_PROOF_TARGET_REFUSED');
 const ci='psql postgres://postgres@127.0.0.1:5432/postgres -X -q -v ON_ERROR_STOP=1';
 const docker=/^docker exec -i oria-approval-pg-[0-9]+_[0-9]+ psql -h 127\.0\.0\.1 -U postgres -X -q -v ON_ERROR_STOP=1$/;
 assert.ok(command===ci||docker.test(command),'APPROVAL_PROOF_TARGET_REFUSED');
}
const isEntrypoint=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isEntrypoint){
 if(process.argv[2]==='--check-target'){try{assertApprovalProofTarget(process.argv[3],process.argv[4]);}catch{console.error('APPROVAL_PROOF_TARGET_REFUSED');process.exitCode=2;}}
 else if(process.argv[2]!=='--check'||!process.argv[3]){console.error('Usage: node approval-proof-readiness.mjs --check <checkout>');process.exitCode=64;}
 else {
  try{const report=readApprovalProofReadiness(path.resolve(process.argv[3]));console.log(JSON.stringify(report));process.exitCode=report.ready?0:2;}
  catch{console.error('APPROVAL_PROOF_PREFLIGHT_ERROR: repository prerequisite files unreadable or malformed; no DB executed.');process.exitCode=2;}
 }
}
