import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(process.cwd(), "src"), "server-only": path.join(process.cwd(), "src/scripts/smoke/server-only-stub.mjs") } });
const { createMemorySearchHandler } = await jiti.import("./search-handler.ts");
const payload = Buffer.from(JSON.stringify({ sub: "test", access: "read_only", exp: Date.now()/1000+600, namespaces: ["org:workspace:test"] })).toString("base64url");
const env = { ORIA_ENABLE_MEMEX_HTTP_READONLY: "1", MEMEX_HTTP_HQ_WORKSPACE_ID: "test", MEMEX_HTTP_ENDPOINT: "https://example.test/mcp", MEMEX_HTTP_READ_HANDLE: `amh1.${payload}.${"a".repeat(43)}` };
const request = q => new Request(`https://hq.test/api/memory/search${q}`);
test("denial happens before scope or network; client scope forbidden", async () => {
  const denied = createMemorySearchHandler({ authorize: async()=>new Response(null,{status:401}),workspaceId:()=>{throw Error("should not run");} });
  assert.equal((await denied(request(""))).status,401);
  const handler=createMemorySearchHandler({authorize:async()=>null,workspaceId:()=>"test",env:()=>env});
  assert.equal((await handler(request("?namespace=foreign"))).status,400);
  assert.equal((await handler(request(`?q=${"a".repeat(201)}`))).status,400);
});
test("disabled differs from unavailable and successful empty; transport closed",async()=>{
  const base={authorize:async()=>null,workspaceId:()=>"test"};
  assert.equal((await (await createMemorySearchHandler({...base,env:()=>({})})(request(""))).json()).status,"disabled");
  let closed=0;
  const handler=createMemorySearchHandler({...base,env:()=>env,transport:()=>({listTools:async()=>["agentmemory_graph_query"],callTool:async()=>"[]",close:async()=>{closed++;}})});
  assert.deepEqual((await (await handler(request(""))).json()).records,[]); assert.equal(closed,1);
});
test("foreign/malformed rows fail closed; errors never disclose transport secrets",async()=>{
  for(const raw of ['[{"id":"x","type":"Memory","namespace":"foreign"}]','{}']){
    const handler=createMemorySearchHandler({authorize:async()=>null,workspaceId:()=>"test",env:()=>env,transport:()=>({listTools:async()=>["agentmemory_graph_query"],callTool:async()=>raw,close:async()=>{}})});
    const response=await handler(request("")); assert.equal(response.status,503); assert.equal((await response.json()).status,"unavailable");
  }
});
test("bounded text filter retains provenance without claiming verification",async()=>{
  const handler=createMemorySearchHandler({authorize:async()=>null,workspaceId:()=>"test",env:()=>env,transport:()=>({listTools:async()=>["agentmemory_graph_query"],callTool:async()=>JSON.stringify([{id:"a",type:"Memory",namespace:"org:workspace:test",name:"Canary",properties:{content:"test",status:"verified"},source:"operator-review",confidence:0.7}]),close:async()=>{}})});
  const body=await (await handler(request("?q=canary"))).json(); assert.equal(body.records.length,1); assert.equal(body.records[0].provenance,"operator-review"); assert.equal(body.verification,"not_independently_verified"); assert.equal(body.limit,50);
  assert.equal((await (await handler(request("?q=absent"))).json()).status,"ready");
});
