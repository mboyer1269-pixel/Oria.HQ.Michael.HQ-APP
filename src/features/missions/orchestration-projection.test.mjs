import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { parseOrchestrationResponse: parse, loadOrchestration, reportedStatusLabel } = await jiti.import("./orchestration-projection.ts");
const issue = { id: "11111111-1111-4111-8111-111111111111", title: "Test synthétique", status: "done", assigneeAgentId: null, updatedAt: "2026-09-29T00:00:00Z" };
const snapshot = { source: "paperclip", workspaceId: "test", observedAt: issue.updatedAt, issues: [issue], page: { limit: 50, offset: 0, mayHaveMore: false } };
test("reported completion stays attributed, never verified", () => {
  assert.equal(parse(200, snapshot, "test").kind, "ready");
  assert.equal(reportedStatusLabel("done"), "Terminée selon Paperclip");
  assert.equal(parse(200, { ...snapshot, issues: [] }, "test").kind, "ready");
});
test("disabled, unconfigured and access denied cannot become empty success", () => {
  for (const status of ["disabled", "unconfigured", "workspace_unbound", "unexpected"]) assert.equal(parse(503, { status }, "test").kind, "unavailable");
  for (const status of [401, 403, 502, 504]) assert.equal(parse(status, snapshot, "test").kind, "unavailable");
});
test("malformed, duplicate and foreign workspace responses fail closed", () => {
  for (const body of [null, {}, { ...snapshot, workspaceId: "other" }, { ...snapshot, issues: [issue, issue] }, { ...snapshot, issues: [{ ...issue, status: "verified" }] }]) assert.equal(parse(200, body, "test").kind, "unavailable");
});
test("fetch uses only fixed authenticated same-origin read and handles non-JSON/auth errors", async () => {
  const signal = new AbortController().signal;
  const state = await loadOrchestration("test", signal, async (url, options) => {
    assert.equal(url, "/api/orchestration/missions");
    assert.equal(options.signal, signal); assert.equal(options.credentials, "same-origin");
    assert.equal(options.cache, "no-store"); assert.equal(options.redirect, "error");
    return new Response("not JSON", { status: 401 });
  });
  assert.equal(state.kind, "unavailable"); assert.match(state.message, /Accès refusé/);
  assert.equal((await loadOrchestration("test", signal, async () => { throw new Error("private"); })).kind, "unavailable");
});
