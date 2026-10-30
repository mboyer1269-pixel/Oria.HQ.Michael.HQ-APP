// Shared harness for the approve-route behaviour tests (not a test file).
// Local-fallback repo + local ledger, real route handlers, fetch replaced.
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.MICHAEL_HQ_OWNER_ID;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
process.env.NODE_ENV = "test";
export const SECRETS = ["test-static-secret-behaviour", "test-signing-secret-behaviour"];
process.env.N8N_WEBHOOK_URL = "http://127.0.0.1:5678/webhook/approval-behaviour";
process.env.N8N_SECRET = SECRETS[0];
process.env.AGENT_WEBHOOK_SIGNING_SECRET = SECRETS[1];

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const createRoute = await jiti.import(path.join(projectRoot, "src/app/api/agents/[agentId]/execution-intents/route.ts"));
// The production route (route.ts) binds defaultDeps privately. The harness
// builds the SAME handler through the public factory createApproveHandler with
// the same real deps (approval-decision-test-support.mjs), plus:
//  - an in-memory G1b decision store injected as dispatchGovernedTool's
//    consumeDecision (every approve carries a valid, single-use decision);
//  - the tamper hook via transitionAgentExecutionIntent(..., { beforeLocalTransition })
//    instead of the deprecated __setBeforeLocalTransitionHookForTests.
const support = await import(path.join(projectRoot, "proofs/approval-decision-test-support.mjs"));
export const decisions = support.createDecisionStore();
let beforeLocalTransition = null;
let ledgerRecordOverride = null;
const { recordLedgerEvent } = await jiti.import(path.join(projectRoot, "src/server/actions/ledger-events.ts"));
const approveRoute = {
  POST: await support.buildApproveHandler(jiti, projectRoot, {
    store: decisions, getBeforeLocalTransition: () => beforeLocalTransition,
    recordLedgerEvent: (ctx, event, options) => ledgerRecordOverride
      ? ledgerRecordOverride(event)
      : recordLedgerEvent(ctx, event, options),
  }),
};
const { listExecutionCorridors } = await jiti.import("@/server/runtime/execution-corridors");
export const repo = await jiti.import("@/server/agents/execution-intent-repository");
export const { hashExecutionIntentPayload } = await jiti.import("@/server/agents/execution-intent-payload-hash");
export const rateLimit = await jiti.import("@/lib/rate-limit");
// Path form: ledger-events reaches its repository through a relative specifier.
const { listLocalActionLedgerEntries } = await jiti.import(
  path.join(projectRoot, "src/server/actions/action-ledger-repository.ts"),
);
export const service = await jiti.import("@/server/agents/execution-intent-approval-service");

globalThis.__ownerApiSessionTestResult = null;
export const WS = "michael-hq";

export const corridor = listExecutionCorridors(process.env).find(
  (c) => c.guard.outcome !== "BLOCK" && c.webhook.configuration === "configured",
);
if (!corridor) throw new Error("no dispatchable corridor for the harness");

let seq = 0;
export async function createIntent(tag) {
  seq += 1;
  const res = await createRoute.POST(
    new Request(`http://localhost/api/agents/${corridor.agentId}/execution-intents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        skillId: corridor.skillId,
        autonomyLevel: corridor.evaluatedAtAutonomyLevel,
        client: "Acme Corp",
        email: "buyer@acme.test",
        actionType: `behaviour.${tag}`,
        missionId: `mission-behaviour-${tag}-${seq}`,
        data: { amount: 100 },
      }),
    }),
    { params: Promise.resolve({ agentId: corridor.agentId }) },
  );
  const body = await res.json();
  if (res.status !== 201) throw new Error(`create failed ${res.status} ${JSON.stringify(body)}`);
  return body.intentId;
}

const decisionIds = new Map();
/** The intent's single live decision (issued once, reused by concurrent approvals). */
export function decisionFor(intentId, payloadHash) {
  if (!decisionIds.has(intentId)) decisionIds.set(intentId, decisions.issue(WS, intentId, payloadHash));
  return decisionIds.get(intentId);
}
export const getIntent = (id) => repo.getAgentExecutionIntent(WS, id);

export async function approve(id, hash) {
  const stored = await getIntent(id);
  const expectedPayloadHash = hash ?? hashExecutionIntentPayload(stored.payload);
  // One live decision per intent, bound to the stored payload (0033 semantics).
  const decisionId = decisionFor(id, hashExecutionIntentPayload(stored.payload));
  const res = await approveRoute.POST(
    new Request(`http://localhost/api/agents/execution-intents/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedPayloadHash, decisionId }),
    }),
    { params: Promise.resolve({ intentId: id }) },
  );
  return { status: res.status, body: await res.json() };
}

/** fetch spy for the n8n URL only. `respond` may throw (lost response). */
export function installN8n(respond) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith(process.env.N8N_WEBHOOK_URL)) {
      calls.push({ url: String(url), init });
      return respond ? respond(calls.length) : { ok: true, status: 200, json: async () => ({ ok: true, status: "ok" }) };
    }
    return original(url, init);
  };
  return { calls, restore: () => void (globalThis.fetch = original) };
}

/** Rewrite the stored payload right AFTER the pending->executing claim lands. */
export function tamperAfterClaim(id) {
  beforeLocalTransition = (ws, intentId, patch) => {
    if (intentId !== id || patch.toStatus !== "executing") return;
    queueMicrotask(() =>
      repo.__mutateAgentExecutionIntentPayloadForTests(ws, intentId, (p) => ({ ...p, client: "Tampered Inc" })),
    );
  };
}
export const clearHook = () => { beforeLocalTransition = null; };

export const ledgerFor = (id) =>
  listLocalActionLedgerEntries().filter((e) => e.metadata?.intentId === id);
export const { logger } = await jiti.import("@/lib/logger");

/**
 * Inject a failed write only into this harness's approve handler. Other handlers
 * and the production repository defaults are untouched. Existing call sites
 * supply a throwing callback; `null` restores the real event writer here.
 */
export function injectLedgerRepository(record) {
  ledgerRecordOverride = record;
}
