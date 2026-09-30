import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(process.cwd(), "src"), "server-only": path.join(process.cwd(), "src/scripts/smoke/server-only-stub.mjs") } });
const { resolveMemexProposalBinding: resolve, createMemexProposalTransport, MemexProposalConflict } = await jiti.import("./memex-proposal-transport.ts");
const { createMemexProposalService } = await jiti.import("../memory/memex-proposal-service.ts");
const namespace = "org:workspace:pilot";
const requestId = "90c66110-f711-4605-9c25-1451f387936a";
const handle = (patch = {}) => `amh1.${Buffer.from(JSON.stringify({ sub: "hq-contributor", access: "read_write", namespaces: [namespace], exp: Date.now()/1000+3600, ...patch })).toString("base64url")}.${"A".repeat(43)}`;
const env = { ORIA_ENABLE_MEMEX_PROPOSALS: "1", MEMEX_HTTP_HQ_WORKSPACE_ID: "pilot", MEMEX_HTTP_ENDPOINT: "https://memex.example/mcp", MEMEX_HTTP_PROPOSAL_HANDLE: handle() };
const binding = resolve(env,"pilot").binding;
const record = { version: 1, namespace, requestId, proposalId: "proposal_123", status: "proposed" };
const reply = (id,result) => new Response(JSON.stringify({jsonrpc:"2.0",id,result}), {headers:{"content-type":"application/json"}});

test("contribution has its own opt-in, credential and exact scope", () => {
  assert.equal(resolve({},"pilot").status,"disabled");
  assert.equal(resolve({...env,ORIA_ENABLE_MEMEX_PROPOSALS:"0"},"pilot").status,"disabled");
  assert.equal(resolve({...env,MEMEX_HTTP_PROPOSAL_HANDLE:undefined,MEMEX_HTTP_READ_HANDLE:handle()},"pilot").status,"unconfigured");
  assert.equal(resolve(env,"foreign").status,"workspace_unbound");
  for (const patch of [{access:"read_only"},{namespaces:[namespace,"org:foreign"]},{exp:0}]) assert.equal(resolve({...env,MEMEX_HTTP_PROPOSAL_HANDLE:handle(patch)},"pilot").status,"unconfigured");
  for (const endpoint of ["http://private/mcp","https://user:pass@memex.example/mcp","https://memex.example/mcp?key=x"]) assert.equal(resolve({...env,MEMEX_HTTP_ENDPOINT:endpoint},"pilot").status,"unconfigured");
});

test("write corridor rejects other tools, identity overrides and namespace mismatch before network", async () => {
  let calls=0;
  const transport=createMemexProposalTransport(binding,async (_,options)=>{ calls++; const req=JSON.parse(options.body); assert.equal(options.redirect,"error"); return reply(req.id,{content:[{type:"text",text:JSON.stringify(record)}]}); });
  for (const [tool,args] of [["agentmemory_graph_query",{namespace,requestId}], ["agentmemory_submit_proposal",{namespace,requestId,content:"x",proposedBy:"owner"}], ["agentmemory_submit_proposal",{namespace:"org:foreign",requestId,content:"x"}], ["agentmemory_submit_proposal",{namespace,requestId:"bad",content:"x"}]]) await assert.rejects(transport.callTool(tool,args),/scope_denied/);
  assert.equal(calls,0);
  assert.deepEqual(JSON.parse(await transport.callTool("agentmemory_submit_proposal",{namespace,requestId,content:"x"})),record);
  assert.equal(calls,1); await transport.close();
  await assert.rejects(transport.callTool("agentmemory_proposal_status",{namespace,requestId}),/closed/);
});

test("conflicts are recognized only by the exact bounded backend contract", async () => {
  const transport=createMemexProposalTransport(binding,async()=>reply(1,{isError:true,content:[{type:"text",text:JSON.stringify({warnings:["Submission request conflict"]})}]}));
  await assert.rejects(transport.callTool("agentmemory_submit_proposal",{namespace,requestId,content:"x"}),MemexProposalConflict);
});

test("service validates receipt scope and preserves uncertainty without retrying a submission", async () => {
  for (const value of [null,{...record,namespace:"org:foreign"},{...record,requestId:"foreign"},{...record,status:"verified"}, {secret:"must not leak"}]) {
    let calls=0,closed=0;
    const service=createMemexProposalService({env:()=>env,transport:()=>({callTool:async()=>{calls++;return JSON.stringify(value);},close:async()=>{closed++;}})});
    assert.deepEqual(await service.submitMemexProposal({workspaceId:"pilot",requestId,content:"x"}),{status:"outcome_unknown"});
    assert.equal(calls,1); assert.equal(closed,1);
  }
  const service=createMemexProposalService({env:()=>env,transport:()=>({callTool:async()=>{throw new Error("secret");},close:async()=>{}})});
  assert.deepEqual(await service.submitMemexProposal({workspaceId:"pilot",requestId,content:"x"}),{status:"outcome_unknown"});
  assert.deepEqual(await service.getMemexProposalReceipt({workspaceId:"pilot",requestId}),{status:"unavailable"});
});

test("receipt lookup is nonmutating, absent is distinct, status does not invent publication evidence", async () => {
  let raw=null;
  const service=createMemexProposalService({env:()=>env,transport:()=>({callTool:async(name,args)=>{assert.equal(name,"agentmemory_proposal_status");assert.deepEqual(args,{namespace,requestId});return JSON.stringify(raw);},close:async()=>{}})});
  assert.deepEqual(await service.getMemexProposalReceipt({workspaceId:"pilot",requestId}),{status:"not_found"});
  raw={...record,status:"promoted"};
  assert.deepEqual(await service.getMemexProposalReceipt({workspaceId:"pilot",requestId}),{status:"received",requestId,proposalId:record.proposalId,proposalStatus:"promoted",publicationStatus:"unknown"});
});
