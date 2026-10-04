import test from "node:test";import assert from "node:assert/strict";import path from "node:path";import {createJiti} from "jiti";
const jiti=createJiti(import.meta.url,{alias:{"@":path.join(process.cwd(),"src"),"server-only":path.join(process.cwd(),"src/scripts/smoke/server-only-stub.mjs")}});
const {createDevelopmentHandlers}=await jiti.import("./handlers.ts");
const input={requestId:"12345678-1234-4234-8234-123456789abc",title:"Task",objective:"Goal",scope:"Scope",acceptanceCriteria:"Tests"};
const request=(body,origin="https://hq.test")=>new Request("http://internal:3000/api/missions/development",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body)});
const base={authenticate:async()=>({actorId:"actual-user"}),context:()=>({workspaceId:"server-project",modeId:"hq"}),publicOrigin:()=>"https://hq.test",create:async()=>({status:"disabled"}),lookup:async()=>({status:"not_found"})};
test("owner origin and strict fields before write; exact actual actor",async()=>{
 let writes=0;const h=createDevelopmentHandlers({...base,create:async(_i,ctx)=>{writes++;assert.equal(ctx.actorId,"actual-user");assert.equal(ctx.workspaceId,"server-project");return {status:"disabled"};}});assert.equal((await h.POST(request(input))).status,200);
 for(const extra of [{createdBy:"forged"},{workspaceId:"foreign"},{status:"running"},{scope:"x".repeat(1001)}])assert.equal((await h.POST(request({...input,...extra}))).status,400);assert.equal((await h.POST(request(input,"https://foreign.test"))).status,403);assert.equal(writes,1);
 const denied=createDevelopmentHandlers({...base,authenticate:async()=>new Response(null,{status:401}),create:async()=>{throw Error();}});assert.equal((await denied.POST(request(input))).status,401);
});
test("GET recovery only accepts requestId and resolves server workspace",async()=>{
 const h=createDevelopmentHandlers({...base,lookup:async(id,ws)=>{assert.equal(id,input.requestId);assert.equal(ws,"server-project");return {status:"not_found"};}});
 assert.equal((await h.GET(new Request(`https://hq.test/api/missions/development?requestId=${input.requestId}`))).status,200);assert.equal((await h.GET(new Request(`https://hq.test/api/missions/development?requestId=${input.requestId}&workspaceId=foreign`))).status,400);
});
