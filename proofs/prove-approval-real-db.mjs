/**
 * G2 — real PostgreSQL + PostgREST proof of the execution-intent approval
 * binding (no mock store, no in-memory fallback).
 *
 * Runs the REAL Next route handlers (create + approve) against a disposable
 * PostgreSQL/PostgREST started by proofs/run-approval-real-db.sh. The Supabase
 * client talks to PostgREST through a local /rest/v1 gateway (same pattern as
 * proofs/prove-cli-real-db.mjs). Only the outbound n8n webhook is replaced by
 * a counting spy; every DB call goes to the real database.
 *
 * Proofs:
 *  1. Promise.all double approve -> exactly one 200 and one 409, one dispatch,
 *     exactly one ledger 'action' attempt row for the intent.
 *  2a. Payload rewritten in DB (service role) before approve, old hash -> 409 changed.
 *  2b. Payload rewritten in DB between the route's read and its claim UPDATE
 *      (injected at the gateway) -> claim matches 0 rows (jsonb equality) ->
 *      409 changed, row stays pending, no dispatch.
 *  3. Ledger insert refused by Postgres (INSERT privilege revoked) -> 500,
 *     conditional revert leaves the row 'pending', no dispatch.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = process.env.HQ_ROOT || process.cwd();
const REST = process.env.POSTGREST_DIRECT_URL;
const PSQL = process.env.PSQL_CMD; // e.g. "docker exec -i <pg> psql -U postgres -X -q -v ON_ERROR_STOP=1"
assert.ok(REST, "POSTGREST_DIRECT_URL is required");
assert.ok(PSQL, "PSQL_CMD is required");

function sql(statement) {
  const [cmd, ...args] = PSQL.split(" ");
  const r = spawnSync(cmd, [...args, "-A", "-t", "-c", statement], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`psql failed: ${r.stderr}`);
  return r.stdout.trim();
}

let beforeClaim = null; // async hook run when the claim PATCH passes the gateway
const gateway = createServer(async (req, res) => {
  try {
    if (!req.url.startsWith("/rest/v1/")) {
      res.writeHead(404).end("{}");
      return;
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const headers = { ...req.headers };
    for (const h of ["authorization", "apikey", "host", "content-length"]) delete headers[h];
    const target = REST + req.url.slice("/rest/v1".length);
    if (
      req.method === "PATCH" &&
      req.url.includes("agent_execution_intents") &&
      req.url.includes("status=eq.pending") &&
      beforeClaim
    ) {
      const hook = beforeClaim;
      beforeClaim = null;
      await hook();
    }
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    const out = Object.fromEntries(upstream.headers);
    delete out["content-encoding"];
    delete out["transfer-encoding"];
    res.writeHead(upstream.status, out).end(body);
  } catch (err) {
    res.writeHead(502).end(JSON.stringify({ error: String(err) }));
  }
});
await new Promise((r) => gateway.listen(0, "127.0.0.1", r));

const OWNER = "00000000-0000-4000-8000-0000000000a1";
process.env.NODE_ENV = "test";
process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${gateway.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-disposable-qualification-key";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic-disposable-anon-key";
process.env.MICHAEL_HQ_OWNER_ID = OWNER;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
process.env.N8N_WEBHOOK_URL = "http://127.0.0.1:9/webhook/approval-real-db";
process.env.N8N_SECRET = "test-static-secret";
process.env.AGENT_WEBHOOK_SIGNING_SECRET = "test-signing-secret";

const { createJiti } = await import("jiti");
const jiti = createJiti(path.join(ROOT, "proofs/prove-approval-real-db.mjs"), {
  alias: {
    "@": path.join(ROOT, "src"),
    "server-only": path.join(ROOT, "src/scripts/smoke/server-only-stub.mjs"),
    "next/headers": path.join(ROOT, "proofs/next-headers-stub.mjs"),
  },
});
const createRoute = await jiti.import(path.join(ROOT, "src/app/api/agents/[agentId]/execution-intents/route.ts"));
const approveRoute = await jiti.import(path.join(ROOT, "src/app/api/agents/execution-intents/[intentId]/approve/route.ts"));
const { listExecutionCorridors } = await jiti.import("@/server/runtime/execution-corridors");
const { stableStringify } = await jiti.import("@/server/ledger/hash-chain-canonicalizer");
const repoMode = (await jiti.import("@/server/agents/execution-intent-repository")).getAgentExecutionIntentPersistenceMode();
assert.equal(repoMode, "supabase", "the proof must run on the real DB path, not the in-memory fallback");
globalThis.__ownerApiSessionTestResult = null;

// n8n spy: pass everything else (PostgREST) through untouched.
const realFetch = globalThis.fetch;
let dispatches = 0;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith(process.env.N8N_WEBHOOK_URL)) {
    dispatches += 1;
    return new Response(JSON.stringify({ ok: true, status: "ok" }), { status: 200 });
  }
  return realFetch(url, init);
};

const corridor = listExecutionCorridors(process.env).find(
  (c) => c.guard.outcome !== "BLOCK" && c.webhook.configuration === "configured",
);
assert.ok(corridor, "no dispatchable corridor");
const hashOf = (p) => createHash("sha256").update(stableStringify(p)).digest("hex");
const q = (s) => s.replace(/'/g, "''");

async function createIntent(tag) {
  const res = await createRoute.POST(
    new Request(`http://localhost/api/agents/${corridor.agentId}/execution-intents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        skillId: corridor.skillId,
        autonomyLevel: corridor.evaluatedAtAutonomyLevel,
        client: "Acme Corp",
        email: "buyer@acme.test",
        actionType: `real-db.${tag}`,
        missionId: `mission-real-db-${tag}`,
        data: { amount: 100 },
      }),
    }),
    { params: Promise.resolve({ agentId: corridor.agentId }) },
  );
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  return body.intentId;
}
const row = (id) =>
  JSON.parse(sql(`select row_to_json(t) from (select status, payload from public.agent_execution_intents where intent_id='${q(id)}') t`));
async function approve(id, expectedPayloadHash) {
  const res = await approveRoute.POST(
    new Request(`http://localhost/api/agents/execution-intents/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedPayloadHash, approvedBy: "forged", workspaceId: "forged" }),
    }),
    { params: Promise.resolve({ intentId: id }) },
  );
  return { status: res.status, body: await res.json() };
}
const results = [];
const step = async (name, fn) => {
  await fn();
  results.push(name);
  console.log(`PROVEN (real DB): ${name}`);
};

await step("1. concurrent double approve -> one 200, one 409, one dispatch, one ledger attempt", async () => {
  const id = await createIntent("double");
  const h = hashOf(row(id).payload);
  dispatches = 0;
  const [a, b] = await Promise.all([approve(id, h), approve(id, h)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409], JSON.stringify([a.body, b.body]));
  assert.equal(dispatches, 1);
  const attempts = sql(
    `select count(*) from public.action_ledger where event_type='action' and metadata->>'intentId'='${q(id)}'`,
  );
  assert.equal(attempts, "1");
  assert.equal(row(id).status, "executed");
});

await step("2a. payload rewritten in DB before approve, old hash -> 409 changed", async () => {
  const id = await createIntent("rewrite-before");
  const h = hashOf(row(id).payload);
  sql(`update public.agent_execution_intents set payload = jsonb_set(payload,'{data,amount}','999999') where intent_id='${q(id)}'`);
  dispatches = 0;
  const r = await approve(id, h);
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(r.body.reason, "changed");
  assert.equal(dispatches, 0);
  assert.equal(row(id).status, "pending");
});

await step("2b. payload rewritten between read and claim -> jsonb-guarded claim 0 rows -> 409 changed", async () => {
  const id = await createIntent("rewrite-race");
  const h = hashOf(row(id).payload);
  beforeClaim = async () =>
    sql(`update public.agent_execution_intents set payload = jsonb_set(payload,'{data,amount}','1') where intent_id='${q(id)}'`);
  dispatches = 0;
  const r = await approve(id, h);
  assert.equal(beforeClaim, null, "the claim PATCH never reached the gateway hook");
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(r.body.reason, "changed");
  assert.equal(dispatches, 0);
  assert.equal(row(id).status, "pending");
});

await step("3. ledger insert refused by Postgres -> 500, conditional revert to pending, no dispatch", async () => {
  const id = await createIntent("ledger-down");
  const h = hashOf(row(id).payload);
  const ledgerRows = () =>
    sql(`select count(*) from public.action_ledger where metadata->>'intentId'='${q(id)}'`);
  const before = ledgerRows();
  sql("revoke insert on public.action_ledger from qualification_service");
  dispatches = 0;
  try {
    const r = await approve(id, h);
    assert.equal(r.status, 500, JSON.stringify(r.body));
    assert.equal(r.body.reason, "ledger_unavailable");
  } finally {
    sql("grant insert on public.action_ledger to qualification_service");
  }
  assert.equal(dispatches, 0);
  assert.equal(row(id).status, "pending");
  assert.equal(ledgerRows(), before, "the refused approval must leave no ledger row for this intent");
  assert.equal(
    sql(`select count(*) from public.action_ledger where event_type='action' and metadata->>'intentId'='${q(id)}'`),
    "0",
  );
});

gateway.close();
console.log(`ALL ${results.length} REAL-DB PROOFS PASSED`);
process.exit(0);
