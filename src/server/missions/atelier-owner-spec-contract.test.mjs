import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,C,result} from './test-fixtures/atelier-owner-spec.mjs';
let fetches=0;globalThis.fetch=()=>{fetches++;throw Error('unexpected network');};
test('v2 exact review bytes, identity and source bind; v1 flags remain distinct',async()=>{
 const f=await fixture();assert.ok(C.readOwnerSpecReview(f.review));assert.equal(C.ownerSpecPayloadSchema.safeParse({...f.payload,version:1}).success,false);
 assert.equal(C.readOwnerSpecReview({...f.review,payloadJson:f.review.payloadJson+' '}),null);
 for(const field of ['title','objective','expectedOutput']){const m=structuredClone(f.mission);m[field]+=' changed';assert.equal(C.buildOwnerSpecPayload(m,f.context,f.payload),null);}
 assert.equal(C.buildOwnerSpecPayload(f.mission,{...f.context,actorId:f.request.runId},f.payload),null);
});
test('v2 exact manifest and UTF8 artifact reject any changed identity, hash or byte count',async()=>{
 const f=await fixture(),good=result(f,'# 安全\n');assert.ok(C.validateOwnerSpecResult(good,f));
 for(const key of Object.keys(good.evidence.manifest)){const bad=structuredClone(good);bad.evidence.manifest[key]='tamper';assert.equal(C.validateOwnerSpecResult(bad,f),null,key);}
 for(const key of ['bytes','sha256','specText']){const bad=structuredClone(good);bad.evidence[key]=key==='bytes'?1:'tamper';assert.equal(C.validateOwnerSpecResult(bad,f),null,key);}
 assert.equal(C.validateOwnerSpecResult({...good,status:'failed'},f),null);assert.equal(C.validateOwnerSpecResult({...good,sessionId:null},f),null);
});
test('strict public commands cannot carry decisions, identity, host or instructions',()=>{
 for(const extra of ['approved','decisionId','actorId','workspaceId','installationId','instructions'])assert.equal(C.ownerSpecRequestSchema.safeParse({command:'review',missionId:'11111111-1111-4111-8111-111111111111',runId:'22222222-2222-4222-8222-222222222222',[extra]:'forged'}).success,false);
});
test('sealed owner rows preserve v1 canonical chain and reject foreign/tampered tail',async()=>{
 const f=await fixture(),key='synthetic-key',row=C.ownerSpecLedgerRow(f.payload,f.payloadHash,f.receipt.attemptId,f.receipt.decisionId,'admit',f.receipt.attemptId);
 const one=C.sealOwnerSpecRow(row,null,key,new Date().toISOString());const {v,...tail}=JSON.parse(one.canonicalJson);assert.equal(v,1);
 Object.assign(tail,{prev_hash:one.prevHash,entry_hash:one.entryHash,hmac:one.hmac,canonical_version:1});
 const two=C.sealOwnerSpecRow(C.ownerSpecLedgerRow(f.payload,f.payloadHash,f.receipt.attemptId,f.receipt.decisionId,'result',f.request.installationId,result(f)),tail,key,tail.created_at);
 assert.equal(two.prevHash,one.entryHash);assert.throws(()=>C.sealOwnerSpecRow(row,{...tail,workspace_id:'foreign'},key,tail.created_at));
});
test('offline suite made no fetch attempts',()=>assert.equal(fetches,0));
