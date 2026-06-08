import type { WorkspaceContext } from "@/core/workspace-context";
import { recordLedgerEvent } from "@/server/actions/ledger-events";

type GreenLaneParams = {
  agentId: string;
  skillId: string;
  autonomyLevel: number;
  ventureId?: string;
};

export async function recordGreenLaneDecision(ctx: WorkspaceContext, params: GreenLaneParams) {
  return recordLedgerEvent(ctx, {
    eventType: "decision",
    actionType: "sentinelle_allow",
    summary: `Sentinelle approved green lane execution of ${params.skillId} by ${params.agentId}.`,
    autonomyLevel: params.autonomyLevel,
    requiresConfirmation: false,
    workspaceId: ctx.workspace.id,
    skillId: params.skillId,
    agentId: params.agentId,
    effect: {
      kind: "runtime_result",
      operation: "plan",
      target: "green_lane_execution",
    },
    metadata: {
      phase: "decision",
      ...(params.ventureId ? { ventureRef: params.ventureId } : {}),
    },
  });
}

export async function recordGreenLanePendingDispatch(ctx: WorkspaceContext, params: GreenLaneParams) {
  return recordLedgerEvent(ctx, {
    eventType: "action",
    actionType: params.skillId,
    summary: `Dispatching green lane execution for ${params.skillId}.`,
    autonomyLevel: params.autonomyLevel,
    requiresConfirmation: false,
    workspaceId: ctx.workspace.id,
    skillId: params.skillId,
    agentId: params.agentId,
    effect: {
      kind: "external_call",
      operation: "execute",
      target: "skill_dispatcher",
    },
    metadata: {
      phase: "pending_dispatch",
      ...(params.ventureId ? { ventureRef: params.ventureId } : {}),
    },
  });
}

export async function recordGreenLaneResult(
  ctx: WorkspaceContext,
  params: GreenLaneParams & {
    outcome: "success" | "failed";
    failureCode?: string;
  }
) {
  return recordLedgerEvent(ctx, {
    eventType: "result",
    actionType: params.skillId,
    summary: `Green lane execution ${params.outcome} for ${params.skillId}.`,
    autonomyLevel: params.autonomyLevel,
    requiresConfirmation: false,
    workspaceId: ctx.workspace.id,
    skillId: params.skillId,
    agentId: params.agentId,
    effect: {
      kind: "runtime_result",
      operation: "execute",
      target: "skill_dispatcher",
    },
    metadata: {
      phase: params.outcome,
      ...(params.failureCode ? { failureCode: params.failureCode } : {}),
      ...(params.ventureId ? { ventureRef: params.ventureId } : {}),
    },
  });
}
