import { NextResponse } from "next/server";
import type { getAuthenticatedActorId, requireOwnerApiSession } from "@/server/auth/owner";
import type { getActiveWorkspaceContext } from "@/core/workspace-context";
import type { evaluateLiveExecution } from "@/server/runtime/execution-guard";
import type { recordLedgerEvent } from "@/server/actions/ledger-events";
import type { mcpToolRegistry } from "@/server/agents/tools";
import {
  AgentExecutionIntentConcurrencyError,
  type getAgentExecutionIntent,
  type transitionAgentExecutionIntent,
} from "@/server/agents/execution-intent-repository";
import type { approveAndDispatchExecutionIntent } from "@/server/agents/execution-intent-approval-service";
import type { billApprovedIntentUsage } from "@/server/michael-hq/billing-on-approve";
import { logger } from "@/lib/logger";
import {
  buildIdempotencyKey,
  type dispatchGovernedTool,
  type precheckGovernedTool,
} from "@/server/runtime/governed-tool-dispatch";
import { hashExecutionIntentPayload } from "@/server/agents/execution-intent-payload-hash";
import { buildAdmissionInput, type AdmissionPort, type AdmissionReceipt } from "./execution-intent-admission-contract";
import { dispatchAdmittedTool } from "@/server/runtime/admitted-tool-dispatch";

/**
 * Everything the approve handler touches outside itself. Supplied ONCE, by the
 * caller of createApproveHandler (route.ts passes the real implementations);
 * never read from the request, headers, body or environment, and never
 * mutated after construction: no setters, no module state.
 */
export type ApproveHandlerDeps = {
  /** Required by the production factory below; omitted only by legacy DI regression fixtures. */
  atomicOnly?: true;
  admission?: AdmissionPort;
  requireOwnerApiSession: typeof requireOwnerApiSession;
  getAuthenticatedActorId: typeof getAuthenticatedActorId;
  getActiveWorkspaceContext: typeof getActiveWorkspaceContext;
  evaluateLiveExecution: typeof evaluateLiveExecution;
  recordLedgerEvent: typeof recordLedgerEvent;
  toolRegistry: Pick<typeof mcpToolRegistry, "get">;
  getAgentExecutionIntent: typeof getAgentExecutionIntent;
  transitionAgentExecutionIntent: typeof transitionAgentExecutionIntent;
  approveAndDispatchExecutionIntent: typeof approveAndDispatchExecutionIntent;
  billApprovedIntentUsage: typeof billApprovedIntentUsage;
  dispatchGovernedTool: typeof dispatchGovernedTool;
  precheckGovernedTool: typeof precheckGovernedTool;
  randomUUID: () => string;
  /**
   * Outbound webhook configuration (N8N_WEBHOOK_URL, N8N_SECRET,
   * AGENT_WEBHOOK_SIGNING_SECRET) captured ONCE by the caller at construction.
   * Never re-read from process.env per request.
   */
  webhookEnv: Readonly<Record<string, string | undefined>>;
};

type ApprovalConflictReason = "changed" | "already_decided";

function conflict(intentId: string, reason: ApprovalConflictReason, status?: string) {
  const error =
    reason === "changed"
      ? "Execution intent payload changed since it was reviewed."
      : "Execution intent is not pending.";
  return NextResponse.json(
    { error, reason, intentId, ...(status ? { status } : {}) },
    { status: 409 },
  );
}

/** Existing POST now uses this atomic-only factory. Missing port/RPC never selects the legacy rail. */
export function createAtomicApproveHandler(deps: ApproveHandlerDeps & { admission: AdmissionPort }) {
  return createApproveHandler({ ...deps, atomicOnly: true });
}

/**
 * POST /api/agents/execution-intents/:intentId/approve
 *
 * The CEO manual approval -- the SINGLE trigger that fires the n8n webhook.
 * This is the only route that invokes the n8n_webhook_trigger MCP tool.
 *
 * The production factory is atomic-only: session -> policy -> atomic admission
 * -> current receipt + policy recheck -> MCP tool -> result/status. Old DI
 * orchestration remains testable, but the public route cannot select it.
 */
export function createApproveHandler(deps: ApproveHandlerDeps) {
  // Snapshot + freeze: later mutation of the caller's object changes nothing.
  const d: Readonly<ApproveHandlerDeps> = Object.freeze({ ...deps });
  {
    const deps = d;
    // Every response (success or refusal) carries the request id in the
    // x-request-id header; refusal bodies never contain it.
    const POST = async function POST(
      request: Request,
      routeCtx: { params: Promise<{ intentId: string }> },
    ): Promise<Response> {
      // Correlates the attempt/result ledger rows and logs of this one request.
      // Never derived from secrets; client value is length-capped and charset-limited.
      const clientRequestId = request.headers.get("x-request-id") ?? "";
      const requestId = /^[A-Za-z0-9._:-]{1,128}$/.test(clientRequestId) ? clientRequestId : deps.randomUUID();
      const res = await handle(request, routeCtx, requestId);
      if (!res.headers.has("x-request-id")) res.headers.set("x-request-id", requestId);
      return res;
    };
    async function handle(
      request: Request,
      { params }: { params: Promise<{ intentId: string }> },
      requestId: string,
    ): Promise<Response> {
      const authResponse = await deps.requireOwnerApiSession().catch(error => {
        if (!deps.atomicOnly) throw error;
        return NextResponse.json({ error: "Owner session verification unavailable." }, { status: 503 });
      });
      if (authResponse) return authResponse;
      const authenticatedActor = deps.atomicOnly ? await deps.getAuthenticatedActorId().catch(() => null) : null;
      if (deps.atomicOnly && (typeof authenticatedActor !== "string"
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authenticatedActor))) {
        return NextResponse.json({ error: "An authenticated owner identity is required." }, { status: 401 });
      }

      const { intentId } = await params;
      // G2: the body carries ONLY the hash of the payload the CEO reviewed. Any
      // other field (approvedBy, actorId, workspaceId, ...) is ignored: actor and
      // workspace come from the session/server context below.
      const body = (await request.json().catch(() => null)) as
        | { expectedPayloadHash?: unknown; decisionId?: unknown; approvalDecisionId?: unknown }
        | null;
      const expectedPayloadHash = body?.expectedPayloadHash;
      // G1b: only the id of the human approval decision travels in the body. The
      // decision is read and consumed from Postgres at dispatch.
      // Body field `decisionId` (PR #459 test contract); `approvalDecisionId`
      // accepted as an alias for the review UI.
      const rawDecisionId = body?.decisionId ?? body?.approvalDecisionId;
      // G1b (room contract): both refusals happen BEFORE any read of the intent,
      // the claim, or the ledger. Absent/null/"" -> REQUIRE_APPROVAL, the intent
      // stays waiting for approval. Present but not a UUID string -> 400.
      if (rawDecisionId === undefined || rawDecisionId === null || rawDecisionId === "") {
        return NextResponse.json(
          {
            error: "An approval decision is required.",
            code: "approval_required",
            policy: "REQUIRE_APPROVAL",
            intentId,
          },
          { status: 409 },
        );
      }
      if (
        typeof rawDecisionId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawDecisionId)
      ) {
        return NextResponse.json(
          { error: "decisionId must be a UUID.", code: "invalid_decision_id", intentId },
          { status: 400 },
        );
      }
      const approvalDecisionId: string = rawDecisionId;
      if (typeof expectedPayloadHash !== "string" || !/^[0-9a-f]{64}$/.test(expectedPayloadHash)) {
        return NextResponse.json(
          { error: "expectedPayloadHash is required.", intentId },
          { status: 400 },
        );
      }
      const ctx = deps.getActiveWorkspaceContext();

      const intent = await deps.getAgentExecutionIntent(ctx.workspace.id, intentId);
      if (!intent) {
        return NextResponse.json({ error: "Execution intent not found." }, { status: 404 });
      }
      if (intent.status !== "pending") {
        return conflict(intentId, "already_decided", intent.status);
      }
      // Recompute from the stored row. `intent.payload` (this exact snapshot) is
      // what gets dispatched below, so the approved hash is the dispatched payload.
      const payloadHash = hashExecutionIntentPayload(intent.payload);
      if (payloadHash !== expectedPayloadHash) {
        return conflict(intentId, "changed");
      }

      const tool = deps.toolRegistry.get(intent.toolName);
      if (!tool) {
        logger.error("agent.execution-intent.approve.tool_missing", {
          intentId,
          toolName: intent.toolName,
          workspaceId: ctx.workspace.id,
        });
        return NextResponse.json(
          { error: `Tool not registered: ${intent.toolName}.`, intentId },
          { status: 500 },
        );
      }

      const sentinelleInput = {
        agentId: intent.agentId,
        skillId: intent.skillId,
        autonomyLevel: intent.autonomyLevel,
        requestedMode: "live" as const,
      };

      // Attribution comes from the authenticated session, not the workspace context:
      // ctx.userId is derived from configuration and can name a different identity
      // than the session that passed the owner gate. Atomic production requires
      // that real UUID above; configured fallback belongs only to legacy DI.
      const actorId = authenticatedActor ?? (await deps.getAuthenticatedActorId()) ?? ctx.userId;
      // G1 attemptId: single-use token written at the claim; every later transition
      // is a compare-and-set on it. The idempotency key is stable across attempts
      // (same intent + same approved payload) and never contains the token.
      const attemptId = `attempt:${deps.randomUUID()}`;
      const idemKey = buildIdempotencyKey(ctx.workspace.id, intentId, payloadHash);

      try {
        const admissionInput = deps.atomicOnly ? buildAdmissionInput(intent, actorId, approvalDecisionId, attemptId.slice(8)) : null;
        let receipt: AdmissionReceipt | undefined;
        const result = await deps.approveAndDispatchExecutionIntent({
          ...(deps.atomicOnly ? { admit: async () => {
            if (!deps.admission || !admissionInput) return { status: "unavailable" as const };
            const admitted = await deps.admission.admit(admissionInput);
            if (admitted.status === "admitted") receipt = admitted.receipt;
            return admitted;
          } } : {}),
          // Advisory only (pure, before the claim). dispatchGovernedTool below is the binding re-check.
          precheck: () => deps.precheckGovernedTool({ intentId, toolName: intent.toolName, payload: intent.payload }),
          evaluate: () => deps.evaluateLiveExecution(sentinelleInput),
          markExecuting: () =>
            deps.transitionAgentExecutionIntent(ctx.workspace.id, intentId, {
              toStatus: "executing",
              // Claim from `pending`: if a concurrent reject already moved it, this
              // raises a concurrency error (-> 409) and no dispatch happens.
              expectedFromStatus: "pending",
              // G2: claim only the exact payload whose hash was just verified.
              expectedPayload: intent.payload,
              actionRef: attemptId,
              updatedAt: new Date().toISOString(),
            }),
          recordAttempt: () =>
            deps.recordLedgerEvent(ctx, {
              eventType: "action",
              actionType: intent.skillId,
              summary: `Dispatching execution intent ${intentId} to n8n (${intent.payload.actionType}).`,
              autonomyLevel: intent.autonomyLevel,
              requiresConfirmation: false,
              workspaceId: ctx.workspace.id,
              skillId: intent.skillId,
              agentId: intent.agentId,
              ...(intent.payload.missionId ? { missionId: intent.payload.missionId } : {}),
              // The approving session both authorizes and triggers the dispatch.
              actorId,
              approverId: actorId,
              effect: { kind: "external_call", operation: "execute", target: "n8n_webhook" },
              metadata: {
                phase: "attempt",
                intentId,
                toolName: intent.toolName,
                actionType: intent.payload.actionType,
                approvedDigest: payloadHash,
                requestId,
                attemptId,
                idemKey,
              },
            }),
          // G1: guardGovernedAction re-reads the G2 approval (the claimed row) and
          // recomputes the payload hash server-side before the tool may run.
          dispatch: () => deps.atomicOnly
            ? (admissionInput && receipt && deps.admission
              ? dispatchAdmittedTool(admissionInput, receipt, deps.admission,
                (payload, { idempotencyKey }) => tool.handler(payload, { workspaceId: ctx.workspace.id,
                  agentId: intent.agentId, idempotencyKey, deps: { env: d.webhookEnv } }), deps.evaluateLiveExecution)
              : Promise.resolve({ ok: false, outcomeUncertain: true, error: "Admission receipt unavailable; reconcile without resend." }))
            : deps.dispatchGovernedTool(
              {
                workspaceId: ctx.workspace.id,
                intentId,
                toolName: intent.toolName,
                agentId: intent.agentId,
                payload: intent.payload,
                attemptToken: attemptId,
                decisionId: approvalDecisionId,
              },
              (payload, { idempotencyKey }) =>
                tool.handler(payload, { workspaceId: ctx.workspace.id, agentId: intent.agentId, idempotencyKey, deps: { env: d.webhookEnv } }),
            ),
          recordResult: (ok, phase, details) =>
            deps.recordLedgerEvent(ctx, {
              eventType: "result",
              actionType: intent.skillId,
              summary: `Execution intent ${intentId} dispatch ${phase}.`,
              autonomyLevel: intent.autonomyLevel,
              requiresConfirmation: false,
              workspaceId: ctx.workspace.id,
              skillId: intent.skillId,
              agentId: intent.agentId,
              ...(intent.payload.missionId ? { missionId: intent.payload.missionId } : {}),
              actorId,
              approverId: actorId,
              effect: {
                kind: "runtime_result",
                operation: phase === "refused" ? "refuse" : "execute",
                target: "n8n_webhook",
              },
              // Rule id/version, reason and action of a refusal: no payload, no secrets.
              metadata: {
                phase,
                intentId,
                requestId,
                // Key avoids "payload" (ledger sensitive-key filter); value is the hash only.
                approvedDigest: payloadHash,
                attemptId,
                idemKey,
                toolName: intent.toolName,
                ...(details?.refusal
                  ? {
                      verdict: details.refusal.verdict,
                      ruleId: details.refusal.ruleId,
                      ruleVersion: details.refusal.ruleVersion,
                      reason: details.refusal.reason,
                      action: details.refusal.action,
                    }
                  : {}),
              },
            }),
          // action_ref keeps the attempt token (the provider ref is the derivable idemKey).
          markExecuted: () =>
            deps.transitionAgentExecutionIntent(ctx.workspace.id, intentId, {
              toStatus: "executed",
              expectedFromStatus: "executing",
              expectedActionRef: attemptId,
              updatedAt: new Date().toISOString(),
            }),
          // Conditional on the status the caller left it in: "pending" only for the
          // pre-claim Sentinelle BLOCK, otherwise the claim ("executing").
          markFailed: (failureCode, fromStatus = "executing") =>
            deps.transitionAgentExecutionIntent(ctx.workspace.id, intentId, {
              toStatus: "failed",
              expectedFromStatus: fromStatus,
              // Post-claim failures are CAS on this attempt's token; the pre-claim
              // BLOCK (from pending) has no token yet.
              ...(fromStatus === "executing" ? { expectedActionRef: attemptId } : {}),
              updatedAt: new Date().toISOString(),
              failureCode,
            }),
          revertClaim: () =>
            deps.transitionAgentExecutionIntent(ctx.workspace.id, intentId, {
              toStatus: "pending",
              expectedFromStatus: "executing",
              expectedPayload: intent.payload,
              expectedActionRef: attemptId,
              actionRef: null,
              updatedAt: new Date().toISOString(),
            }),
          readStatus: async () =>
            (await deps.getAgentExecutionIntent(ctx.workspace.id, intentId))?.status,
          revertToPending: () =>
            deps.transitionAgentExecutionIntent(ctx.workspace.id, intentId, {
              toStatus: "pending",
              expectedFromStatus: "executing",
              expectedPayload: intent.payload,
              expectedActionRef: attemptId,
              actionRef: null,
              updatedAt: new Date().toISOString(),
            }),
        });

        if (result.ok) {
          logger.info("agent.execution-intent.approve.executed", {
            intentId,
            agentId: intent.agentId,
            skillId: intent.skillId,
            workspaceId: ctx.workspace.id,
          });

          // Ethical usage billing — only AFTER CEO approval + successful dispatch.
          // Never takes a percentage of end-user project revenue.
          const billing = await deps.billApprovedIntentUsage({ ctx, intent, actorId }).catch((err) => {
            logger.warn("michael-hq.billing_on_approve.failed", {
              intentId,
              reason: err instanceof Error ? err.message : "unknown",
            });
            return null;
          });

          return NextResponse.json({
            intentId,
            status: result.status,
            actionRef: result.actionRef,
            output: result.output,
            billing: billing
              ? {
                  amountCents: billing.walletEntry.amountCents,
                  stripeSynced: billing.stripeSynced,
                  billingModel: billing.billingModel,
                  revenueSharePercent: billing.revenueSharePercent,
                }
              : null,
          });
        }

        if (result.status === "refused") {
          logger.warn("agent.execution-intent.approve.refused", {
            intentId,
            requestId,
            workspaceId: ctx.workspace.id,
            stage: result.stage,
            verdict: result.refusal.verdict,
            ruleId: result.refusal.ruleId,
            ruleVersion: result.refusal.ruleVersion,
            action: result.refusal.action,
          });
          // requestId travels as the x-request-id header, never in a refusal body.
          return NextResponse.json(
            {
              intentId,
              status: "refused",
              stage: result.stage,
              intentStatus: result.stage === "precheck" ? "pending" : "failed",
              verdict: result.refusal.verdict,
              ruleId: result.refusal.ruleId,
              ruleVersion: result.refusal.ruleVersion,
              reason: result.refusal.reason,
              action: result.refusal.action,
            },
            { status: 403, headers: { "x-request-id": requestId } },
          );
        }

        if ((result.status === "executing" || result.status === "unknown") && "outcome" in result) {
          logger.error("agent.execution-intent.approve.outcome_uncertain", {
            intentId,
            requestId,
            workspaceId: ctx.workspace.id,
            outcome: result.outcome,
            alert: true,
          });
          return NextResponse.json(
            {
              intentId,
              requestId,
              status: result.status,
              outcome: result.outcome,
              error: result.error,
              ...("actionRef" in result && result.actionRef ? { actionRef: result.actionRef } : {}),
            },
            { status: result.httpStatus },
          );
        }

        if ("reason" in result && result.reason === "revert_conflict") {
          logger.error("agent.execution-intent.approve.revert_conflict", {
            intentId,
            workspaceId: ctx.workspace.id,
            alert: true,
          });
          return NextResponse.json(
            { intentId, status: result.status, error: result.error, reason: result.reason },
            { status: 409 },
          );
        }
        if ("reason" in result) {
          logger.error(
            result.claimReverted
              ? "agent.execution-intent.approve.ledger_failed_claim_reverted"
              : "agent.execution-intent.approve.ledger_failed_claim_revert_failed",
            { intentId, workspaceId: ctx.workspace.id, alert: !result.claimReverted },
          );
          return NextResponse.json(
            {
              intentId,
              status: result.status,
              error: result.error,
              reason: result.reason,
              revert: result.revert,
            },
            { status: 500 },
          );
        }
        return NextResponse.json(
          { intentId, status: result.status, error: result.error },
          { status: result.httpStatus },
        );
      } catch (err) {
        if (err instanceof AgentExecutionIntentConcurrencyError) {
          // A concurrent action (e.g. a reject) moved the intent out of `pending`
          // before this approval could claim it. No dispatch happened.
          // Zero rows on the claim: either the status moved (decided) or the
          // stored payload no longer equals the verified snapshot (changed).
          const fresh = await deps.getAgentExecutionIntent(ctx.workspace.id, intentId).catch(() => null);
          return conflict(intentId, fresh?.status === "pending" ? "changed" : "already_decided");
        }
        logger.error("agent.execution-intent.approve.failed", {
          intentId,
          reason: err instanceof Error ? err.message : "unknown",
          workspaceId: ctx.workspace.id,
          alert: true,
        });
        // Not a state conflict: transient or of unknown effect. 503, no markFailed,
        // no resend; a claimed intent stays `executing` for reconciliation.
        return NextResponse.json(
          { error: "Execution intent approval unavailable; state unconfirmed.", intentId },
          { status: 503 },
        );
      }
    }
    return POST;
  }
}
