#!/usr/bin/env node
/**
 * smoke:n8n-slice — Governed vertical slice: Oria -> n8n -> traceable result.
 *
 * Proves, against a REAL running n8n (dry-run workflow), that Oria can:
 *   1. prepare a pending execution intent (no network),
 *   2. list it (no curl),
 *   3. approve it -> REAL call to n8n -> intent updated to executed (traceable),
 *   4. dedup: re-sending the same actionRef returns deduped:true (no re-exec),
 *   5. classify a transient error distinctly (test hook).
 *
 * SAFE: the n8n workflow is dry-run (no email, no external mutation). This
 * script forces the in-memory intent repository (no Supabase write) and does NOT
 * apply any migration. The only real network call is to YOUR n8n webhook.
 *
 * It SKIPS (exit 0) unless these env vars are set:
 *   N8N_WEBHOOK_URL              e.g. http://localhost:5678/webhook/oria-execute
 *                               (hostname must be in the binding allowlist:
 *                                hooks.n8n.cloud, n8n.michaelhq.com, localhost, 127.0.0.1)
 *   N8N_SECRET                   == n8n env ORIA_N8N_WEBHOOK_SECRET
 *   AGENT_WEBHOOK_SIGNING_SECRET == n8n env ORIA_WEBHOOK_SIGNING_SECRET
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

// Force the in-memory repository (no Supabase write, no migration needed).
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const N8N_SECRET = process.env.N8N_SECRET;
const SIGNING_SECRET = process.env.AGENT_WEBHOOK_SIGNING_SECRET;

if (!N8N_WEBHOOK_URL || !N8N_SECRET || !SIGNING_SECRET) {
  console.log("[smoke:n8n-slice] SKIPPED — required env not set.");
  console.log("");
  console.log("  To run the slice against your n8n instance:");
  console.log("    1. Import docs/n8n/oria-execution-rail.workflow.json into n8n and activate it.");
  console.log("    2. In n8n set env: ORIA_N8N_WEBHOOK_SECRET, ORIA_WEBHOOK_SIGNING_SECRET,");
  console.log("       and NODE_FUNCTION_ALLOW_BUILTIN=crypto. Restart n8n.");
  console.log("    3. Then run, e.g.:");
  console.log("       N8N_WEBHOOK_URL=http://localhost:5678/webhook/oria-execute \\");
  console.log("       N8N_SECRET=<same as ORIA_N8N_WEBHOOK_SECRET> \\");
  console.log("       AGENT_WEBHOOK_SIGNING_SECRET=<same as ORIA_WEBHOOK_SIGNING_SECRET> \\");
  console.log("       npm run smoke:n8n-slice");
  process.exit(0);
}

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const { buildAgentExecutionIntent } = await jiti.import(
  path.join(projectRoot, "src/features/agents/execution-intent.ts"),
);
const {
  createAgentExecutionIntent,
  getAgentExecutionIntent,
  listPendingAgentExecutionIntents,
  transitionAgentExecutionIntent,
} = await jiti.import(path.join(projectRoot, "src/server/agents/execution-intent-repository.ts"));
const { n8nWebhookTriggerTool } = await jiti.import(
  path.join(projectRoot, "src/server/agents/tools/n8n-webhook-trigger.ts"),
);
const { approveAndDispatchExecutionIntent } = await jiti.import(
  path.join(projectRoot, "src/server/agents/execution-intent-approval-service.ts"),
);

const WORKSPACE = "michael-hq";
const USER = "local-michael";

function allowDecision() {
  // The real /approve route uses evaluateLiveExecution(); this slice injects an
  // ALLOW so the focus stays on the n8n round-trip + governance flow.
  return {
    outcome: "ALLOW",
    zone: "green",
    executionTier: "green",
    agentId: "hermes",
    actionId: "task.create",
    reasonCode: "allowed_by_policy",
    reason: "slice",
    requiresLedger: true,
    requiresSentinel: true,
    requiresHumanApproval: false,
  };
}

// Replicate Oria's signing for the raw dedup/transient probes (Part B/C).
async function postSigned(bodyObject) {
  const bodyString = JSON.stringify(bodyObject);
  const ts = String(Date.now());
  const sig = crypto.createHmac("sha256", SIGNING_SECRET).update(`${ts}.${bodyString}`).digest("hex");
  const res = await fetch(N8N_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": N8N_SECRET,
      "x-orya-action-ref": bodyObject.actionRef,
      "x-orya-timestamp": ts,
      "x-orya-signature": sig,
    },
    body: bodyString,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

console.log("[smoke:n8n-slice] target:", N8N_WEBHOOK_URL);

// ── Part A: prepare -> list -> approve (real n8n call) ───────────────────────
const intentId = `intent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const intent = buildAgentExecutionIntent({
  intentId,
  workspaceId: WORKSPACE,
  agentId: "hermes",
  skillId: "task.create",
  toolName: "n8n_webhook_trigger",
  autonomyLevel: 2,
  payload: {
    agentId: "hermes",
    skillId: "task.create",
    client: "Acme Corp",
    email: "buyer@acme.test",
    actionType: "task.create",
    missionId: "mission-slice-001",
    data: { title: "Follow up with Acme", note: "dry-run slice" },
  },
  createdAt: new Date().toISOString(),
});

await createAgentExecutionIntent(WORKSPACE, USER, intent);
const pending = await listPendingAgentExecutionIntents(WORKSPACE);
assert.ok(
  pending.some((i) => i.intentId === intentId && i.status === "pending"),
  "intent must be listed as pending",
);
console.log(`[A] prepared + listed pending intent: ${intentId}`);

const ledger = [];
const stored = await getAgentExecutionIntent(WORKSPACE, intentId);
const result = await approveAndDispatchExecutionIntent({
  evaluate: allowDecision,
  markExecuting: () =>
    transitionAgentExecutionIntent(WORKSPACE, intentId, { toStatus: "executing", updatedAt: new Date().toISOString() }),
  recordAttempt: async () => void ledger.push("attempt"),
  dispatch: () => n8nWebhookTriggerTool.handler(stored.payload, { workspaceId: WORKSPACE, agentId: "hermes" }),
  recordResult: async (_ok, phase) => void ledger.push(`result:${phase}`),
  markExecuted: (ref) =>
    transitionAgentExecutionIntent(WORKSPACE, intentId, {
      toStatus: "executed",
      updatedAt: new Date().toISOString(),
      ...(ref ? { actionRef: ref } : {}),
    }),
  markFailed: (code) =>
    transitionAgentExecutionIntent(WORKSPACE, intentId, { toStatus: "failed", updatedAt: new Date().toISOString(), failureCode: code }),
  revertToPending: () =>
    transitionAgentExecutionIntent(WORKSPACE, intentId, { toStatus: "pending", updatedAt: new Date().toISOString() }),
});

assert.equal(result.ok, true, `approve must succeed (got: ${result.error ?? "ok"})`);
assert.deepEqual(ledger, ["attempt", "result:success"], "ledger: attempt BEFORE result");

const afterA = await getAgentExecutionIntent(WORKSPACE, intentId);
assert.equal(afterA.status, "executed", "intent must be executed");
assert.ok(afterA.actionRef, "intent must carry the dispatch actionRef");
assert.equal(result.output?.ok, true, "n8n must return ok:true");
assert.equal(result.output?.deduped, false, "first dispatch is not a dedup");
console.log(`[A] approved -> n8n -> executed. actionRef=${afterA.actionRef}`);
console.log(`[A] n8n response:`, JSON.stringify(result.output));

const firstActionRef = afterA.actionRef;

// ── Part B: dedup — re-send the SAME actionRef ──────────────────────────────
const dedupBody = {
  actionRef: firstActionRef,
  agentId: "hermes",
  skillId: "task.create",
  workspaceId: WORKSPACE,
  client: "Acme Corp",
  email: "buyer@acme.test",
  actionType: "task.create",
  missionId: "mission-slice-001",
  data: { title: "Follow up with Acme", note: "dry-run slice" },
  dispatchedAt: new Date().toISOString(),
};
const dedup = await postSigned(dedupBody);
assert.equal(dedup.status, 200, "dedup re-send returns 200");
assert.equal(dedup.json.deduped, true, "second send with same actionRef must be deduped");
assert.equal(dedup.json.status, "deduped");
console.log(`[B] dedup OK — same actionRef returned deduped:true (not re-executed)`);

// ── Part C: transient error classification (test hook) ──────────────────────
const transientBody = {
  actionRef: `n8n_transient_${Date.now()}`,
  agentId: "hermes",
  skillId: "task.create",
  workspaceId: WORKSPACE,
  client: "Acme Corp",
  email: "buyer@acme.test",
  actionType: "task.create",
  missionId: "mission-slice-001",
  data: { simulate: "transient" },
  dispatchedAt: new Date().toISOString(),
};
const transient = await postSigned(transientBody);
assert.equal(transient.status, 503, "transient simulation returns 503");
assert.equal(transient.json.status, "transient_error");
console.log(`[C] transient classification OK — status=transient_error, http=503`);

// ── Summary ─────────────────────────────────────────────────────────────────
console.log("");
console.log("[smoke:n8n-slice] checks:");
console.log("  [ok] prepare + list pending (no curl, no network)");
console.log("  [ok] approve -> REAL n8n call -> intent executed (traceable actionRef)");
console.log("  [ok] ledger recorded attempt BEFORE result");
console.log("  [ok] dedup by actionRef (no double execution)");
console.log("  [ok] transient error classified distinctly (503 / transient_error)");
console.log("[smoke:n8n-slice] PASS");
