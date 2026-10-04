import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {createJiti} from "jiti";

const root=path.resolve(import.meta.dirname,"../..");
const jiti=createJiti(import.meta.url,{alias:{"@":path.join(root,"src"),"server-only":path.join(root,"src/scripts/smoke/server-only-stub.mjs")}});
const {createDevelopmentService,developmentMissionId}=await jiti.import("../server/missions/development-mission.ts");

const CONTEXT={workspaceId:"synthetic-a",modeId:"hq",actorId:"owner"};
const REQUEST={requestId:"11111111-1111-4111-8111-111111111111",title:"Corriger window_sums",
 objective:"window_sums oublie la derniere fenetre.",scope:"window_sums.py",
 acceptanceCriteria:"Le test independant passe sans modification."};

/** Reproduces the verified durable semantics: `upsert(onConflict:"id",
 * ignoreDuplicates:true)` then a workspace-scoped read-back with `.single()`.
 * The service under test is the real one; only its store is substituted, the
 * same way this repository's own launch tests do. */
function insertOrIgnoreStore({gate}={}){
 const rows=new Map();const entered=[];
 return {rows,entered,
  save:async mission=>{
   entered.push(mission.id);
   if(gate)await gate(mission);
   if(!rows.has(mission.id))rows.set(mission.id,{...mission});
   const stored=rows.get(mission.id);
   if(stored.workspaceId!==mission.workspaceId)throw Error("Persisted mission is unavailable in this workspace.");
   return {...stored};
  },
  load:async(workspaceId,missionId)=>{
   const stored=rows.get(missionId);
   return stored&&stored.workspaceId===workspaceId?{...stored}:null;
  }};
}

const service=store=>createDevelopmentService({enabled:()=>true,store:()=>store});

test("admission saves once and stays idempotent for the same payload",async()=>{
 const store=insertOrIgnoreStore();const intake=service(store);
 const first=await intake.create(REQUEST,CONTEXT);
 assert.equal(first.status,"saved");
 assert.equal(first.missionId,developmentMissionId(CONTEXT.workspaceId,REQUEST.requestId));
 assert.equal(first.missionStatus,"draft");
 assert.equal(first.executionRequested,false);
 const again=await intake.create(REQUEST,CONTEXT);
 assert.deepEqual(again,first);
 assert.equal(store.rows.size,1);
});

test("the same request id with a different payload is a conflict, not a silent overwrite",async()=>{
 const store=insertOrIgnoreStore();const intake=service(store);
 assert.equal((await intake.create(REQUEST,CONTEXT)).status,"saved");
 for(const changed of [{title:"Autre titre"},{objective:"Autre objectif"},
  {scope:"autre.py"},{acceptanceCriteria:"Autre critere"}]){
  const outcome=await intake.create({...REQUEST,...changed},CONTEXT);
  assert.equal(outcome.status,"conflict",JSON.stringify(changed));
 }
 assert.equal(store.rows.size,1);
 const kept=store.rows.get(developmentMissionId(CONTEXT.workspaceId,REQUEST.requestId));
 assert.equal(kept.title,REQUEST.title);
});

test("a different actor or mode over the same request id conflicts",async()=>{
 const store=insertOrIgnoreStore();const intake=service(store);
 assert.equal((await intake.create(REQUEST,CONTEXT)).status,"saved");
 assert.equal((await intake.create(REQUEST,{...CONTEXT,actorId:"autre"})).status,"conflict");
 assert.equal((await intake.create(REQUEST,{...CONTEXT,modeId:"autre"})).status,"conflict");
 assert.equal(store.rows.size,1);
});

test("two simultaneous admissions produce one mission, proven by a forced interleaving",async()=>{
 let release;const opened=new Promise(resolve=>{release=resolve;});
 let waiting=0;
 const store=insertOrIgnoreStore({gate:async()=>{
  // Both calls must be inside save, before either writes, or the test proves nothing.
  waiting+=1;if(waiting===2)release();
  await opened;
 }});
 const intake=service(store);
 const [left,right]=await Promise.all([intake.create(REQUEST,CONTEXT),intake.create(REQUEST,CONTEXT)]);
 assert.equal(store.entered.length,2);
 assert.equal(left.status,"saved");assert.equal(right.status,"saved");
 assert.deepEqual(left,right);
 assert.equal(store.rows.size,1);
});

test("a lost response is recovered by lookup without creating a second mission",async()=>{
 const store=insertOrIgnoreStore();const intake=service(store);
 const saved=await intake.create(REQUEST,CONTEXT);          // response discarded below
 const recovered=await intake.lookup(REQUEST.requestId,CONTEXT.workspaceId);
 assert.deepEqual(recovered,saved);
 assert.equal(store.rows.size,1);
});

test("concurrent different payloads cannot both be admitted under the same identity",async()=>{
 let release;const opened=new Promise(resolve=>{release=resolve;});let waiting=0;
 const store=insertOrIgnoreStore({gate:async()=>{if(++waiting===2)release();await opened;}});
 const intake=service(store);
 const outcomes=await Promise.all([intake.create(REQUEST,CONTEXT),
  intake.create({...REQUEST,title:"A competing objective"},CONTEXT)]);
 assert.deepEqual(outcomes.map(result=>result.status).sort(),["conflict","saved"]);
 assert.equal(store.rows.size,1);
 const stored=store.rows.values().next().value;
 assert.equal(stored.status,"draft");assert.equal(stored.requiresApproval,true);
 assert.equal(outcomes.find(result=>result.status==="saved").executionRequested,false);
});

test("a foreign workspace never reads or writes another workspace's mission",async()=>{
 const store=insertOrIgnoreStore();const intake=service(store);
 await intake.create(REQUEST,CONTEXT);
 assert.equal((await intake.lookup(REQUEST.requestId,"foreign")).status,"not_found");
 const foreign=await intake.create(REQUEST,{...CONTEXT,workspaceId:"foreign"});
 assert.equal(foreign.status,"saved");
 assert.notEqual(foreign.missionId,developmentMissionId(CONTEXT.workspaceId,REQUEST.requestId));
 assert.equal(store.rows.size,2);
 for(const [id,row] of store.rows)assert.equal(row.id,id);
});

test("unavailable data and a disabled flag invent no mission and no transition",async()=>{
 const disabled=createDevelopmentService({enabled:()=>false,store:()=>insertOrIgnoreStore()});
 assert.deepEqual(await disabled.create(REQUEST,CONTEXT),{status:"disabled"});
 assert.deepEqual(await disabled.lookup(REQUEST.requestId,CONTEXT.workspaceId),{status:"disabled"});
 const absent=createDevelopmentService({enabled:()=>true,store:()=>null});
 assert.deepEqual(await absent.create(REQUEST,CONTEXT),{status:"unavailable"});
 assert.deepEqual(await absent.lookup(REQUEST.requestId,CONTEXT.workspaceId),{status:"unavailable"});
 const broken={save:async()=>{throw Error("write unavailable");},load:async()=>{throw Error("read unavailable");}};
 const failing=createDevelopmentService({enabled:()=>true,store:()=>broken});
 assert.deepEqual(await failing.create(REQUEST,CONTEXT),{status:"outcome_unknown"});
 assert.deepEqual(await failing.lookup(REQUEST.requestId,CONTEXT.workspaceId),{status:"unavailable"});
});

// --- the bridge script itself, run as a subprocess ---
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";

const BRIDGE=path.join(root,"src/scripts/development-mission.mjs");

function runBridge(request,{config=CONTEXT,env={},raw}={}){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),"intake-bridge-"));
 const file=path.join(folder,"config.json");
 fs.writeFileSync(file,raw??JSON.stringify({context:config}));
 try{
  // The flag is removed rather than set to "": passing an empty value through
  // spawnSync on Windows corrupts the child environment. Empty-value semantics
  // are covered in-process by the flag test below.
  const inherited={...process.env};
  // This test must never contact the operator's configured database.
  for(const key of ['MISSION_DURABLE_DRAFTS','NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'])delete inherited[key];
  inherited.NODE_ENV='test';
  const done=spawnSync(process.execPath,[BRIDGE,file],{input:JSON.stringify(request),encoding:"utf8",
   timeout:60000,env:{...inherited,...env}});
  let parsed=null;try{parsed=JSON.parse(done.stdout);}catch{}
  return {status:done.status,stdout:done.stdout,parsed};
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
}

test("the bridge takes its workspace from the protected configuration only",async()=>{
 // Echoing the same workspace is accepted; naming another one is refused.
 const echoed=runBridge({operation:"lookup",requestId:REQUEST.requestId,workspaceId:CONTEXT.workspaceId});
 assert.equal(echoed.parsed.status,"disabled");
 const foreign=runBridge({operation:"lookup",requestId:REQUEST.requestId,workspaceId:"foreign"});
 assert.deepEqual(foreign.parsed,{status:"invalid_request"});
 assert.equal(foreign.status,3);
});

test("the bridge refuses malformed configurations and requests without inventing a mission",async()=>{
 const cases=[
  {label:"unknown operation",request:{operation:"launch",requestId:REQUEST.requestId},expectedStatus:"invalid_request"},
  {label:"extra field",request:{operation:"lookup",requestId:REQUEST.requestId,actorId:"autre"},expectedStatus:"invalid_request"},
  {label:"request id not a uuid",request:{operation:"lookup",requestId:"not-a-uuid"},expectedStatus:"invalid_request"},
  {label:"create without a request",request:{operation:"create"},expectedStatus:"invalid_request"},
  {label:"create with an unknown field",request:{operation:"create",request:{...REQUEST,launch:true}},expectedStatus:"invalid_request"},
  {label:"create with an empty title",request:{operation:"create",request:{...REQUEST,title:"  "}},expectedStatus:"invalid_request"},
  {label:"configuration without context",request:{operation:"lookup",requestId:REQUEST.requestId},raw:"{}",expectedStatus:"unavailable"},
  {label:"configuration with an extra identity",request:{operation:"lookup",requestId:REQUEST.requestId},
   raw:JSON.stringify({context:{...CONTEXT,runnerId:"qualification"}}),expectedStatus:"unavailable"},
 ];
 for(const {label,request,raw,expectedStatus} of cases){
  const observed=runBridge(request,{raw});
  assert.deepEqual(observed.parsed,{status:expectedStatus},label);
  assert.equal(observed.status,3,label);
 }
});

test("the bridge reports outcome_unknown with exit code 2 strictly when write effect cannot be determined",async()=>{
 // Attempting a create against an unreachable database during save throws in store.save
 const failing=runBridge({operation:"create",request:REQUEST},{env:{
  MISSION_DURABLE_DRAFTS:"1",
  NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:9",
  SUPABASE_SERVICE_ROLE_KEY:"test-key"
 }});
 assert.deepEqual(failing.parsed,{status:"outcome_unknown"});
 assert.equal(failing.status,2);
});

test("the persistence flag stays fail-safe off for absent, empty or unknown values",async()=>{
 const {isDurableMissionDraftEnabled}=await jiti.import("../server/missions/mission-persistence-flag.ts");
 for(const raw of [undefined,"","   ","0","off","no","maybe"])
  assert.equal(isDurableMissionDraftEnabled({MISSION_DURABLE_DRAFTS:raw}),false,JSON.stringify(raw));
 for(const raw of ["1","true","ON"," yes "])
  assert.equal(isDurableMissionDraftEnabled({MISSION_DURABLE_DRAFTS:raw}),true,JSON.stringify(raw));
});

test("the bridge reports the service status and never claims execution",async()=>{
 const disabled=runBridge({operation:"lookup",requestId:REQUEST.requestId});
 assert.equal(disabled.parsed.status,"disabled");
 assert.equal(disabled.status,3);
 assert.equal(disabled.parsed.executionRequested,undefined);
 // Enabled but without a configured Supabase admin client: unavailable, never saved.
 const enabled=runBridge({operation:"create",request:REQUEST},{env:{MISSION_DURABLE_DRAFTS:"1"}});
 assert.equal(enabled.parsed.status,"unavailable");
 assert.equal(enabled.status,3);
 assert.ok(!("missionId" in enabled.parsed));
});
