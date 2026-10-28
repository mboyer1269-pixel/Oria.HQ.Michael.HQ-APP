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
const approveRoute = await jiti.import(path.join(projectRoot, "src/app/api/agents/execution-intents/[intentId]/approve/route.ts"));
const { listExecutionCorridors } = await jiti.import("@/server/runtime/execution-corridors");
export const repo = await jiti.import("@/server/agents/execution-intent-repository");
export const { hashExecutionIntentPayload } = await jiti.import("@/server/agents/execution-intent-payload-hash");
export const rateLimit = await jiti.import("@/lib/rate-limit");
// Path form: ledger-events reaches its repository through a relative specifier.
const { listLocalActionLedgerEntries, __setActionLedgerRepositoryForTests } = await jiti.import(
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

export const getIntent = (id) => repo.getAgentExecutionIntent(WS, id);

export async function approve(id, hash) {
  const stored = await getIntent(id);
  const expectedPayloadHash = hash ?? hashExecutionIntentPayload(stored.payload);
  const res = await approveRoute.POST(
    new Request(`http://localhost/api/agents/execution-intents/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedPayloadHash }),
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
  repo.__setBeforeLocalTransitionHookForTests((ws, intentId, patch) => {
    if (intentId !== id || patch.toStatus !== "executing") return;
    queueMicrotask(() =>
      repo.__mutateAgentExecutionIntentPayloadForTests(ws, intentId, (p) => ({ ...p, client: "Tampered Inc" })),
    );
  });
}
export const clearHook = () => repo.__setBeforeLocalTransitionHookForTests(null);

export const ledgerFor = (id) =>
  listLocalActionLedgerEntries().filter((e) => e.metadata?.intentId === id);
export const { logger } = await jiti.import("@/lib/logger");

/**
 * Explicitly inject a ledger repository whose record() calls `record(input)`.
 * Throwing from `record` simulates a ledger outage. `null` restores the default.
 */
export function injectLedgerRepository(record) {
  __setActionLedgerRepositoryForTests(record ? () => ({ mode: "local", record: async (input) => record(input) }) : null);
}
