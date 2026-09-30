import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { createJiti } from "jiti";
const jiti=createJiti(import.meta.url,{alias:{"@":path.join(process.cwd(),"src"),"server-only":path.join(process.cwd(),"src/scripts/smoke/server-only-stub.mjs")}});
const {createMemexProposalHandlers}=await jiti.import("./handlers.ts");
const id="12345678-1234-4234-8234-123456789abc";
const req=(body,origin="https://hq.test")=>new Request("https://hq.test/api/memory/proposals",{method:"POST",headers:{origin,"Content-Type":"application/json"},body:JSON.stringify(body)});
const base={authorize:async()=>null,workspaceId:()=>"server-project",submit:async()=>({status:"disabled"}),receipt:async()=>({status:"not_found"})};
test("auth and origin reject before mutation",async()=>{
 let calls=0;const submit=async()=>{calls++;return {status:"disabled"};};
 assert.equal((await createMemexProposalHandlers({...base,submit,authorize:async()=>new Response(null,{status:401})}).POST(req({}))).status,401);
 assert.equal((await createMemexProposalHandlers({...base,submit}).POST(req({requestId:id,content:"hello"},"https://foreign.test"))).status,403);assert.equal(calls,0);
});
test("strict body and bounded input reject forged workspace or oversized content",async()=>{
 const h=createMemexProposalHandlers(base);
 for(const body of [{requestId:id,content:"x",workspaceId:"foreign"},{requestId:id,content:"x".repeat(8001)},{requestId:"bad",content:"hello"},{requestId:id,content:" "}]) assert.equal((await h.POST(req(body))).status,400);
});
test("stable request ID and server workspace, ambiguous exception is never retried",async()=>{
 let calls=0;const h=createMemexProposalHandlers({...base,submit:async(input)=>{calls++;assert.equal(input.workspaceId,"server-project");assert.equal(input.requestId,id);throw Error("secret");}});
 const response=await h.POST(req({requestId:id,content:"hello"}));assert.deepEqual(await response.json(),{status:"outcome_unknown"});assert.equal(calls,1);
 assert.equal((await h.GET(new Request(`https://hq.test/api/memory/proposals?requestId=${id}`))).status,200);assert.equal(calls,1);
});
test("receipt read forbids client scope and calls only receipt",async()=>{
 const h=createMemexProposalHandlers({...base,submit:async()=>{throw Error("unexpected");},receipt:async(input)=>{assert.equal(input.requestId,id);return {status:"not_found"};}});
 assert.equal((await h.GET(new Request(`https://hq.test/api/memory/proposals?requestId=${id}&workspaceId=foreign`))).status,400);
 assert.deepEqual(await (await h.GET(new Request(`https://hq.test/api/memory/proposals?requestId=${id}`))).json(),{status:"not_found"});
});
test("UI keeps stable request after send and exposes receipt-only recovery",()=>{
 const source=fs.readFileSync("src/features/memory/components/memex-proposal-panel.tsx","utf8");
 assert.ok(source.includes("(!receiptOnly && requestId && !(retry && retryAllowed))"));assert.ok(source.includes("selectedId ?? requestId ?? previous ?? crypto.randomUUID()"));assert.ok(source.includes("void send(true)"));assert.ok(source.includes('receiptOnly ? "GET" : "POST"'));assert.ok(!source.includes("setInterval"));
});
test("configured public origin is exact and ignores forwarded headers",async()=>{
 let calls=0;const h=createMemexProposalHandlers({...base,publicOrigin:()=>"https://public.test",submit:async()=>{calls++;return {status:"disabled"};}});
 assert.equal((await h.POST(req({requestId:id,content:"hello"},"https://public.test"))).status,200);
 assert.equal((await h.POST(req({requestId:id,content:"hello"},"https://hq.test"))).status,403);
 assert.equal(calls,1);
 for(const origin of ["https://public.test/","https://public.test/path","https://user:pass@public.test","garbage",""]){
 const bad=createMemexProposalHandlers({...base,publicOrigin:()=>origin});assert.equal((await bad.POST(req({requestId:id,content:"hello"},"https://public.test"))).status,403);
 }
});
