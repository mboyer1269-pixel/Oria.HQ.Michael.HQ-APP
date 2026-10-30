import { getAuthenticatedActorId, requireOwnerApiSession } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { evaluateLiveExecution } from "@/server/runtime/execution-guard";
import { recordLedgerEvent } from "@/server/actions/ledger-events";
import { mcpToolRegistry } from "@/server/agents/tools";
import {
  getAgentExecutionIntent,
  transitionAgentExecutionIntent,
} from "@/server/agents/execution-intent-repository";
import { approveAndDispatchExecutionIntent } from "@/server/agents/execution-intent-approval-service";
import { billApprovedIntentUsage } from "@/server/michael-hq/billing-on-approve";
import { precheckGovernedTool } from "@/server/runtime/governed-tool-dispatch";
import {
  createAtomicApproveHandler,
  type ApproveHandlerDeps,
} from "@/server/agents/execution-intent-approve-handler";
import { createExecutionIntentAdmissionStore } from "@/server/agents/execution-intent-admission-store";

/**
 * POST /api/agents/execution-intents/:intentId/approve — see
 * createApproveHandler for the sequence. The real dependencies are bound here,
 * once, at module load; nothing about them comes from the request or env.
 */
const defaultDeps: ApproveHandlerDeps & { admission: ReturnType<typeof createExecutionIntentAdmissionStore> } = {
  // Deployment dependency: reviewed SQL admission draft must be qualified and
  // applied separately. Missing RPC/sealing closes this existing route (503),
  // never falling back to claim-before-consume. Factory construction performs no DB I/O.
  admission: createExecutionIntentAdmissionStore(),
  requireOwnerApiSession,
  // Attribution always from the authenticated session.
  getAuthenticatedActorId: () => getAuthenticatedActorId(),
  getActiveWorkspaceContext,
  // Sentinelle re-check: the route binds the live guard call.
  evaluateLiveExecution: (...args: Parameters<typeof evaluateLiveExecution>) => evaluateLiveExecution(...args),
  recordLedgerEvent,
  toolRegistry: mcpToolRegistry,
  getAgentExecutionIntent,
  transitionAgentExecutionIntent,
  approveAndDispatchExecutionIntent,
  billApprovedIntentUsage,
  // Old DI service remains regression-tested, but is not a route fallback.
  dispatchGovernedTool: async () => { throw new Error("Legacy consume-at-dispatch is unavailable in the atomic route"); },
  precheckGovernedTool,
  randomUUID: () => crypto.randomUUID(),
  // Read ONCE at module load; a later env change cannot redirect the dispatch.
  webhookEnv: Object.freeze({
    N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL,
    N8N_SECRET: process.env.N8N_SECRET,
    AGENT_WEBHOOK_SIGNING_SECRET: process.env.AGENT_WEBHOOK_SIGNING_SECRET,
  }),
};

export const POST = createAtomicApproveHandler(defaultDeps);
