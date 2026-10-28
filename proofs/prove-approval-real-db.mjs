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
 *  4. markExecuted with a stale lease token (action_ref of another attempt)
 *     -> the CAS UPDATE matches 0 rows; the row keeps status and token.
 *  6. consume_approval_decision (G1b, migration 0033 — not on this branch yet, so
 *     red until it lands): EXECUTE for service_role only (anon/authenticated
 *     refused); (a) expired decision refused, (b) expires_at == now()
 *     boundary refused, (c) other intent_id / payload_hash / workspace_id refused,
 *     (d) second consumption refused.
 *  7. two concurrent consumptions of one valid decision -> exactly one wins.
 *  8. classify/create/consume_approval_decision (0033-0035): service_role only,
 *     anon/authenticated -> permission denied.
 *  9. two concurrent create_approval_decision on one intent -> one live decision.
 *  Contract from Atelier (0033 l.46-56), kept in CONSUME_CONTRACT.
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

// G1b contract (Atelier, migration 0033 l.46-56, prep/g1-fixes — not yet on
// this branch, so proofs 6-7 are red until it lands). Single place to align.
const CONSUME_CONTRACT = {
  signature: "public.consume_approval_decision(p_workspace_id text, p_decision_id uuid, p_intent_id text, p_payload_hash text) returns setof public.agent_review_approval_events",
  regproc: "public.consume_approval_decision(text,uuid,text,text)",
  table: "public.agent_review_approval_events",
  // 1 row (status 'consumed') on success, 0 rows otherwise.
  count: (ws, id, intent, hash) =>
    `select count(*) from public.consume_approval_decision('${ws}', '${id}'::uuid, '${intent}', '${hash}')`,
  roles: ["anon", "authenticated"], // must NOT have EXECUTE (service_role only)
};

// 0034/0035 (Atelier, not pushed): ASSUMED call shape — align once published.
const DECISION_FNS = ["consume_approval_decision", "classify_approval_decision", "create_approval_decision"];
const CREATE_CONTRACT = {
  call: (ws, intent, hash, user) =>
    `select count(*) from public.create_approval_decision('${ws}', '${intent}', '${hash}', '${user}'::uuid)`,
  live: (intent) =>
    `select count(*) from public.agent_review_approval_events where intent_id='${intent}' and status='approved' and consumed_at is null and revoked_at is null and expires_at > now()`,
};

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
async function approve(id, expectedPayloadHash, decisionId) {
  const res = await approveRoute.POST(
    new Request(`http://localhost/api/agents/execution-intents/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedPayloadHash, decisionId, approvedBy: "forged", workspaceId: "forged" }),
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

const USER = "00000000-0000-4000-8000-0000000000b1";
// Seed the decision owner in auth.users (FK from agent_review_approval_events.user_id).
sql(`insert into auth.users(id) values ('${USER}') on conflict (id) do nothing`);
// G1b: proofs 1-3 approve with a valid human decision, seeded by direct SQL
// (bound to workspace + intent + reviewed payload hash) and consumed for real
// by consume_approval_decision at dispatch.
const decisionFor = (intentId, payloadHash) =>
  insertApprovedDecision(sql, { workspaceId: "michael-hq", intentId, payloadHash, userId: USER, ttlMs: 3_600_000 });
const decisionRow = (decisionId) =>
  sql(`select status || '|' || (consumed_at is not null) from public.agent_review_approval_events where id='${q(decisionId)}'`);

await step("1. concurrent double approve -> one 200, one 409, one dispatch, one ledger attempt", async () => {
  const id = await createIntent("double");
  const h = hashOf(row(id).payload);
  const d = decisionFor(id, h);
  dispatches = 0;
  const [a, b] = await Promise.all([approve(id, h, d), approve(id, h, d)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409], JSON.stringify([a.body, b.body]));
  assert.equal(dispatches, 1);
  const attempts = sql(
    `select count(*) from public.action_ledger where event_type='action' and metadata->>'intentId'='${q(id)}'`,
  );
  assert.equal(attempts, "1");
  assert.equal(row(id).status, "executed");
  assert.equal(decisionRow(d), "consumed|true", "the winning approval consumed the decision exactly once");
});

await step("2a. payload rewritten in DB before approve, old hash -> 409 changed", async () => {
  const id = await createIntent("rewrite-before");
  const h = hashOf(row(id).payload);
  const d = decisionFor(id, h);
  sql(`update public.agent_execution_intents set payload = jsonb_set(payload,'{data,amount}','999999') where intent_id='${q(id)}'`);
  dispatches = 0;
  const r = await approve(id, h, d);
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(r.body.reason, "changed");
  assert.equal(dispatches, 0);
  assert.equal(row(id).status, "pending");
  assert.equal(decisionRow(d), "approved|false", "a refused approval must not consume the decision");
});

await step("2b. payload rewritten between read and claim -> jsonb-guarded claim 0 rows -> 409 changed", async () => {
  const id = await createIntent("rewrite-race");
  const h = hashOf(row(id).payload);
  const d = decisionFor(id, h);
  beforeClaim = async () =>
    sql(`update public.agent_execution_intents set payload = jsonb_set(payload,'{data,amount}','1') where intent_id='${q(id)}'`);
  dispatches = 0;
  const r = await approve(id, h, d);
  assert.equal(beforeClaim, null, "the claim PATCH never reached the gateway hook");
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(r.body.reason, "changed");
  assert.equal(dispatches, 0);
  assert.equal(row(id).status, "pending");
  assert.equal(decisionRow(d), "approved|false", "a refused approval must not consume the decision");
});

await step("3. ledger insert refused by Postgres -> 500, conditional revert to pending, no dispatch", async () => {
  const id = await createIntent("ledger-down");
  const h = hashOf(row(id).payload);
  const d = decisionFor(id, h);
  const ledgerRows = () =>
    sql(`select count(*) from public.action_ledger where metadata->>'intentId'='${q(id)}'`);
  const before = ledgerRows();
  sql("revoke insert on public.action_ledger from qualification_service");
  dispatches = 0;
  try {
    const r = await approve(id, h, d);
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
  assert.equal(decisionRow(d), "approved|false", "a refused approval must not consume the decision");
});

await step("4. markExecuted with a stale lease token -> UPDATE matches 0 rows (CAS on action_ref), row unchanged", async () => {
  const repo = await jiti.import("@/server/agents/execution-intent-repository");
  const id = await createIntent("stale-lease");
  const lease = () => JSON.parse(sql(`select row_to_json(t) from (select workspace_id, status, action_ref from public.agent_execution_intents where intent_id='${q(id)}') t`));
  const ws = lease().workspace_id;
  // Put the row in the claimed state held by ANOTHER attempt, directly in Postgres.
  sql(`update public.agent_execution_intents set status='executing', action_ref='attempt:holder' where intent_id='${q(id)}'`);
  await assert.rejects(
    repo.transitionAgentExecutionIntent(ws, id, {
      toStatus: "executed",
      expectedFromStatus: "executing",
      expectedActionRef: "attempt:stale",
      updatedAt: new Date().toISOString(),
    }),
    repo.AgentExecutionIntentConcurrencyError,
    "a stale lease token must match 0 rows",
  );
  assert.deepEqual([lease().status, lease().action_ref], ["executing", "attempt:holder"]);
  // Control: the holder's own token settles it (same query, right token).
  await repo.transitionAgentExecutionIntent(ws, id, {
    toStatus: "executed", expectedFromStatus: "executing", expectedActionRef: "attempt:holder",
    updatedAt: new Date().toISOString(),
  });
  assert.equal(row(id).status, "executed");
});

// Local proof helper (not production code): seeds one approved, unrevoked,
// unexpired decision bound to (workspace, intent, payload hash). pg = psql runner
// on CI_PG_URL (PSQL_CMD). Returns the decision id.
function insertApprovedDecision(pg, { workspaceId, intentId, payloadHash, userId, ttlMs }) {
  const expires = `now() + (${Number(ttlMs)} * interval '1 millisecond')`;
  return pg(`insert into ${CONSUME_CONTRACT.table}
    (user_id, source_packet_id, source_queue_item_id, agent_id, outcome_id, reviewer_id, reviewer_role,
     decision, decision_rationale, human_approved, status, expires_at, revoked_at,
     workspace_id, intent_id, payload_hash)
    values ('${userId}', 'pkt-g1b', 'q-g1b', 'agent-g1b', 'out-g1b', 'human-g1b', 'owner',
     'approved', 'real-db proof', true, 'approved', ${expires}, null,
     '${workspaceId}', '${intentId}', '${payloadHash}') returning id`);
}
// 0033 requires payload_hash = 64-char lowercase hex.
const hex64 = (tag) => createHash("sha256").update(String(tag)).digest("hex");
let seq = 0;
const seedDecision = (over = {}) => {
  const d = { workspaceId: "ws-g1b", intentId: `intent-g1b-${++seq}`, payloadHash: hex64(`g1b-${seq}`), userId: USER, ttlMs: 3_600_000, ...over };
  return { ...d, id: insertApprovedDecision(sql, d) };
};
const consume = (d, over = {}) => {
  const a = { ...d, ...over };
  return Number(sql(CONSUME_CONTRACT.count(a.workspaceId, a.id, a.intentId, a.payloadHash)));
};

await step("6. consume_approval_decision: service_role only; refuses expired / boundary / mismatched / replayed", async () => {
  assert.equal(sql(`select to_regprocedure('${CONSUME_CONTRACT.regproc}') is not null`), "t",
    `${CONSUME_CONTRACT.signature} missing (migration 0033 not applied)`);
  for (const role of CONSUME_CONTRACT.roles) {
    assert.equal(sql(`select has_function_privilege('${role}', '${CONSUME_CONTRACT.regproc}', 'EXECUTE')`), "f", `${role} can EXECUTE`);
  }
  assert.equal(sql(`select has_function_privilege('service_role', '${CONSUME_CONTRACT.regproc}', 'EXECUTE')`), "t");
  // (a) expired
  assert.equal(consume(seedDecision({ ttlMs: -1000 })), 0, "(a) expired decision consumed");
  // (b) boundary: expires_at == now() of the consuming statement -> refused (expires_at > now()).
  const bnd = seedDecision();
  assert.equal(Number(sql(`begin; update ${CONSUME_CONTRACT.table} set expires_at = now() where id='${bnd.id}';
    ${CONSUME_CONTRACT.count(bnd.workspaceId, bnd.id, bnd.intentId, bnd.payloadHash)}; commit;`).split(/\s+/).filter(Boolean).pop()), 0,
    "(b) expires_at boundary consumed");
  // (c) bindings
  const c = seedDecision();
  assert.equal(consume(c, { intentId: "intent-other" }), 0, "(c) other intent_id consumed");
  assert.equal(consume(c, { payloadHash: hex64("other") }), 0, "(c) other payload_hash consumed");
  assert.equal(consume(c, { workspaceId: "ws-other" }), 0, "(c) other workspace_id consumed");
  // control, then (d) replay
  assert.equal(consume(c), 1, "control: valid decision must be consumed exactly once");
  assert.equal(sql(`select status from ${CONSUME_CONTRACT.table} where id='${c.id}'`), "consumed");
  assert.equal(consume(c), 0, "(d) second consumption succeeded");
});

await step("7. two concurrent consume_approval_decision calls -> exactly one wins", async () => {
  const d = seedDecision();
  const [cmd, ...args] = PSQL.split(" ");
  const { spawn } = await import("node:child_process");
  const run = () => new Promise((resolve, reject) => {
    const p = spawn(cmd, [...args, "-A", "-t", "-c", CONSUME_CONTRACT.count(d.workspaceId, d.id, d.intentId, d.payloadHash)]);
    let out = "", err = "";
    p.stdout.on("data", (b) => (out += b)); p.stderr.on("data", (b) => (err += b));
    p.on("close", (code) => (code === 0 ? resolve(Number(out.trim())) : reject(new Error(err))));
  });
  const wins = (await Promise.all([run(), run()])).reduce((x, y) => x + y, 0);
  assert.equal(wins, 1, `expected exactly one winner, got ${wins}`);
});

await step("8. classify/create/consume_approval_decision: EXECUTE for service_role only (anon/authenticated denied)", async () => {
  for (const fn of DECISION_FNS) {
    const procs = sql(`select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='${fn}'`)
      .split("\n").filter(Boolean);
    assert.ok(procs.length > 0, `public.${fn} missing (0033/0034/0035 not applied)`);
    for (const proc of procs) {
      for (const role of ["anon", "authenticated"]) {
        assert.equal(sql(`select has_function_privilege('${role}', '${proc}', 'EXECUTE')`), "f", `${role} can EXECUTE ${proc}`);
      }
      assert.equal(sql(`select has_function_privilege('service_role', '${proc}', 'EXECUTE')`), "t", `service_role cannot EXECUTE ${proc}`);
      // Actually calling it as anon must raise permission denied (not just a catalog flag).
      const [cmd, ...args] = PSQL.split(" ");
      const r = spawnSync(cmd, [...args, "-A", "-t", "-c", `set role anon; select ${proc.replace(/\(.*$/, "")}(${"null,".repeat((proc.match(/,/g) || []).length)}null)`], { encoding: "utf8" });
      assert.match(r.stderr, /permission denied/i, `anon call of ${proc} not denied`);
    }
  }
});

await step("9. two concurrent create_approval_decision for one intent -> exactly one live decision", async () => {
  const intent = `intent-g1b-create-${Date.now()}`;
  const [cmd, ...args] = PSQL.split(" ");
  const { spawn } = await import("node:child_process");
  const run = () => new Promise((resolve) => {
    const p = spawn(cmd, [...args, "-A", "-t", "-c", CREATE_CONTRACT.call("ws-g1b", intent, hex64("create"), USER)]);
    p.on("close", resolve);
  });
  await Promise.all([run(), run()]);
  assert.equal(sql(CREATE_CONTRACT.live(intent)), "1", "expected exactly one live decision");
});

gateway.close();
console.log(`ALL ${results.length} REAL-DB PROOFS PASSED`);
process.exit(0);
