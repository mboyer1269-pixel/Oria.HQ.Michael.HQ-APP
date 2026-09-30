import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createJiti } from "jiti";

test("HQ bridge consumes actual Memex handlers with isolated in-memory data", { skip: !process.env.MEMEX_CORE_TEST_ROOT }, async () => {
  const root = process.cwd();
  const memexRoot = process.env.MEMEX_CORE_TEST_ROOT;
  const load = relative => import(pathToFileURL(path.join(memexRoot, relative)).href);
  const graph = await load("src/graph.ts");
  const { guardedToolCall } = await load("src/mcp/unified-server.ts");
  const { getAuthorizedTools } = await load("src/mcp/capabilities.ts");
  const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src"), "server-only": path.join(root, "src/scripts/smoke/server-only-stub.mjs") } });
  const { enrichJorisMemoryContextWithMemex } = await jiti.import(path.join(root, "src/server/joris/memex-context-source.ts"));
  const { workspaceIdToMemexNamespace } = await jiti.import(path.join(root, "src/server/mcp/memex-readonly-client.ts"));
  const namespace = workspaceIdToMemexNamespace("contract-pilot");
  graph.initGraph(":memory:");
  try {
    graph.addEntity({ id: "reviewed", type: "Decision", namespace, name: "Use synthetic data", source: "operator-review:test", properties: { status: "verified", zone: "human" } });
    graph.addEntity({ id: "unproven", type: "Decision", namespace, name: "Exclude unknown source", properties: { status: "active" } });
    graph.addEntity({ id: "other-project", type: "Decision", namespace: "org:other", name: "Private", source: "operator-review:test", properties: { status: "verified", zone: "human" } });
    const calls = [];
    const transport = {
      listTools: async () => getAuthorizedTools("remote").map(tool => tool.name),
      callTool: async (name, args) => {
        calls.push(name);
        const response = await guardedToolCall({ subject: "hq-contract", access: "read_only", namespaces: [namespace], toolProfile: "remote" }, name, args);
        if (response.isError) throw new Error("Memex handler rejected synthetic request");
        return response.content.map(part => part.text).join("\n");
      },
      close: async () => {},
    };
    const result = await enrichJorisMemoryContextWithMemex({ existingContext: "existing", workspaceId: "contract-pilot", taskIntent: "review", transport });
    assert.equal(result.trace.status, "enriched");
    assert.deepEqual(result.evidencePack.memoryIds, ["reviewed"]);
    assert.equal(result.evidencePack.namespace, namespace);
    assert.equal(result.evidencePack.trustLevel, "untrusted");
    assert.equal(result.evidencePack.zone, "system");
    assert.equal(result.evidencePack.sourceTool, "agentmemory_graph_query");
    assert.deepEqual(calls, ["agentmemory_graph_query"]);
    assert.ok(!result.memoryContext.includes("other-project"));
    assert.ok(!result.memoryContext.includes("unproven"));
  } finally { graph.closeGraph(); }
});
