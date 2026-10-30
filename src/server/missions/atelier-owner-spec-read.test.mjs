import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, result, jiti, C } from './test-fixtures/atelier-owner-spec.mjs';
const { readOwnerSpecEvidence, ownerSpecMissionForClient } = await jiti.import('../atelier-owner-spec-read.ts');

async function saved() {
 const f=await fixture(),observed=result(f,'# SPEC\nTexte enregistré <script>inerte</script> — 安全\n');
 f.mission.input._atelierOwnerSpecV2={review:f.review,admission:f.receipt,result:observed};
 f.mission.result={atelierOwnerSpecV2:structuredClone(observed)};
 return {...f,observed};
}
test('canonical recorded SPEC is projected with exact bytes and immutable references, without writes',async()=>{
 const f=await saved(),before=structuredClone(f.mission),old=globalThis.fetch;let network=0;
 globalThis.fetch=()=>{network++;throw Error('unexpected network');};
 try {const view=readOwnerSpecEvidence(f.mission,f.context);
  assert.equal(view.state,'recorded');assert.equal(view.status,'succeeded');
  assert.equal(view.artifact.text,f.observed.evidence.specText);assert.equal(view.artifact.bytes,Buffer.byteLength(view.artifact.text));
  assert.equal(view.runId,f.receipt.runId);assert.equal(view.attemptId,f.receipt.attemptId);
  assert.equal(view.artifact.baseSha,f.payload.binding.repository.baseSha);
  assert.equal(view.executionAvailable,false);assert.equal(view.independentlyValidated,false);
  assert.deepEqual(f.mission,before);assert.equal(network,0);
 }finally{globalThis.fetch=old;}
});
test('missing, reserved, reviewed and admitted states are distinct and grant no execution',async()=>{
 const f=await fixture();const empty=structuredClone(f.mission);delete empty.input._atelierRun;
 assert.equal(readOwnerSpecEvidence(empty,f.context).state,'absent');
 assert.equal(readOwnerSpecEvidence(f.mission,f.context).state,'reserved');
 f.mission.input._atelierOwnerSpecV2={review:f.review};
 assert.equal(readOwnerSpecEvidence(f.mission,f.context).state,'reserved');
 f.mission.input._atelierOwnerSpecV2.admission=f.receipt;
 assert.equal(readOwnerSpecEvidence(f.mission,f.context).state,'awaiting_result');
});
test('a historical result does not depend on current mission lifecycle or expired review authorization',async()=>{
 const f=await saved();f.mission.status='completed';f.mission.requiresApproval=false;
 f.payload.reviewExpiresAt='2025-01-01T00:00:00.000Z';
 f.review.payloadJson=JSON.stringify(f.payload);f.payloadHash=C.sha256(f.review.payloadJson);f.review.payloadHash=f.payloadHash;
 f.receipt.payloadHash=f.payloadHash;f.receipt.admittedAt='2024-12-31T23:59:00.000Z';
 const observed=result(f);f.mission.input._atelierOwnerSpecV2.result=observed;f.mission.result.atelierOwnerSpecV2=observed;
 assert.ok(Date.parse(f.payload.reviewExpiresAt)<Date.now());
 assert.equal(readOwnerSpecEvidence(f.mission,f.context).state,'recorded');
});
test('JSONB object key ordering does not change the canonical projection',async()=>{
 const f=await saved(),expected=readOwnerSpecEvidence(f.mission,f.context);
 const reverse=value=>Array.isArray(value)?value.map(reverse):value&&typeof value==='object'
  ?Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reverse(v)])):value;
 assert.deepEqual(readOwnerSpecEvidence(reverse(f.mission),f.context),expected);
});
test('client mission projection strips both raw evidence copies, preserving unrelated fields and the server source',async()=>{
 const f=await saved();f.mission.input.other={keep:true};f.mission.result.summary='Existing summary';
 const before=structuredClone(f.mission),client=ownerSpecMissionForClient(f.mission);
 assert.equal(Object.hasOwn(client.input,'_atelierOwnerSpecV2'),false);assert.equal(Object.hasOwn(client.result,'atelierOwnerSpecV2'),false);
 assert.deepEqual(client.input._atelierRun,before.input._atelierRun);assert.deepEqual(client.input.other,{keep:true});
 assert.equal(client.result.summary,'Existing summary');assert.deepEqual(f.mission,before);
 assert.doesNotMatch(JSON.stringify(client),/Texte enregistré|payloadJson/);
});
test('foreign context, cross-bound payload, missing duplicate and any artifact tampering expose no text',async()=>{
 for(const key of ['workspaceId','modeId','actorId']){const f=await saved();assert.equal(readOwnerSpecEvidence(f.mission,{...f.context,[key]:'foreign'}).state,'unverified');}
 for(const mutate of [
  m=>{m.input._atelierRun.runId='99999999-9999-4999-8999-999999999999';},
  m=>{m.input._atelierOwnerSpecV2.review.payloadHash='0'.repeat(64);},
  m=>{m.input._atelierOwnerSpecV2.admission.actorId='99999999-9999-4999-8999-999999999999';},
  m=>{delete m.result.atelierOwnerSpecV2;},m=>{delete m.input._atelierOwnerSpecV2.result;},
  m=>{m.result.atelierOwnerSpecV2.evidence.specText+='tamper';},
  m=>{m.input._atelierOwnerSpecV2.result.evidence.manifest.headSha='b'.repeat(40);},
  m=>{m.input._atelierRun.binding.bindingHash='0'.repeat(64);},
 ]){const f=await saved();mutate(f.mission);const view=readOwnerSpecEvidence(f.mission,f.context);assert.equal(view.state,'unverified');assert.ok(!JSON.stringify(view).includes('Texte enregistré'));}
});
test('non-success result remains a historical observation without artifact or current approval',async()=>{
 const f=await saved(),failed={status:'interrupted',sessionId:null};
 f.mission.input._atelierOwnerSpecV2.result=failed;f.mission.result.atelierOwnerSpecV2=failed;
 const view=readOwnerSpecEvidence(f.mission,f.context);assert.equal(view.state,'recorded');assert.equal(view.status,'interrupted');assert.equal(view.artifact,null);
});
