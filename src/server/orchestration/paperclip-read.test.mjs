import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createJiti } from "jiti";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const jiti = createJiti(import.meta.url, { alias: {
  "@": path.join(root, "src"), "server-only": path.join(root, "src/__server-only-noop.js"),
} });
const { resolvePaperclipBinding } = await jiti.import("./workspace-binding.ts");
const { readPaperclipIssues } = await jiti.import("./paperclip-client.ts");
const { createPaperclipReadHandler } = await jiti.import("./paperclip-read-handler.ts");
const { GET } = await jiti.import(path.join(root, "src/app/api/orchestration/missions/route.ts"));
const companyId = "11111111-1111-4111-8111-111111111111";
const binding = { baseUrl: "https://paperclip.example", token: "pcp_board_synthetic_test_only_12345", workspaceId: "test", companyId };
const issue = { id: "22222222-2222-4222-8222-222222222222", companyId, projectId: null,
  parentId: null, title: "Synthetic task", status: "in_review", assigneeAgentId: null,
  updatedAt: "2026-09-29T00:00:00.000Z" };
const json = (body, options = {}) => new Response(JSON.stringify(body), {
  headers: { "content-type": "application/json" }, ...options,
});

test("binding is opt-in and never accepts a client-selected or unsafe origin", () => {
  assert.equal(resolvePaperclipBinding({ enabled: false }, "test").status, "disabled");
  assert.equal(resolvePaperclipBinding({ enabled: true }, "test").status, "unconfigured");
  assert.equal(resolvePaperclipBinding({ ...binding, enabled: true }, "other").status, "workspace_unbound");
  for (const baseUrl of ["http://remote.example", "https://user:secret@remote.example", "https://remote.example/api", "https://remote.example/?token=x", "https://remote.example/#fragment", "file:///tmp/x"]) {
    assert.equal(resolvePaperclipBinding({ ...binding, baseUrl, enabled: true }, "test").status, "unconfigured");
  }
  assert.equal(resolvePaperclipBinding({ ...binding, companyId: "../other", enabled: true }, "test").status, "unconfigured");
  assert.equal(resolvePaperclipBinding({ ...binding, token: "token\r\ninjected", enabled: true }, "test").status, "unconfigured");
  assert.equal(resolvePaperclipBinding({ ...binding, baseUrl: "http://127.0.0.1:3100", enabled: true }, "test").status, "ready");
});

test("one fixed authenticated GET returns only validated company-scoped fields", async () => {
  let calls = 0;
  const result = await readPaperclipIssues(binding, async (url, options) => {
    calls++;
    assert.equal(String(url), `https://paperclip.example/api/companies/${companyId}/issues?limit=50&offset=0&sortField=updated&sortDir=desc`);
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.equal(options.cache, "no-store");
    assert.equal(options.headers.Authorization, `Bearer ${binding.token}`);
    return json([{ ...issue, description: "not needed", privateMetadata: "never project" }]);
  });
  assert.equal(calls, 1);
  assert.deepEqual(result.issues, [issue]);
  assert.equal(result.page.mayHaveMore, false);
  assert.ok(!JSON.stringify(result).includes(binding.token));
});

test("invalid, cross-company, duplicate and excessive upstream results fail closed", async () => {
  for (const body of [{ issues: [issue] }, [{ ...issue, companyId: "33333333-3333-4333-8333-333333333333" }],
    [{ ...issue, status: "unknown" }], [{ ...issue, updatedAt: "yesterday" }], [issue, issue], Array(51).fill(issue)]) {
    await assert.rejects(readPaperclipIssues(binding, async () => json(body)), { code: "invalid_response" });
  }
  await assert.rejects(readPaperclipIssues(binding, async () => new Response("x".repeat(524289), { headers: { "content-type": "application/json" } })), { code: "invalid_response" });
  await assert.rejects(readPaperclipIssues(binding, async () => new Response("private provider error", { status: 401 })), { code: "upstream_unavailable" });
  await assert.rejects(readPaperclipIssues(binding, async () => { throw new Error(binding.token); }), { message: "upstream_unavailable" });
});

test("transport aborts a stalled provider without exposing its error", async () => {
  await assert.rejects(readPaperclipIssues(binding, async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("private timeout diagnostic")), { once: true });
  })), { code: "timeout" });
});

test("route authenticates first, rejects query overrides and sanitizes the read result", async () => {
  let calls = 0;
  let settings = { ...binding, enabled: false };
  let fakeFetch = async () => { calls++; return json([{ ...issue, secret: binding.token }]); };
  const handler = createPaperclipReadHandler({ authorize: async () => null, workspaceId: () => "test",
    settings: () => settings, fetcher: (...args) => fakeFetch(...args) });
  const request = (query = "") => new Request(`http://localhost/api/orchestration/missions${query}`);
  try {
    globalThis.__ownerApiSessionTestResult = new Response(null, { status: 401 });
    assert.equal((await GET(request())).status, 401);
    globalThis.__ownerApiSessionTestResult = new Response(null, { status: 403 });
    assert.equal((await GET(request())).status, 403);
    assert.equal(calls, 0);
    globalThis.__ownerApiSessionTestResult = null;
    assert.deepEqual(await (await handler(request())).json(), { status: "disabled" });
    assert.equal((await handler(request("?companyId=other"))).status, 400);
    settings = { ...binding, enabled: true, workspaceId: "wrong-workspace" };
    assert.deepEqual(await (await handler(request())).json(), { status: "workspace_unbound" });
    assert.equal(calls, 0);
    settings.workspaceId = "test";
    const response = await handler(request());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = await response.json();
    assert.deepEqual(body.issues, [issue]);
    assert.ok(!JSON.stringify(body).includes(binding.token));
    fakeFetch = async () => { throw new Error(`bad ${binding.token}`); };
    const failed = await handler(request());
    assert.equal(failed.status, 502);
    assert.deepEqual(await failed.json(), { status: "upstream_unavailable" });
  } finally {
    delete globalThis.__ownerApiSessionTestResult;
  }
});
