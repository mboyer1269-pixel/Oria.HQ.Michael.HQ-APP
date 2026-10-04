import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import os from "node:os";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {createJiti} from "jiti";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..");
const jiti=createJiti(import.meta.url,{alias:{"@":path.join(root,"src"),"server-only":path.join(root,"src/__server-only-noop.js")}});
const {resolveChatModelBinding,chatModelOptions,loadChatCapabilityCatalog,chatModelSelectionSchema}=await jiti.import("./chat-model-binding.ts");
const {generateJorisReply}=await jiti.import("./joris-reply-generator.ts");
const {runJorisCommand}=await jiti.import("./brain.ts");
const {getActiveWorkspaceContext}=await jiti.import(path.join(root,"src/core/workspace-context.ts"));
const accountId="6f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d";
function fixture(workspaceId="michael-hq"){
 const now=Date.now(),observedAt=new Date(now).toISOString();
 const catalog={source:"server-attestation-fixture",observedAt,revision:"test-revision",entries:[{accountId,modelId:"gpt-4o-mini",provider:"openai",state:"authorized",source:"verified-account-fixture",observedAt,tools:false,billingKind:"api",workspaceId,tariff:{currency:"USD",notToExceedCents:10,source:"server-quote-fixture",observedAt}}]};
 return {now,catalog,selection:{accountId,modelId:"gpt-4o-mini",catalogRevision:catalog.revision}};
}
test("qualified selection travels brain -> generator -> strict provider -> existing budget gate -> mocked fetch -> observed usage",async()=>{
 const envKeys=["HQ_CALL_RESERVATION","OPENAI_API_KEY","ANTHROPIC_API_KEY"];
 const saved=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
 try{
  process.env.HQ_CALL_RESERVATION="1";process.env.OPENAI_API_KEY="synthetic-test-only";delete process.env.ANTHROPIC_API_KEY;
  const ctx=getActiveWorkspaceContext(),f=fixture(ctx.workspace.id),resolution=resolveChatModelBinding(f.catalog,ctx.workspace.id,f.selection,f.now,true);
  assert.equal(resolution.status,"ready");
  const calls=[];
  const snap=(status,networkEmitted=false,reconciliationRequired=false)=>({configured:true,status,currency:"USD",reservedCents:5,networkEmitted,reconciliationRequired});
  const gate={reserve:async input=>{calls.push(["reserve",input.modelId]);return snap("held");},markEmitted:async()=>{calls.push(["mark"]);return snap("emitted_unknown",true,true);},consume:async()=>{calls.push(["consume"]);return snap("consumed",true);},release:async()=>snap("released")};
  const result=await runJorisCommand("Bonjour, explique simplement ce que tu peux faire.",ctx,{
   readVerifiedVault:()=>({entries:[]}),
   enrichMemexContext:async()=>({memoryContext:null,evidencePack:null,trace:{status:"disabled",evidencePackValid:false},evidenceSummary:{status:"disabled",sourceCount:0,confidence:"unknown",freshness:{oldestIso:null,newestIso:null,ageDays:null},limitations:[],fallbackReasons:[]}}),
   generateReply:input=>generateJorisReply({...input,reservationGate:gate,fetchFn:async(_url,init)=>{
    calls.push(["fetch",JSON.parse(init.body).model]);
    return new Response(JSON.stringify({model:"gpt-4o-mini-observed",choices:[{message:{content:JSON.stringify({reply:"Réponse de test"})}}],usage:{prompt_tokens:12,completion_tokens:7}}),{status:200});
   }}),
  },resolution);
  assert.equal(result.generation,"llm");assert.equal(result.summary,"Réponse de test");
  assert.deepEqual(calls,[["reserve","gpt-4o-mini"],["mark"],["fetch","gpt-4o-mini"],["consume"]]);
  assert.equal(result.chatExecution.accountId,accountId);assert.equal(result.chatExecution.executedModelId,"gpt-4o-mini-observed");
  assert.deepEqual(result.chatExecution.usage,{input:12,output:7});assert.equal(result.chatExecution.monetaryUsd,null);
  assert.equal(result.chatExecution.reservationStatus,"consumed");
 }finally{for(const key of envKeys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});
test("changed account/model/revision, unknown free access, stale facts and missing budget cannot become executable",()=>{
 const f=fixture();
 for(const selection of [{...f.selection,accountId:"7a2c3d4e-5f60-4b7c-9d8e-1f2a3b4c5d6e"},{...f.selection,modelId:"gpt-4o"},{...f.selection,catalogRevision:"changed"},undefined])assert.equal(resolveChatModelBinding(f.catalog,"michael-hq",selection,f.now,true).status,"blocked");
 for(const patch of [{state:"listed"},{state:"connected"},{billingKind:"verified_free",tariff:null},{tariff:null},{workspaceId:"other"}]){
  const catalog={...f.catalog,entries:[{...f.catalog.entries[0],...patch}]};
  assert.equal(resolveChatModelBinding(catalog,"michael-hq",f.selection,f.now,true).status,"blocked");
 }
 assert.equal(resolveChatModelBinding(f.catalog,"michael-hq",f.selection,f.now,false).status,"blocked");
 assert.equal(resolveChatModelBinding(f.catalog,"michael-hq",f.selection,f.now+86400001,true).reason,"catalog_stale");
 assert.equal(chatModelSelectionSchema.safeParse({...f.selection,authorized:true,tariff:0}).success,false);
 assert.equal(chatModelOptions(f.catalog,"other",f.now,true).length,0);
 const ambiguous={...f.catalog,entries:[...f.catalog.entries,{...f.catalog.entries[0],accountId:"7a2c3d4e-5f60-4b7c-9d8e-1f2a3b4c5d6e"}]};
 assert.equal(resolveChatModelBinding(ambiguous,"michael-hq",f.selection,f.now,true).reason,"credential_binding_ambiguous");
});
test("missing qualification leaves deterministic calendar clarification available without a model call",async()=>{
 const result=await runJorisCommand("Réserve un rendez-vous",getActiveWorkspaceContext(),{generateReply:async()=>{throw Error("Unexpected model request");},readVerifiedVault:()=>{throw Error("Unexpected memory read");}},{status:"blocked",reason:"catalog_unavailable"});
 assert.equal(result.intent,"calendar.book");assert.equal(result.executedModelId,null);
});
test("qualification file is reread; invalid/missing/oversized configuration cannot retain earlier authorization",async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),"hq-chat-binding-")),file=path.join(directory,"qualified.json"),saved=process.env.ORIA_HQ_CHAT_CAPABILITIES_FILE;
 try{
  process.env.ORIA_HQ_CHAT_CAPABILITIES_FILE=file;
  await writeFile(file,JSON.stringify(fixture().catalog));assert.ok(await loadChatCapabilityCatalog());
  await writeFile(file,"invalid");assert.equal(await loadChatCapabilityCatalog(),null);
  await writeFile(file,"x".repeat(200001));assert.equal(await loadChatCapabilityCatalog(),null);
  process.env.ORIA_HQ_CHAT_CAPABILITIES_FILE="relative.json";assert.equal(await loadChatCapabilityCatalog(),null);
 }finally{if(saved===undefined)delete process.env.ORIA_HQ_CHAT_CAPABILITIES_FILE;else process.env.ORIA_HQ_CHAT_CAPABILITIES_FILE=saved;await rm(directory,{recursive:true,force:true});}
});
