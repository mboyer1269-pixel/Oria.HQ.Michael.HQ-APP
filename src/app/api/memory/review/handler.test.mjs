import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {createJiti} from "jiti";
const jiti=createJiti(import.meta.url,{alias:{"@":path.join(process.cwd(),"src")}});
const {createReviewHandler}=await jiti.import("./handler.ts");
const body={action:"decision",proposalId:"p1",hashVersion:1,expectedPayloadHash:"a".repeat(64),decisionId:"12345678-1234-4234-8234-123456789abc",decision:"approve"};
const request=(data,origin="https://public.test")=>new Request("http://internal:3000/api/memory/review",{method:"POST",headers:{"Content-Type":"application/json",origin},body:JSON.stringify(data)});
test("single authenticated actor supplies reviewer, never configured owner or client",async()=>{
 let authCalls=0;let calls=0;const handler=createReviewHandler({authenticate:async()=>{authCalls++;return {reviewerId:"real-session-id"};},workspaceId:()=>"server-workspace",publicOrigin:()=>"https://public.test",review:async(ws,id,decision)=>{calls++;assert.equal(ws,"server-workspace");assert.equal(decision.reviewerId,"real-session-id");return {status:"outcome_unknown"};}});
 assert.equal((await handler(request(body))).status,200);assert.equal(authCalls,1);assert.equal(calls,1);
 for(const extra of [{reviewerId:"forged"},{namespace:"foreign"},{technicalPrincipal:"fake"}])assert.equal((await handler(request({...body,...extra}))).status,400);assert.equal(calls,1);
 assert.equal((await handler(request(body,"https://foreign.test"))).status,403);assert.equal(calls,1);
});
test("auth denied before workspace and service; invalid origin config fails closed",async()=>{
 const handler=createReviewHandler({authenticate:async()=>new Response(null,{status:401}),workspaceId:()=>{throw Error();},publicOrigin:()=>undefined,review:async()=>{throw Error();}});assert.equal((await handler(request(body))).status,401);
 const bad=createReviewHandler({authenticate:async()=>({reviewerId:"user"}),workspaceId:()=>"test",publicOrigin:()=>"https://public.test/path",review:async()=>{throw Error();}});assert.equal((await bad(request(body))).status,403);
});
