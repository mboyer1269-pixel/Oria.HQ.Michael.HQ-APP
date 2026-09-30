import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { createServer } from "node:http";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(process.cwd(), "src"), "server-only": path.join(process.cwd(), "src/scripts/smoke/server-only-stub.mjs") } });
const { resolveMemexHttpBinding: resolve, createHttpMemexTransport } = await jiti.import("./memex-http-transport.ts");
const { resolveMemexProjectHttpBinding, createProjectHttpMemexTransport } = await jiti.import("./memex-http-transport.ts");
const { prepareOpenHandsMemoryContext } = await jiti.import("../missions/openhands-memory-context.ts");
const { enrichJorisMemoryContextWithMemex } = await jiti.import("../joris/memex-context-source.ts");
const namespace = "org:workspace:pilot";
const handle = (patch = {}) => `amh1.${Buffer.from(JSON.stringify({ sub: "synthetic", access: "read_only", namespaces: [namespace], exp: Date.now() / 1000 + 3600, ...patch })).toString("base64url")}.${"A".repeat(43)}`;
const env = { ORIA_ENABLE_MEMEX_HTTP_READONLY: "1", MEMEX_HTTP_ENDPOINT: "https://memex.example/mcp", MEMEX_HTTP_READ_HANDLE: handle(), MEMEX_HTTP_HQ_WORKSPACE_ID: "pilot" };
const binding = resolve(env, "pilot").binding;
const response = result => new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });

test("project transport requires a dedicated handle and cannot widen the workspace reader", async () => {
  const projectNamespace = 'org:project-a';
  assert.equal(resolveMemexProjectHttpBinding(env, 'pilot', projectNamespace).status, 'unconfigured');
  const projectEnv = { ...env, MEMEX_HTTP_READ_HANDLE: handle({ namespaces: [projectNamespace] }) };
  assert.equal(resolve(projectEnv, 'pilot').status, 'unconfigured');
  assert.equal(resolveMemexProjectHttpBinding(projectEnv, 'other', projectNamespace).status, 'workspace_unbound');
  for (const ns of [namespace, 'org:workspace:other', 'invalid', 'personal']) {
    assert.equal(resolveMemexProjectHttpBinding(projectEnv, 'pilot', ns).status, 'unconfigured');
  }
  for (const namespaces of [[projectNamespace, namespace], ['org:other']]) {
    assert.equal(resolveMemexProjectHttpBinding({ ...projectEnv, MEMEX_HTTP_READ_HANDLE: handle({ namespaces }) }, 'pilot', projectNamespace).status, 'unconfigured');
  }
  const resolved = resolveMemexProjectHttpBinding(projectEnv, 'pilot', projectNamespace);
  assert.equal(resolved.status, 'ready');
  assert.throws(() => createHttpMemexTransport(resolved.binding), /scope_denied/);
  let calls = 0;
  const entity = { id: 'anchor', namespace: projectNamespace, type: 'Project', source: 'reviewed', properties: { status: 'verified' } };
  const transport = createProjectHttpMemexTransport(resolved.binding, async (_url, init) => {
    calls++; const request = JSON.parse(init.body);
    assert.equal(init.headers.Authorization, `Bearer ${projectEnv.MEMEX_HTTP_READ_HANDLE}`);
    if (request.method === 'tools/call') {
      assert.equal(request.params.name, 'agentmemory_context_pack');
      assert.equal(request.params.arguments.namespace, projectNamespace);
    }
    const result = request.method === 'tools/list' ? { tools: [{name:'agentmemory_context_pack'}, {name:'agentmemory_graph_query'}, {name:'agentmemory_write_vault_file'}] } : {
      content: [{ type:'text', text: JSON.stringify({ graphContext: { namespace:projectNamespace, tenant:projectNamespace, centerEntity:entity, entities:[entity], relations:[] }, provenance:[{id:entity.id,source:entity.source}] }) }] };
    return response({jsonrpc:'2.0',id:request.id,result});
  });
  try {
    const result = await prepareOpenHandsMemoryContext({workspaceId:'pilot',projectId:'project-a',transport,
      resolveProjectBinding:async()=>({workspaceId:'pilot',projectId:'project-a',namespace:projectNamespace,namespaceScope:'project',centerEntityId:'anchor'})});
    assert.equal(result.status,'ready');assert.equal(calls,2);
    for (const [name, ns] of [['agentmemory_context_pack',namespace],['agentmemory_graph_query',projectNamespace],['agentmemory_write_vault_file',projectNamespace]]) {
      await assert.rejects(transport.callTool(name,{namespace:ns}),/scope_denied/);
    }
    assert.equal(calls,2,'forbidden tools/scopes never reach HTTP');
  } finally { await transport.close(); }
});
test("binding enforces opt-in, exact workspace, endpoint and single read namespace", () => {
  assert.equal(resolve({}, "pilot").status, "disabled");
  assert.equal(resolve(env, "other").status, "workspace_unbound");
  for (const endpoint of ["http://internal/mcp", "https://user:secret@memex.example/mcp", "https://memex.example/mcp?token=x", "https://memex.example/other"]) assert.equal(resolve({ ...env, MEMEX_HTTP_ENDPOINT: endpoint }, "pilot").status, "unconfigured");
  for (const patch of [{ access: "read_write" }, { namespaces: [namespace, "org:other"] }, { namespaces: ["org:other"] }, { exp: 1 }]) assert.equal(resolve({ ...env, MEMEX_HTTP_READ_HANDLE: handle(patch) }, "pilot").status, "unconfigured");
  assert.equal(resolve({ ...env, MEMEX_HTTP_ENDPOINT: "http://127.0.0.1:4444/mcp" }, "pilot").status, "ready");
});
test("fixed authenticated RPC reads only authorized namespace; no writes or scope override", async () => {
  const calls = [];
  const transport = createHttpMemexTransport(binding, async (url, init) => {
    assert.equal(url, env.MEMEX_HTTP_ENDPOINT); assert.equal(init.redirect, "error"); assert.equal(init.headers.Authorization, `Bearer ${env.MEMEX_HTTP_READ_HANDLE}`);
    const request = JSON.parse(init.body); calls.push(request);
    return response({ jsonrpc: "2.0", id: request.id, result: request.method === "tools/list" ? { tools: [{ name: "agentmemory_graph_query" }, { name: "agentmemory_write_vault_file" }] } : { content: [{ type: "text", text: "[]" }] } });
  });
  assert.deepEqual(await transport.listTools(), ["agentmemory_graph_query"]);
  assert.equal(await transport.callTool("agentmemory_graph_query", { namespace, limit: 10 }), "[]");
  await assert.rejects(transport.callTool("agentmemory_write_vault_file", { namespace }), /scope_denied/);
  await assert.rejects(transport.callTool("agentmemory_graph_query", { namespace: "org:other" }), /scope_denied/);
  assert.equal(calls.length, 2); await transport.close();
  await assert.rejects(transport.listTools(), /closed/);
});
test("malformed, error, mismatched RPC and nontext results never become evidence", async () => {
  for (const body of [{}, { jsonrpc: "2.0", id: 99, result: {} }, { jsonrpc: "2.0", id: 1, error: { message: env.MEMEX_HTTP_READ_HANDLE } }, { jsonrpc: "2.0", id: 1, result: { isError: true, content: [{ type: "text", text: "secret" }] } }, { jsonrpc: "2.0", id: 1, result: { content: [{ type: "image" }] } }]) {
    const transport = createHttpMemexTransport(binding, async () => response(body));
    await assert.rejects(transport.callTool("agentmemory_graph_query", { namespace }), error => error.message === "Memex HTTP invalid_response");
  }
  const transport = createHttpMemexTransport(binding, async () => { throw new Error(env.MEMEX_HTTP_READ_HANDLE); });
  await assert.rejects(transport.listTools(), error => error.message === "Memex HTTP unavailable");
});
test("oversized body is rejected and close aborts in-flight reads", async () => {
  const large = createHttpMemexTransport(binding, async () => new Response("x".repeat(512 * 1024 + 1), { headers: { "content-type": "application/json" } }));
  await assert.rejects(large.listTools(), /invalid_response/);
  let signal;
  const pending = createHttpMemexTransport(binding, async (_, options) => { signal = options.signal; return new Promise(() => {}); });
  const read = pending.listTools(); await pending.close();
  await assert.rejects(read, /closed/); assert.equal(signal.aborted, true);
});
test("deadline bounds even stalled fetch and response streams", async () => {
  const factories = [async () => new Promise(() => {}), async () => new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "application/json" } })];
  await Promise.all(factories.map(async fetcher => {
    const transport = createHttpMemexTransport(binding, fetcher);
    await assert.rejects(transport.listTools(), /timeout/); await transport.close();
  }));
});
test("foreign HTTP binding fails closed instead of falling back to local stdio", async () => {
  let spawned = false;
  const result = await enrichJorisMemoryContextWithMemex({ existingContext: "keep", workspaceId: "other", taskIntent: "test", env: { ...env, MEMEX_CORE_ROOT: "C:/synthetic" }, createTransport: async () => { spawned = true; throw new Error("must not spawn"); } });
  assert.equal(result.memoryContext, "keep"); assert.equal(result.trace.reason, "Memex HTTP workspace_unbound"); assert.equal(spawned, false);
});

test("real loopback HTTP factory enriches cloud context while excluding foreign evidence", async () => {
  let requests = 0;
  const server = createServer(async (request, reply) => {
    let raw = ""; for await (const part of request) raw += part;
    const rpc = JSON.parse(raw); requests++;
    const entity = { id: "canary", type: "Decision", namespace, name: "Synthetic scoped fact", source: "operator-review:test", createdAt: new Date().toISOString(), properties: { status: "verified", zone: "human" } };
    const result = rpc.method === "tools/list" ? { tools: [{ name: "agentmemory_graph_query" }] } : { content: [{ type: "text", text: JSON.stringify([entity, { ...entity, id: "foreign", namespace: "org:other", name: "Foreign fact" }]) }] };
    reply.writeHead(200, { "content-type": "application/json" }); reply.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const result = await enrichJorisMemoryContextWithMemex({ existingContext: "keep", workspaceId: "pilot", taskIntent: "test", env: { ...env, VERCEL: "1", MEMEX_HTTP_ENDPOINT: `http://127.0.0.1:${server.address().port}/mcp` } });
    assert.equal(result.trace.status, "enriched"); assert.deepEqual(result.evidencePack.memoryIds, ["canary"]);
    assert.ok(!result.memoryContext.includes("Foreign fact")); assert.equal(result.evidencePack.trustLevel, "untrusted"); assert.equal(requests, 2);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});


test("mounted handle rotates atomically without restart and fails closed on invalid files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hq-memex-handle-"));
  try {
    const filename = path.join(dir, "handle");
    const config = { ...env, MEMEX_HTTP_READ_HANDLE: undefined, MEMEX_HTTP_READ_HANDLE_FILE: filename };
    assert.equal(resolve(config, "pilot").status, "unconfigured");
    fs.writeFileSync(filename, handle() + "\n");
    assert.equal(resolve(config, "pilot").status, "ready");
    assert.equal(resolve({...config, MEMEX_HTTP_READ_HANDLE: handle()}, "pilot").status, "unconfigured");
    const next = path.join(dir, "next");
    fs.writeFileSync(next, handle({exp: 1})); fs.renameSync(next, filename);
    assert.equal(resolve(config, "pilot").status, "unconfigured");
    fs.writeFileSync(next, handle({sub: "rotated"})); fs.renameSync(next, filename);
    assert.equal(resolve(config, "pilot").status, "ready");
    fs.writeFileSync(filename, "A".repeat(8193));
    assert.equal(resolve(config, "pilot").status, "unconfigured");
    assert.equal(resolve({...config, MEMEX_HTTP_READ_HANDLE_FILE: dir}, "pilot").status, "unconfigured");
    assert.equal(resolve({...config, ORIA_ENABLE_MEMEX_HTTP_READONLY: "0"}, "pilot").status, "disabled");
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
});
