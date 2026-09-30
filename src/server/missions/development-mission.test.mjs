import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {createJiti} from "jiti";
const jiti=createJiti(import.meta.url,{alias:{"@":path.join(process.cwd(),"src"),"server-only":path.join(process.cwd(),"src/scripts/smoke/server-only-stub.mjs")}});
const {createDevelopmentService,developmentMissionId,createDevelopmentStore}=await jiti.import("./development-mission.ts");
const input={requestId:"12345678-1234-4234-8234-123456789abc",title:"HQ improvement",objective:"Improve limited component",scope:"One component only",acceptanceCriteria:"Typecheck and focused test"};const ctx={workspaceId:"test",modeId:"hq",actorId:"real-owner"};
function harness(){const rows=new Map();const store={save:async m=>{if(!rows.has(m.id))rows.set(m.id,structuredClone(m));return structuredClone(rows.get(m.id));},load:async(ws,id)=>rows.get(id)?.workspaceId===ws?structuredClone(rows.get(id)):null};return {store,rows,service:createDevelopmentService({enabled:()=>true,store:()=>store})};}
test("UUIDv5 scoped deterministic ID and draft-only canonical input",async()=>{
 assert.match(developmentMissionId("test",input.requestId),/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);assert.notEqual(developmentMissionId("test",input.requestId),developmentMissionId("foreign",input.requestId));
 const h=harness();const result=await h.service.create(input,ctx);assert.equal(result.status,"saved");const m=h.rows.get(result.missionId);assert.equal(m.status,"draft");assert.equal(m.assignedAgentId,"");assert.equal(m.input.development.createdBy,"real-owner");assert.equal(m.requiresApproval,true);assert.ok(m.expectedOutput.includes(input.scope));assert.ok(m.expectedOutput.length<4000);
});
test("response loss recovers same row through scoped lookup and does not overwrite dispatch",async()=>{
 const h=harness();const save=h.store.save;let calls=0;h.store.save=async m=>{const saved=await save(m);if(++calls===1)throw Error("lost response");return saved;};assert.equal((await h.service.create(input,ctx)).status,"outcome_unknown");
 const read=await h.service.lookup(input.requestId,ctx.workspaceId);assert.equal(read.status,"saved");assert.equal((await h.service.lookup(input.requestId,"foreign")).status,"not_found");h.rows.get(read.missionId).input._paperclipDispatch={state:"linked"};assert.equal((await h.service.create(input,ctx)).status,"saved");assert.equal(h.rows.size,1);assert.equal(h.rows.get(read.missionId).input._paperclipDispatch.state,"linked");
 assert.equal((await h.service.create({...input,objective:"Different"},ctx)).status,"conflict");assert.equal(h.rows.get(read.missionId).objective,input.objective);
});
test("disabled and absent durable store never fallback to memory",async()=>{
 assert.equal((await createDevelopmentService({enabled:()=>false,store:()=>{throw Error();}}).create(input,ctx)).status,"disabled");assert.equal((await createDevelopmentService({enabled:()=>true,store:()=>null}).create(input,ctx)).status,"unavailable");assert.equal(typeof createDevelopmentStore,"function");
});
