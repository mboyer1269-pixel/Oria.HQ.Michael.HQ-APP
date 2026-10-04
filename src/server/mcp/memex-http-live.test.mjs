import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createJiti } from "jiti";

test("HQ enrichment consumes the signed private Memex pilot over HTTP", { skip: process.env.MEMEX_HTTP_LIVE_TEST !== "1" }, async () => {
  const jiti = createJiti(import.meta.url, { alias: { "@": path.join(process.cwd(), "src"), "server-only": path.join(process.cwd(), "src/scripts/smoke/server-only-stub.mjs") } });
  const { enrichJorisMemoryContextWithMemex } = await jiti.import("../joris/memex-context-source.ts");
  // Endpoint and handle come only from the invoking process. Never print them.
  const env = { ORIA_ENABLE_MEMEX_HTTP_READONLY: "1", MEMEX_HTTP_ENDPOINT: process.env.MEMEX_HTTP_ENDPOINT,
    MEMEX_HTTP_READ_HANDLE: process.env.MEMEX_HTTP_READ_HANDLE, MEMEX_HTTP_HQ_WORKSPACE_ID: "pilot-a", VERCEL: "1" };
  assert.ok(env.MEMEX_HTTP_ENDPOINT && env.MEMEX_HTTP_READ_HANDLE, "Provide ephemeral live-test configuration");
  const result = await enrichJorisMemoryContextWithMemex({ existingContext: "Synthetic live test context", workspaceId: "pilot-a", taskIntent: "Check synthetic canary", env });
  assert.equal(result.trace.status, "enriched", "Live HTTP evidence was not accepted");
  assert.ok(result.evidencePack?.memoryIds.includes("memex-pilot-canary-a-v1"), "Expected synthetic project A canary");
  assert.equal(result.evidencePack.namespace, "org:workspace:pilot-a");
  assert.equal(result.evidencePack.trustLevel, "untrusted");
  assert.ok(!result.memoryContext.includes("SYNTHETIC_MEMEX_PILOT_B"), "Foreign project content must remain absent");
  const foreign = await enrichJorisMemoryContextWithMemex({ existingContext: "unchanged", workspaceId: "pilot-b", taskIntent: "Scope test", env });
  assert.equal(foreign.trace.reason, "Memex HTTP workspace_unbound");
  assert.equal(foreign.memoryContext, "unchanged"); assert.equal(foreign.evidencePack, null);
});
