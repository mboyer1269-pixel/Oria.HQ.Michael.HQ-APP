import { NextResponse } from "next/server";
import { getAuthenticatedActorId, requireOwnerApiSession } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { evaluateLiveExecution } from "@/server/runtime/execution-guard";
import { recordLedgerEvent } from "@/server/actions/ledger-events";
import { mcpToolRegistry } from "@/server/agents/tools";
import {
  AgentExecutionIntentConcurrencyError,
  getAgentExecutionIntent,
  transitionAgentExecutionIntent,
} from "@/server/agents/execution-intent-repository";
import { approveAndDispatchExecutionIntent } from "@/server/agents/execution-intent-approval-service";
import { billApprovedIntentUsage } from "@/server/michael-hq/billing-on-approve";
import { logger } from "@/lib/logger";
import { dispatchGovernedTool, precheckGovernedTool } from "@/server/runtime/governed-tool-dispatch";
import { hashExecutionIntentPayload } from "@/server/agents/execution-intent-payload-hash";

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

/**
 * POST /api/agents/execution-intents/:intentId/approve
 *
 * The CEO manual approval -- the SINGLE trigger that fires the n8n webhook.
 * This is the only route that invokes the n8n_webhook_trigger MCP tool.
 *
 * Sequence (enforced by approveAndDispatchExecutionIntent):
 *   Sentinelle re-check (BLOCK -> 403) -> mark executing -> Ledger (attempt,
 *   before the call) -> dispatch via MCP tool -> Ledger (result) -> update
 *   status (executed | failed). A rate-limited dispatch reverts to pending.
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ intentId: string }> },
) {
  const authResponse = await requireOwnerApiSession();
  if (authResponse) return authResponse;

  const { intentId } = await params;
  // G2: the body carries ONLY the hash of the payload the CEO reviewed. Any
  // other field (approvedBy, actorId, workspaceId, ...) is ignored: actor and
  // workspace come from the session/server context below.
  const body = (await request.json().catch(() => null)) as { expectedPayloadHash?: unknown } | null;
  const expectedPayloadHash = body?.expectedPayloadHash;
  if (typeof expectedPayloadHash !== "string" || !/^[0-9a-f]{64}$/.test(expectedPayloadHash)) {
    return NextResponse.json(
      { error: "expectedPayloadHash is required.", intentId },
      { status: 400 },
    );
  }
  const ctx = getActiveWorkspaceContext();

  const intent = await getAgentExecutionIntent(ctx.workspace.id, intentId);
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

  const tool = mcpToolRegistry.get(intent.toolName);
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
  // than the session that passed the owner gate. Falls back to ctx.userId only
  // where no session exists (local/dev), which is the honest identity there.
  const actorId = (await getAuthenticatedActorId()) ?? ctx.userId;
  // Correlates the attempt/result ledger rows and logs of this one request.
  // Never derived from secrets; client value is length-capped and charset-limited.
  const clientRequestId = request.headers.get("x-request-id") ?? "";
  const requestId = /^[A-Za-z0-9._:-]{1,128}$/.test(clientRequestId) ? clientRequestId : crypto.randomUUID();

  try {
    const result = await approveAndDispatchExecutionIntent({
      // Advisory only (pure, before the claim). dispatchGovernedTool below is the binding re-check.
      precheck: () => precheckGovernedTool({ intentId, toolName: intent.toolName, payload: intent.payload }),
      evaluate: () => evaluateLiveExecution(sentinelleInput),
      markExecuting: () =>
        transitionAgentExecutionIntent(ctx.workspace.id, intentId, {
          toStatus: "executing",
          // Claim from `pending`: if a concurrent reject already moved it, this
          // raises a concurrency error (-> 409) and no dispatch happens.
          expectedFromStatus: "pending",
          // G2: claim only the exact payload whose hash was just verified.
          expectedPayload: intent.payload,
          updatedAt: new Date().toISOString(),
        }),
      recordAttempt: () =>
        recordLedgerEvent(ctx, {
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
          },
        }),
      // G1: guardGovernedAction re-reads the G2 approval (the claimed row) and
      // recomputes the payload hash server-side before the tool may run.
      dispatch: () =>
        dispatchGovernedTool(
          {
            workspaceId: ctx.workspace.id,
            intentId,
            toolName: intent.toolName,
            agentId: intent.agentId,
            payload: intent.payload,
          },
          (payload) => tool.handler(payload, { workspaceId: ctx.workspace.id, agentId: intent.agentId }),
        ),
      recordResult: (ok, phase, details) =>
        recordLedgerEvent(ctx, {
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
          effect: { kind: "runtime_result", operation: "execute", target: "n8n_webhook" },
          // Rule id/version, reason and action of a refusal: no payload, no secrets.
          metadata: {
            phase,
            intentId,
            requestId,
            // Key avoids "payload" (ledger sensitive-key filter); value is the hash only.
            approvedDigest: payloadHash,
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
      markExecuted: (actionRef) =>
        transitionAgentExecutionIntent(ctx.workspace.id, intentId, {
          toStatus: "executed",
          expectedFromStatus: "executing",
          updatedAt: new Date().toISOString(),
          ...(actionRef ? { actionRef } : {}),
        }),
      // Conditional on the status the caller left it in: "pending" only for the
      // pre-claim Sentinelle BLOCK, otherwise the claim ("executing").
      markFailed: (failureCode, fromStatus = "executing") =>
        transitionAgentExecutionIntent(ctx.workspace.id, intentId, {
          toStatus: "failed",
          expectedFromStatus: fromStatus,
          updatedAt: new Date().toISOString(),
          failureCode,
        }),
      revertClaim: () =>
        transitionAgentExecutionIntent(ctx.workspace.id, intentId, {
          toStatus: "pending",
          expectedFromStatus: "executing",
          expectedPayload: intent.payload,
          updatedAt: new Date().toISOString(),
        }),
      revertToPending: () =>
        transitionAgentExecutionIntent(ctx.workspace.id, intentId, {
          toStatus: "pending",
          expectedFromStatus: "executing",
          expectedPayload: intent.payload,
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
      const billing = await billApprovedIntentUsage({ ctx, intent, actorId }).catch((err) => {
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
      return NextResponse.json(
        {
          intentId,
          requestId,
          status: "refused",
          stage: result.stage,
          intentStatus: result.stage === "precheck" ? "pending" : "failed",
          verdict: result.refusal.verdict,
          ruleId: result.refusal.ruleId,
          ruleVersion: result.refusal.ruleVersion,
          reason: result.refusal.reason,
          action: result.refusal.action,
        },
        { status: 403 },
      );
    }

    if (result.status === "executing" && "outcome" in result) {
      logger.error("agent.execution-intent.approve.outcome_uncertain", {
        intentId,
        requestId,
        workspaceId: ctx.workspace.id,
        alert: true,
      });
      return NextResponse.json(
        { intentId, requestId, status: "executing", outcome: "uncertain", error: result.error },
        { status: 502 },
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
        { intentId, status: result.status, error: result.error, reason: result.reason },
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
      const fresh = await getAgentExecutionIntent(ctx.workspace.id, intentId).catch(() => null);
      return conflict(intentId, fresh?.status === "pending" ? "changed" : "already_decided");
    }
    logger.error("agent.execution-intent.approve.failed", {
      intentId,
      reason: err instanceof Error ? err.message : "unknown",
      workspaceId: ctx.workspace.id,
    });
    return NextResponse.json(
      { error: "Execution intent approval failed.", intentId },
      { status: 500 },
    );
  }
}
