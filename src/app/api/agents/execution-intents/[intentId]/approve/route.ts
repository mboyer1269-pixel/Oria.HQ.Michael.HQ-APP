import { NextResponse } from "next/server";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { evaluateLiveExecution } from "@/server/runtime/execution-guard";
import { recordLedgerEvent } from "@/server/actions/ledger-events";
import { mcpToolRegistry } from "@/server/agents/tools";
import {
  getAgentExecutionIntent,
  transitionAgentExecutionIntent,
} from "@/server/agents/execution-intent-repository";
import { approveAndDispatchExecutionIntent } from "@/server/agents/execution-intent-approval-service";
import { logger } from "@/lib/logger";

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
  _request: Request,
  { params }: { params: Promise<{ intentId: string }> },
) {
  const authResponse = await requireOwnerApiSession();
  if (authResponse) return authResponse;

  const { intentId } = await params;
  const ctx = getActiveWorkspaceContext();

  const intent = await getAgentExecutionIntent(ctx.workspace.id, intentId);
  if (!intent) {
    return NextResponse.json({ error: "Execution intent not found." }, { status: 404 });
  }
  if (intent.status !== "pending") {
    return NextResponse.json(
      { error: "Execution intent is not pending.", intentId, status: intent.status },
      { status: 409 },
    );
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

  try {
    const result = await approveAndDispatchExecutionIntent({
      evaluate: () => evaluateLiveExecution(sentinelleInput),
      markExecuting: () =>
        transitionAgentExecutionIntent(ctx.workspace.id, intentId, {
          toStatus: "executing",
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
          effect: { kind: "external_call", operation: "execute", target: "n8n_webhook" },
          metadata: {
            phase: "attempt",
            intentId,
            toolName: intent.toolName,
            actionType: intent.payload.actionType,
          },
        }),
      dispatch: () =>
        tool.handler(intent.payload, { workspaceId: ctx.workspace.id, agentId: intent.agentId }),
      recordResult: (ok, phase) =>
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
          effect: { kind: "runtime_result", operation: "execute", target: "n8n_webhook" },
          metadata: { phase, intentId },
        }),
      markExecuted: (actionRef) =>
        transitionAgentExecutionIntent(ctx.workspace.id, intentId, {
          toStatus: "executed",
          updatedAt: new Date().toISOString(),
          ...(actionRef ? { actionRef } : {}),
        }),
      markFailed: (failureCode) =>
        transitionAgentExecutionIntent(ctx.workspace.id, intentId, {
          toStatus: "failed",
          updatedAt: new Date().toISOString(),
          failureCode,
        }),
      revertToPending: () =>
        transitionAgentExecutionIntent(ctx.workspace.id, intentId, {
          toStatus: "pending",
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
      return NextResponse.json({
        intentId,
        status: result.status,
        actionRef: result.actionRef,
        output: result.output,
      });
    }

    return NextResponse.json(
      { intentId, status: result.status, error: result.error },
      { status: result.httpStatus },
    );
  } catch (err) {
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
