// SENT-X-1: after #409 × #410, the subscription CLI path of /api/joris/chat is workspace-owner only.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createJiti } from "jiti";

process.env.NODE_ENV = "test";
delete process.env.MICHAEL_HQ_OWNER_ID;
delete process.env.MICHAEL_HQ_OWNER_EMAIL;
const src = path.resolve("src");
const fixture = path.join(src, "server/auth/test-fixtures/authz-dependencies.mjs");
const jiti = createJiti(import.meta.url, { alias: {
  "@/lib/supabase/server": fixture, "@/server/supabase/admin": fixture, "@": src,
  "server-only": path.join(src, "scripts/smoke/server-only-stub.mjs"),
} });
process.env.ORIA_WORKSPACE_MEMBERS = JSON.stringify([
  { userId: "owner", workspaceId: "wsA", role: "owner" }, { userId: "member", workspaceId: "wsA", role: "member" },
  { userId: "owner2", workspaceId: "wsB", role: "owner" },
]);
process.env.ORIA_SUBSCRIPTION_OWNERS = "owner";
const { GET, POST } = await jiti.import("../../app/api/joris/chat/route.ts");
const chat = (body) => new Request("http://localhost/api/joris/chat?workspace=wsA", { method: "POST", headers: { "x-oria-workspace": "wsA" }, body: JSON.stringify(body) });

test("member + subscriptionSelection → 403 SUBSCRIPTION_OWNER_ONLY, before any CLI", async () => {
  globalThis.authzTestUser = { id: "member" };
  const res = await POST(chat({ message: "bonjour", subscriptionSelection: { runtimeId: "codex", modelId: "gpt-x", catalogRevision: "r1" } }));
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.code, "SUBSCRIPTION_OWNER_ONLY"); assert.equal(typeof body.error, "string");
});
test("SENT-412-8: owner of another workspace (not the subscription owner) → 403 SUBSCRIPTION_OWNER_ONLY", async () => {
  globalThis.authzTestUser = { id: "owner2" };
  const res = await POST(new Request("http://localhost/api/joris/chat?workspace=wsB", { method: "POST", headers: { "x-oria-workspace": "wsB" }, body: JSON.stringify({ message: "bonjour", subscriptionSelection: { runtimeId: "codex", modelId: "gpt-x", catalogRevision: "r1" } }) }));
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, "SUBSCRIPTION_OWNER_ONLY");
});
test("GET lists subscription options to the owner only", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "subcat-")); const file = path.join(dir, "catalog.json");
  writeFileSync(file, JSON.stringify({ revision: "r1", entries: [{ runtimeId: "codex", modelId: "gpt-x" }] }));
  Object.assign(process.env, { ORIA_HQ_SUBSCRIPTION_RUNTIMES: "1", ORIA_HQ_SUBSCRIPTION_RUNTIMES_FILE: file });
  const subs = async (id) => { globalThis.authzTestUser = { id };
    const body = await (await GET(new Request("http://localhost/api/joris/chat?workspace=wsA"))).json();
    return body.options.filter((o) => o.consumptionMode === "subscription").length; };
  assert.ok(await subs("owner") > 0, "control: the owner does see the subscription option");
  assert.equal(await subs("member"), 0);
  globalThis.authzTestUser = { id: "owner2" };
  const b2 = await (await GET(new Request("http://localhost/api/joris/chat?workspace=wsB"))).json();
  assert.equal(b2.options.filter((o) => o.consumptionMode === "subscription").length, 0, "owner of wsB, not subscription owner");
});
