import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import {createJiti} from "jiti";
const jiti=createJiti(import.meta.url,{alias:{"@":path.join(process.cwd(),"src"),"server-only":path.join(process.cwd(),"src/scripts/smoke/server-only-stub.mjs")}});
const {validateReviewSnapshot,createMemexReviewService,resolveReviewBinding}=await jiti.import("./memex-review-service.ts");
const proposal={id:"p1",tenant:"org:workspace:test",namespace:"org:workspace:test",proposedBy:"agent",sourceClient:"agent",content:"hello",suggestedEntities:null,suggestedRelations:null,provenance:null,confidence:null,riskFlags:null,status:"proposed",createdAt:"2026-09-29",reviewedAt:null,review_required:1};
function canonical(v){return Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,canonical(x)])):v;}
function snapshot(p=proposal){const payload={hashVersion:1};for(const key of ['id','tenant','namespace','proposedBy','sourceClient','content','provenance','confidence','riskFlags'])payload[key]=p[key]??null;for(const key of ['suggestedEntities','suggestedRelations'])payload[key]=JSON.parse(p[key]||'[]');return {proposal:p,hashVersion:1,payloadHash:crypto.createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex')};}
test("exact snapshot rejects hidden extensions, foreign scope and changed hash",()=>{
 assert.equal(validateReviewSnapshot(snapshot(),proposal.namespace,"p1").proposal.content,"hello");
 for(const raw of [{...snapshot(),proposal:{...proposal,hiddenMutation:true}},{...snapshot(),proposal:{...proposal,content:"changed"}}])assert.throws(()=>validateReviewSnapshot(raw,proposal.namespace,"p1"));
 assert.throws(()=>validateReviewSnapshot(snapshot(),"org:foreign","p1"));
 const structured=snapshot({...proposal,suggestedRelations:JSON.stringify([{type:"SUPERSEDES",sourceId:"a",targetId:"b"}])});assert.ok(validateReviewSnapshot(structured,proposal.namespace,"p1").proposal.suggestedRelations.includes("SUPERSEDES"));
});
test("dedicated operator binding refuses agent handle and non-origin endpoint",()=>{
 assert.equal(resolveReviewBinding({},"test").status,"disabled");
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"hq-review-"));const file=path.join(dir,"token");
 try{fs.writeFileSync(file,"amh1.invalid");const env={ORIA_ENABLE_MEMEX_REVIEW:"1",MEMEX_REVIEW_ENDPOINT:"https://example.test",MEMEX_REVIEW_HQ_WORKSPACE_ID:"test",MEMEX_REVIEW_TOKEN_FILE:file};assert.equal(resolveReviewBinding(env,"test").status,"unconfigured");fs.writeFileSync(file,`opr1.${"a".repeat(43)}`);assert.equal(resolveReviewBinding(env,"foreign").status,"workspace_unbound");assert.equal(resolveReviewBinding({...env,MEMEX_REVIEW_ENDPOINT:"https://example.test/path"},"test").status,"unconfigured");}finally{fs.unlinkSync(file);fs.rmdirSync(dir);}
});
test("fixed operator endpoints, conflict distinct, no retry or publication",async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"hq-review-"));const file=path.join(dir,"token");fs.writeFileSync(file,`opr1.${"a".repeat(43)}`);let calls=0;
 try{const env={ORIA_ENABLE_MEMEX_REVIEW:"1",MEMEX_REVIEW_ENDPOINT:"https://example.test",MEMEX_REVIEW_HQ_WORKSPACE_ID:"test",MEMEX_REVIEW_TOKEN_FILE:file};const service=createMemexReviewService({env:()=>env,fetcher:async(url,init)=>{calls++;assert.equal(init.redirect,"error");assert.equal(url,"https://example.test/operator/review/decision");const body=JSON.parse(init.body);assert.equal(body.reviewerId,"real-user");return Response.json({error:"review_conflict"},{status:409});}});assert.equal((await service("test","p1",{proposalId:"p1",hashVersion:1,expectedPayloadHash:snapshot().payloadHash,decisionId:"d1",reviewerId:"real-user",decision:"approve"})).status,"conflict");assert.equal(calls,1);}finally{fs.unlinkSync(file);fs.rmdirSync(dir);}
});
