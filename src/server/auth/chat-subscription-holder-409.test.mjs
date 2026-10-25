// The subscription CLI path of /api/joris/chat is reserved to the subscription holder
// (MICHAEL_HQ_OWNER_ID by default), so it stays safe once stacked on #410.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createJiti } from "jiti";

process.env.NODE_ENV = "test";
delete process.env.ORIA_SUBSCRIPTION_OWNERS;
delete process.env.MICHAEL_HQ_OWNER_EMAIL;
process.env.MICHAEL_HQ_OWNER_ID = "holder";
const dir = mkdtempSync(path.join(tmpdir(), "sub-owner-"));
const fixture = path.join(dir, "supabase-fixture.mjs");
writeFileSync(fixture, `export async function createServerSupabaseClient() {
  return { auth: { getUser: async () => ({ data: { user: globalThis.subOwnerTestUser ?? null }, error: null }) } };
}`);
const src = path.resolve("src");
const jiti = createJiti(import.meta.url, { alias: {
  "@/lib/supabase/server": fixture, "@": src,
  "server-only": path.join(src, "scripts/smoke/server-only-stub.mjs"),
} });
const { GET, POST } = await jiti.import("../../app/api/joris/chat/route.ts");
const selection = { runtimeId: "codex", modelId: "gpt-x", catalogRevision: "r1" };
const post = () => POST(new Request("http://localhost/api/joris/chat", { method: "POST", body: JSON.stringify({ message: "bonjour", subscriptionSelection: selection }) }));
const subscriptionOptionCount = async () => (await (await GET(new Request("http://localhost/api/joris/chat"))).json())
  .options.filter((o) => o.consumptionMode === "subscription").length;

test.after(() => { delete globalThis.__ownerApiSessionTestResult; delete globalThis.subOwnerTestUser; });

test("non-holder passing the owner gate → 403 SUBSCRIPTION_OWNER_ONLY before any CLI", async () => {
  globalThis.__ownerApiSessionTestResult = null; // owner gate passes (e.g. email owner / future #410 workspace owner)
  for (const user of [{ id: "other-owner" }, null]) {
    globalThis.subOwnerTestUser = user;
    const res = await post();
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, "SUBSCRIPTION_OWNER_ONLY");
    assert.equal(typeof body.error, "string");
  }
});

test("empty holder configuration admits nobody", async () => {
  const saved = process.env.MICHAEL_HQ_OWNER_ID;
  delete process.env.MICHAEL_HQ_OWNER_ID;
  globalThis.__ownerApiSessionTestResult = null;
  globalThis.subOwnerTestUser = { id: "holder" };
  assert.equal((await post()).status, 403);
  process.env.MICHAEL_HQ_OWNER_ID = saved;
});

test("holder passes the guard (reaches the runtime, not 403)", async () => {
  globalThis.__ownerApiSessionTestResult = null;
  globalThis.subOwnerTestUser = { id: "holder" };
  delete process.env.ORIA_HQ_SUBSCRIPTION_RUNTIMES; // runtime disabled → blocked result, no spawn
  const res = await post();
  assert.notEqual(res.status, 403);
});

test("GET lists subscription options to the holder only", async () => {
  const file = path.join(dir, "catalog.json");
  writeFileSync(file, JSON.stringify({ revision: "r1", entries: [{ runtimeId: "codex", modelId: "gpt-x" }] }));
  Object.assign(process.env, { ORIA_HQ_SUBSCRIPTION_RUNTIMES: "1", ORIA_HQ_SUBSCRIPTION_RUNTIMES_FILE: file });
  globalThis.__ownerApiSessionTestResult = null;
  globalThis.subOwnerTestUser = { id: "holder" };
  assert.ok(await subscriptionOptionCount() > 0, "control: the holder sees the subscription option");
  globalThis.subOwnerTestUser = { id: "other-owner" };
  assert.equal(await subscriptionOptionCount(), 0);
  delete process.env.ORIA_HQ_SUBSCRIPTION_RUNTIMES;
  delete process.env.ORIA_HQ_SUBSCRIPTION_RUNTIMES_FILE;
});
