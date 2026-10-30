import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createJiti} from 'jiti';
globalThis.fetch=()=>{throw Error('unexpected network');};
const j=createJiti(import.meta.url,{alias:{'@':path.resolve('src'),'server-only':path.resolve('src/scripts/smoke/server-only-stub.mjs')}});
let contract,createStore;
try {contract=await j.import('./execution-intent-admission-contract.ts');({createExecutionIntentAdmissionStore:createStore}=await j.import('./execution-intent-admission-store.ts'));}catch{}
const actor='11111111-1111-4111-8111-111111111111',decision='22222222-2222-4222-8222-222222222222',attempt='33333333-3333-4333-8333-333333333333';
const intent={workspaceId:'ws',intentId:'intent',agentId:'hermes',skillId:'content.generate',toolName:'n8n_webhook_trigger',autonomyLevel:3,status:'pending',requiresCeoApproval:true,payload:{agentId:'hermes',skillId:'content.generate',client:'Synthetic',email:'fake@example.test',actionType:'draft',missionId:'test',data:{text:'<synthetic> 安全'}},createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'};
function fixture(reply){
 assert.equal(typeof createStore,'function');const input=contract.buildAdmissionInput(intent,actor,decision,attempt);const calls=[];let sealed;
 const db={rpc:async(name,params)=>{calls.push({name,params});if(name==='read_atelier_ledger_tail')return{data:{status:'ready',tail:null},error:null};if(name==='admit_execution_intent_v1')sealed=params.p_seal;
 const receipt={version:1,workspaceId:'ws',actorId:actor,intentId:'intent',decisionId:decision,attemptId:attempt,payloadHash:input.payloadHash,sourceHash:input.sourceHash,ledgerId:attempt,ledgerHash:sealed.entryHash,admittedAt:'2026-01-01T00:00:00.001Z'};
 const ledger={...JSON.parse(sealed.canonicalJson),entry_hash:sealed.entryHash,prev_hash:sealed.prevHash,hmac:sealed.hmac,canonical_version:1};delete ledger.v;
 return reply?.(name,params,{receipt,ledger})??{data:name==='admit_execution_intent_v1'?{status:'admitted',receipt}:{status:'current',receipt,ledger},error:null};}};
 return{input,calls,store:createStore(db,{enabled:()=>true,hmacKey:()=> 'synthetic-hmac',now:()=> '2026-01-01T00:00:00.000Z'})};
}
test('fresh atomic ACK binds every identity and source field; one-use in-process dispatch ticket',async()=>{
 const f=fixture();const result=await f.store.admit(f.input);assert.equal(result.status,'admitted');assert.equal(await f.store.takeCurrent(f.input,result.receipt),true);assert.equal(await f.store.takeCurrent(f.input,result.receipt),false);
 assert.deepEqual(f.calls.map(c=>c.name),['read_atelier_ledger_tail','admit_execution_intent_v1','check_execution_intent_admission_v1']);
 assert.ok(!JSON.stringify(f.calls).includes('synthetic-hmac'));assert.equal(JSON.parse(f.calls[1].params.p_seal.canonicalJson).autonomy_level,0);
});
test('lost/malformed/historical/mismatched ACK never grants a ticket or retries the mutation',async()=>{
 for(const kind of ['lost','malformed','existing','foreign','wrongAttempt']){const f=fixture((name,p,{receipt})=>{if(name!=='admit_execution_intent_v1')throw Error('unexpected read');if(kind==='lost')throw Error('ACK lost');return{data:kind==='malformed'?null:{status:kind==='existing'?'existing':'admitted',receipt:{...receipt,...(kind==='foreign'?{actorId:decision}:{}),...(kind==='wrongAttempt'?{attemptId:decision}:{})}},error:null};});assert.equal((await f.store.admit(f.input)).status,'unconfirmed');assert.equal(f.calls.filter(c=>c.name==='admit_execution_intent_v1').length,1);}
});
test('current receipt/ledger/source checks refuse tampering, stale approval and read failure without minting new authority',async()=>{
 for(const kind of ['read','receipt','ledger','source','clone','hmac-only','entry-hash','timestamp']){const f=fixture((name,p,x)=>{if(name==='admit_execution_intent_v1')return{data:{status:'admitted',receipt:x.receipt},error:null};if(kind==='read')return{data:{status:'not_current'},error:null};if(kind==='receipt')x.receipt.decisionId=actor;if(kind==='ledger')x.ledger.metadata.actualSkillId='other';if(kind==='hmac-only')x.ledger.hmac='0'.repeat(64);if(kind==='entry-hash')x.ledger.entry_hash='0'.repeat(64);if(kind==='timestamp')x.ledger.created_at='2026-01-01T00:00:01.000Z';return{data:{status:'current',...x},error:null};});const a=await f.store.admit(f.input);const input=kind==='source'?{...f.input,source:{...f.input.source,autonomyLevel:4}}:f.input;assert.equal(await f.store.takeCurrent(input,kind==='clone'?structuredClone(a.receipt):a.receipt),false,kind);}
});
test('unavailable store/sealing and invalid actor are refused before mutation',async()=>{
 assert.equal(typeof createStore,'function');assert.throws(()=>contract.buildAdmissionInput(intent,'configured-owner',decision,attempt));const f=fixture();assert.equal((await createStore(null).admit(f.input)).status,'unavailable');let calls=0;assert.equal((await createStore({rpc:()=>{calls++;throw Error();}},{enabled:()=>false}).admit(f.input)).status,'unavailable');assert.equal(calls,0);
});
test('caller mutation during current-read cannot replace the already bound dispatched bytes',async()=>{
 const {dispatchAdmittedTool}=await j.import('../runtime/admitted-tool-dispatch.ts');
 const f=fixture();const ack=await f.store.admit(f.input);let release;const wait=new Promise(r=>{release=r;});let entered;
 const started=new Promise(r=>{entered=r;});const port={...f.store,takeCurrent:async(i,r)=>{const valid=await f.store.takeCurrent(i,r);entered();await wait;return valid;}};
 let sent;const pending=dispatchAdmittedTool(f.input,ack.receipt,port,async p=>{sent=structuredClone(p);return{ok:true};},()=>({outcome:'REQUIRE_APPROVAL'}));
 await started;const original=structuredClone(f.input.source.payload);f.input.source.payload.data.text='not approved';release();
 assert.equal((await pending).ok,true);assert.deepEqual(sent,original);
});
