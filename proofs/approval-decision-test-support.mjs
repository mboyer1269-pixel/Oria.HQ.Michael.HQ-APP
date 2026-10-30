// Test support (not a test file, not production code) — G1b approvals for unit
// tests. Production consumes decisions from Postgres (consume_approval_decision);
// unit tests have no Postgres, so they inject an in-memory decision store
// through the PUBLIC seams: createApproveHandler(deps) and
// dispatchGovernedTool(input, execute, { consumeDecision }). Same contract as
// 0033: a decision is bound to (workspace, intent, payload hash), single-use,
// and anything else yields null (fail closed). SIMULATED (no database).
import { randomUUID } from "node:crypto";
import path from "node:path";

export function createDecisionStore() {
  const rows = new Map(); // id -> { workspaceId, intentId, payloadHash, consumedAt }
  const calls = [];
  return {
    calls,
    issue(workspaceId, intentId, payloadHash) {
      const id = randomUUID();
      rows.set(id, { workspaceId, intentId, payloadHash, consumedAt: null });
      return id;
    },
    /** Same signature and semantics as approval-decision-repository.consumeApprovalDecision. */
    async consume(workspaceId, decisionId, intentId, payloadHash) {
      calls.push({ workspaceId, decisionId, intentId, payloadHash });
      const r = rows.get(decisionId);
      if (!r || r.consumedAt || r.workspaceId !== workspaceId || r.intentId !== intentId || r.payloadHash !== payloadHash) return null;
      r.consumedAt = new Date().toISOString();
      return { workspaceId, decisionId, intentId, payloadHash, consumedAt: r.consumedAt };
    },
    isConsumed: (id) => !!rows.get(id)?.consumedAt,
  };
}

/**
 * Builds the approve handler exactly like route.ts (same real deps), except:
 *  - dispatchGovernedTool receives { consumeDecision: store.consume };
 *  - transitionAgentExecutionIntent forwards an optional beforeLocalTransition
 *    hook through the repository's public 4th-argument seam.
 */
export async function buildApproveHandler(jiti, projectRoot, { store, getBeforeLocalTransition = () => null, webhookEnv } = {}) {
  const { createApproveHandler } = await jiti.import("@/server/agents/execution-intent-approve-handler");
  const owner = await jiti.import("@/server/auth/owner");
  const { getActiveWorkspaceContext } = await jiti.import("@/core/workspace-context");
  const { evaluateLiveExecution } = await jiti.import("@/server/runtime/execution-guard");
  const { recordLedgerEvent } = await jiti.import(path.join(projectRoot, "src/server/actions/ledger-events.ts"));
  const { mcpToolRegistry } = await jiti.import("@/server/agents/tools");
  const repo = await jiti.import("@/server/agents/execution-intent-repository");
  const { approveAndDispatchExecutionIntent } = await jiti.import("@/server/agents/execution-intent-approval-service");
  const { billApprovedIntentUsage } = await jiti.import("@/server/michael-hq/billing-on-approve");
  const gtd = await jiti.import("@/server/runtime/governed-tool-dispatch");
  return createApproveHandler({
    requireOwnerApiSession: owner.requireOwnerApiSession,
    getAuthenticatedActorId: () => owner.getAuthenticatedActorId(),
    getActiveWorkspaceContext,
    evaluateLiveExecution: (...a) => evaluateLiveExecution(...a),
    recordLedgerEvent,
    toolRegistry: mcpToolRegistry,
    getAgentExecutionIntent: repo.getAgentExecutionIntent,
    transitionAgentExecutionIntent: (ws, id, patch) => {
      const hook = getBeforeLocalTransition();
      return hook
        ? repo.transitionAgentExecutionIntent(ws, id, patch, { beforeLocalTransition: hook })
        : repo.transitionAgentExecutionIntent(ws, id, patch);
    },
    approveAndDispatchExecutionIntent,
    billApprovedIntentUsage,
    dispatchGovernedTool: (input, execute, deps) =>
      gtd.dispatchGovernedTool(input, execute, { ...(deps ?? {}), ...(store ? { consumeDecision: store.consume } : {}) }),
    precheckGovernedTool: gtd.precheckGovernedTool,
    randomUUID: () => randomUUID(),
    webhookEnv: webhookEnv ? Object.freeze({ ...webhookEnv }) : Object.freeze({
      N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL,
      N8N_SECRET: process.env.N8N_SECRET,
      AGENT_WEBHOOK_SIGNING_SECRET: process.env.AGENT_WEBHOOK_SIGNING_SECRET,
    }),
  });
}
