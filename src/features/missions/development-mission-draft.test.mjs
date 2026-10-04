import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const jiti=createJiti(import.meta.url);
const {DEVELOPMENT_DRAFT_TTL_MS,developmentDraftKey,readDevelopmentDraft,saveDevelopmentDraft,clearDevelopmentDraft,canRestoreDevelopmentDraft}=await jiti.import("./development-mission-draft.ts");
const {planIntent,requestMethodFor}=await jiti.import("./development-mission-session.ts");
const {developmentHandoffKey,encodeDevelopmentHandoff,consumeDevelopmentHandoff}=await jiti.import("./development-mission-handoff.ts");
const now=1700000000000;
const values={title:"Test mobile",objective:"Mon objectif",scope:"UI seulement",acceptanceCriteria:"Valider la navigation"};
function tab(){const entries=new Map();return {entries,getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)};}
test("HQ handoff remains a non-submitted draft across memory/agents/missions remounts",()=>{
 const storage=tab();storage.setItem(developmentHandoffKey("a"),encodeDevelopmentHandoff("a",values.objective,now));
 const handoff=consumeDevelopmentHandoff(storage,"a",now);
 assert.equal(handoff.status,"ready");
 const first={title:"",objective:handoff.objective,scope:"",acceptanceCriteria:""};
 assert.equal(saveDevelopmentDraft(storage,"a",first,now),true);
 assert.deepEqual(readDevelopmentDraft(storage,"a",now+1),{status:"ready",values:first});
 assert.equal(saveDevelopmentDraft(storage,"a",values,now+2),true);
 assert.deepEqual(readDevelopmentDraft(storage,"a",now+3),{status:"ready",values});
 assert.deepEqual(readDevelopmentDraft(storage,"a",now+4),{status:"ready",values});
 assert.deepEqual(Object.keys(JSON.parse(storage.getItem(developmentDraftKey("a")))).sort(),["expiresAt","values","version","workspaceId"]);
});
test("workspace changes never restore or clear another project's draft",()=>{
 const storage=tab();saveDevelopmentDraft(storage,"a",values,now);
 assert.deepEqual(readDevelopmentDraft(storage,"b",now),{status:"absent"});
 clearDevelopmentDraft(storage,"b");assert.equal(readDevelopmentDraft(storage,"a",now).status,"ready");
});
test("existing edits, frozen payloads and active requests prohibit restoration",()=>{
 assert.equal(canRestoreDevelopmentDraft({edited:false,frozen:false,busy:false}),true);
 for(const state of [{edited:true,frozen:false,busy:false},{edited:false,frozen:true,busy:false},{edited:false,frozen:false,busy:true}])assert.equal(canRestoreDevelopmentDraft(state),false);
});
test("storage unavailable retains an honest failure and cannot retire a submitted copy",()=>{
 const storage={getItem(){throw Error("unavailable");},setItem(){throw Error("quota");},removeItem(){throw Error("unavailable");}};
 assert.deepEqual(readDevelopmentDraft(storage,"a",now),{status:"unavailable"});
 assert.equal(saveDevelopmentDraft(storage,"a",values,now),false);
 assert.throws(()=>clearDevelopmentDraft(storage,"a"));
});
test("draft schema rejects receipt/auth fields and oversized inputs, expires after 24h",()=>{
 const storage=tab();assert.equal(saveDevelopmentDraft(storage,"a",{...values,requestId:"receipt"},now),false);
 assert.equal(saveDevelopmentDraft(storage,"a",{...values,objective:"x".repeat(4001)},now),false);
 saveDevelopmentDraft(storage,"a",values,now);
 assert.deepEqual(readDevelopmentDraft(storage,"a",now+DEVELOPMENT_DRAFT_TTL_MS),{status:"invalid"});
 for(const raw of ["{","null","[]",JSON.stringify({version:1,workspaceId:"b",values,expiresAt:now+1000}),JSON.stringify({version:2,workspaceId:"a",values,expiresAt:now+1000})]){
  storage.setItem(developmentDraftKey("a"),raw);assert.equal(readDevelopmentDraft(storage,"a",now).status,"invalid");
 }
});
test("submission removes unsent fields while receipt recovery keeps its existing explicit gate",()=>{
 const storage=tab();saveDevelopmentDraft(storage,"a",values,now);clearDevelopmentDraft(storage,"a");
 assert.deepEqual(readDevelopmentDraft(storage,"a",now),{status:"absent"});
 const state={tracking:"ok",activeRequestId:null,pendingRequestId:"6f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d",releasedRequestId:null,hasFrozenPayload:false,inputComplete:true};
 // A restored new draft cannot silently adopt the old request ID.
 assert.equal(planIntent(state,"create").kind,"refused");
 assert.equal(requestMethodFor(planIntent(state,"read-pending")),"GET");
 const fresh=planIntent({...state,pendingRequestId:null},"create");
 assert.deepEqual(fresh,{kind:"create"});
});
