import { NextResponse } from "next/server";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { recordLedgerEvent } from "@/server/actions/ledger-events";
import {
  getAgentExecutionIntent,
  transitionAgentExecutionIntent,
} from "@/server/agents/execution-intent-repository";
import {
  EXECUTION_INTENT_REJECT_FAILURE_CODE,
  resolveExecutionIntentRejection,
} from "@/features/agents/execution-intent-reject";
import { logger } from "@/lib/logger";

/**
 * POST /api/agents/execution-intents/:intentId/reject
 *
 * The CEO manual rejection -- the mirror of approve, minus any dispatch. It
 * never touches the n8n webhook, the MCP tool registry, or the Sentinelle: a
 * rejection is a pure, terminal status transition.
 *
 * Sequence:
 *   auth -> load intent (404 if absent) -> require pending (409 otherwise)
 *   -> transition pending -> failed (failureCode CEO_REJECTED)
 *   -> best-effort ledger (decision/rejected, same pattern as the create route).
 *
 * Uses the existing `failed` terminal status (the model already documents
 * pending -> failed as a terminal reject); no new status is introduced.
 */

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ intentId: string }> },
) {
  const authResponse = await requireOwnerApiSession();
  if (authResponse) return authResponse;

  const { intentId } = await params;
  const ctx = getActiveWorkspaceContext();

  const loaded = await getAgentExecutionIntent(ctx.workspace.id, intentId);
  const decision = resolveExecutionIntentRejection(loaded);
  if (decision.kind === "not_found") {
    return NextResponse.json({ error: "Execution intent not found." }, { status: 404 });
  }
  if (decision.kind === "conflict") {
    return NextResponse.json(
      { error: "Execution intent is not pending.", intentId, status: decision.status },
      { status: 409 },
    );
  }
  const intent = decision.intent;

  try {
    await transitionAgentExecutionIntent(ctx.workspace.id, intentId, {
      toStatus: "failed",
      updatedAt: new Date().toISOString(),
      failureCode: EXECUTION_INTENT_REJECT_FAILURE_CODE,
    });
  } catch (err) {
    logger.error("agent.execution-intent.reject.failed", {
      intentId,
      reason: err instanceof Error ? err.message : "unknown",
      workspaceId: ctx.workspace.id,
    });
    return NextResponse.json(
      { error: "Execution intent rejection failed.", intentId },
      { status: 500 },
    );
  }

  // Best-effort audit -- identical pattern/shape to the create route's ledger
  // entry (decision event on the execution-intent surface). A ledger failure
  // never blocks the rejection.
  await recordLedgerEvent(ctx, {
    eventType: "decision",
    actionType: intent.skillId,
    summary: `Execution intent ${intentId} rejected by CEO (${intent.payload.actionType}).`,
    autonomyLevel: intent.autonomyLevel,
    requiresConfirmation: false,
    workspaceId: ctx.workspace.id,
    skillId: intent.skillId,
    agentId: intent.agentId,
    ...(intent.payload.missionId ? { missionId: intent.payload.missionId } : {}),
    effect: { kind: "runtime_result", operation: "plan", target: "agent_execution_intent" },
    metadata: {
      phase: "rejected",
      intentId,
      toolName: intent.toolName,
      actionType: intent.payload.actionType,
      failureCode: EXECUTION_INTENT_REJECT_FAILURE_CODE,
    },
  }).catch((err) => {
    logger.warn("agent.execution-intent.reject.ledger.failed", {
      intentId,
      reason: err instanceof Error ? err.message : "unknown",
    });
  });

  logger.info("agent.execution-intent.reject.done", {
    intentId,
    agentId: intent.agentId,
    skillId: intent.skillId,
    workspaceId: ctx.workspace.id,
  });

  return NextResponse.json({ intentId, status: "failed", outcome: "rejected" });
}
