import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createJiti } from "jiti";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const memexRoot = process.env.MEMEX_CORE_TEST_ROOT;
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});
const { prepareOpenHandsMemoryContext } = await jiti.import(path.join(__dirname, "openhands-memory-context.ts"));

const workspaceId = "hq-workspace";
const projectId = "oria-hq";
const projectNamespace = "org:oria-hq";
const nowIso = "2026-09-30T12:00:00.000Z";
const binding = {
  workspaceId,
  projectId,
  namespace: projectNamespace,
  namespaceScope: "project",
  centerEntityId: "project-oria-hq",
};

function resolver(value = binding) {
  return async (requestedWorkspaceId, requestedProjectId) => {
    assert.equal(requestedWorkspaceId, workspaceId);
    assert.equal(requestedProjectId, projectId);
    return value;
  };
}

function inertTransport() {
  let calls = 0;
  return {
    transport: {
      listTools: async () => { calls += 1; return ["agentmemory_context_pack"]; },
      callTool: async () => { calls += 1; return "{}"; },
      close: async () => {},
    },
    calls: () => calls,
  };
}

function fakeContextPackTransport(contextPack) {
  return {
    listTools: async () => ["agentmemory_context_pack"],
    callTool: async () => JSON.stringify(contextPack),
    close: async () => {},
  };
}

function validSyntheticContextPack() {
  const centerEntity = {
    id: binding.centerEntityId,
    type: "Project",
    namespace: projectNamespace,
    name: "ORIA HQ",
    source: "reviewed-source",
    createdAt: nowIso,
    properties: { status: "verified" },
  };
  return {
    graphContext: {
      centerEntity: structuredClone(centerEntity),
      entities: [centerEntity],
      relations: [],
      namespace: projectNamespace,
      tenant: projectNamespace,
    },
    provenance: [{ id: centerEntity.id, source: centerEntity.source, originId: null, confidence: 1 }],
    warnings: [],
    tokenEstimate: 20,
  };
}

test("OpenHands memory context requires a trusted project binding", async () => {
  const inert = inertTransport();
  const result = await prepareOpenHandsMemoryContext({
    workspaceId,
    projectId,
    resolveProjectBinding: async () => null,
    transport: inert.transport,
  });
  assert.deepEqual(result, { status: "unavailable", reason: "project_binding_missing" });
  assert.equal(inert.calls(), 0, "no Memex handshake or read without an explicit project binding");

  const workspaceBinding = { ...binding, namespace: "org:workspace:hq-workspace" };
  const invalid = await prepareOpenHandsMemoryContext({
    workspaceId,
    projectId,
    resolveProjectBinding: resolver(workspaceBinding),
    transport: inert.transport,
  });
  assert.deepEqual(invalid, { status: "unavailable", reason: "project_binding_invalid" });
  assert.equal(inert.calls(), 0);
});

test("context snapshot validates the center and projects only matching provenance", async (t) => {
  await t.test("rejects center data that diverges from the validated entity list", async () => {
    const pack = validSyntheticContextPack();
    pack.graphContext.centerEntity.name = "Different unvalidated center";
    const result = await prepareOpenHandsMemoryContext({
      workspaceId,
      projectId,
      resolveProjectBinding: resolver(),
      transport: fakeContextPackTransport(pack),
      now: () => new Date(nowIso),
    });
    assert.deepEqual(result, { status: "unavailable", reason: "context_pack_invalid" });
  });

  await t.test("drops provenance entries unrelated to selected graph records", async () => {
    const pack = validSyntheticContextPack();
    pack.provenance.push({ id: "foreign-extra", source: "must-not-enter-snapshot", originId: null, confidence: 1 });
    const result = await prepareOpenHandsMemoryContext({
      workspaceId,
      projectId,
      resolveProjectBinding: resolver(),
      transport: fakeContextPackTransport(pack),
      now: () => new Date(nowIso),
    });
    assert.equal(result.status, "ready");
    assert.ok(!result.snapshot.content.includes("foreign-extra"));
    assert.ok(!result.snapshot.content.includes("must-not-enter-snapshot"));
  });

  await t.test("rejects a serialized context over 4,000 characters", async () => {
    const pack = validSyntheticContextPack();
    pack.graphContext.entities[0].name = "x".repeat(4_100);
    pack.graphContext.centerEntity.name = pack.graphContext.entities[0].name;
    const result = await prepareOpenHandsMemoryContext({
      workspaceId,
      projectId,
      resolveProjectBinding: resolver(),
      transport: fakeContextPackTransport(pack),
      now: () => new Date(nowIso),
    });
    assert.equal(result.status, "unavailable", "the existing read-only client rejects the over-limit payload before parsing");
  });
});

test("OpenHands context_pack uses the real Memex in-memory handlers", { skip: !memexRoot }, async (t) => {
  const loadMemex = (relative) => import(pathToFileURL(path.join(memexRoot, relative)).href);
  const graph = await loadMemex("src/graph.ts");
  const { guardedToolCall } = await loadMemex("src/mcp/unified-server.ts");
  const { getAuthorizedTools } = await loadMemex("src/mcp/capabilities.ts");
  const capabilities = getAuthorizedTools("remote").map((tool) => tool.name);

  function transportFor(authorizedNamespaces = [projectNamespace]) {
    const calls = [];
    return {
      calls,
      transport: {
        listTools: async () => capabilities,
        callTool: async (name, args) => {
          const callRecord = { name, args, raw: null };
          calls.push(callRecord);
          const result = await guardedToolCall(
            { subject: "hq-openhands-memory-test", access: "read_only", namespaces: authorizedNamespaces, toolProfile: "remote" },
            name,
            args,
          );
          if (result.isError) throw new Error("synthetic Memex handler rejected the read");
          callRecord.raw = result.content.map((item) => item.text ?? "").join("\n");
          return callRecord.raw;
        },
        close: async () => {},
      },
    };
  }

  const addEntity = (id, namespace, source, status, createdAt = nowIso) => graph.addEntity({
    id,
    type: id === binding.centerEntityId ? "Project" : "Decision",
    namespace,
    name: id,
    source,
    createdAt,
    properties: { status },
  });
  const addProjectEdge = (sourceId, targetId) => graph.addRelation({
    id: `relation-${targetId}`,
    type: "RELATED_TO",
    sourceId,
    targetId,
    namespace: projectNamespace,
    source: "reviewed-project-link",
    createdAt: nowIso,
  });

  await t.test("selects the resolved anchor and excludes a different namespace", async () => {
    graph.initGraph(":memory:");
    try {
      addEntity(binding.centerEntityId, projectNamespace, "operator-reviewed", "verified");
      addEntity("decision-in-project", projectNamespace, "operator-reviewed", "active");
      addEntity("decision-other-namespace", "org:another-project", "operator-reviewed", "verified");
      addProjectEdge(binding.centerEntityId, "decision-in-project");

      const harness = transportFor();
      const result = await prepareOpenHandsMemoryContext({
        workspaceId,
        projectId,
        resolveProjectBinding: resolver(),
        transport: harness.transport,
        now: () => new Date(nowIso),
      });

      assert.equal(result.status, "ready", `${JSON.stringify(result)}; raw=${harness.calls[0]?.raw}`);
      assert.equal(result.snapshot.centerEntityId, binding.centerEntityId);
      assert.equal(result.snapshot.namespace, projectNamespace);
      assert.ok(result.snapshot.content.includes("decision-in-project"));
      assert.ok(!result.snapshot.content.includes("decision-other-namespace"));
      assert.ok(result.snapshot.content.includes("operator-reviewed"));
      assert.ok(result.snapshot.contentChars <= 4_000);
      assert.match(result.snapshot.snapshotHash, /^[a-f0-9]{64}$/);
      assert.equal(result.snapshot.snapshotHash, createHash("sha256").update(JSON.stringify({
        contractVersion: result.snapshot.contractVersion,
        sourceTool: result.snapshot.sourceTool,
        workspaceId: result.snapshot.workspaceId,
        projectId: result.snapshot.projectId,
        namespace: result.snapshot.namespace,
        centerEntityId: result.snapshot.centerEntityId,
        retrievedAtIso: result.snapshot.retrievedAtIso,
        content: result.snapshot.content,
        redactionsApplied: result.snapshot.redactionsApplied,
      })).digest("hex"));
      assert.deepEqual(harness.calls.map((call) => call.name), ["agentmemory_context_pack"]);
      assert.deepEqual(harness.calls[0].args, {
        namespace: projectNamespace,
        centerEntityId: binding.centerEntityId,
        maxEntities: 12,
        maxRelations: 16,
        format: "json",
      });
    } finally {
      graph.closeGraph();
    }
  });

  await t.test("remote namespace guard rejects a binding to a foreign project", async () => {
    graph.initGraph(":memory:");
    try {
      addEntity("private-foreign-center", "org:another-project", "operator-reviewed", "verified");
      const harness = transportFor();
      const result = await prepareOpenHandsMemoryContext({
        workspaceId,
        projectId,
        resolveProjectBinding: resolver({ ...binding, namespace: "org:another-project", centerEntityId: "private-foreign-center" }),
        transport: harness.transport,
        now: () => new Date(nowIso),
      });
      assert.equal(result.status, "unavailable");
      assert.equal(harness.calls.length, 1);
      assert.equal(harness.calls[0].args.namespace, "org:another-project");
    } finally {
      graph.closeGraph();
    }
  });

  await t.test("rejects a selected context containing a record without source provenance", async () => {
    graph.initGraph(":memory:");
    try {
      addEntity(binding.centerEntityId, projectNamespace, "operator-reviewed", "verified");
      addEntity("decision-without-source", projectNamespace, undefined, "active");
      addProjectEdge(binding.centerEntityId, "decision-without-source");
      const harness = transportFor();
      const result = await prepareOpenHandsMemoryContext({
        workspaceId,
        projectId,
        resolveProjectBinding: resolver(),
        transport: harness.transport,
        now: () => new Date(nowIso),
      });
      assert.deepEqual(result, { status: "unavailable", reason: "context_pack_invalid" });
    } finally {
      graph.closeGraph();
    }
  });
});
