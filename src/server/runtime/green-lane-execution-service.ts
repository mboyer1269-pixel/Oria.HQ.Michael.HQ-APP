import { logger } from "@/lib/logger";

export type GreenLaneExecutionDependencies = {
  recordDecision: () => Promise<unknown>;
  recordPendingDispatch: () => Promise<unknown>;
  dispatch: () => Promise<{ actionRef?: string; result: unknown }>;
  recordResult: (outcome: "success" | "failed", failureCode?: string) => Promise<unknown>;
  createOutcome: (outcome: "pending" | "failed", actionRef?: string) => Promise<{ id: string } | null>;
};

export async function executeGreenLaneAction(
  params: {
    agentId: string;
    skillId: string;
    requiresLedger: boolean;
  },
  deps: GreenLaneExecutionDependencies
) {
  const { agentId, skillId, requiresLedger } = params;

  if (requiresLedger) {
    try {
      await deps.recordDecision();
      await deps.recordPendingDispatch();
    } catch (err) {
      logger.error("agent.execute.ledger_pre_dispatch.failed", {
        agentId,
        skillId,
        reason: err instanceof Error ? err.message : "unknown",
      });
      return { ok: false, error: "Ledger pre-dispatch failed. Execution blocked.", status: 500 };
    }
  }

  let dispatchResult;
  try {
    dispatchResult = await deps.dispatch();
  } catch (err) {
    logger.error("agent.execute.dispatch.failed", {
      agentId,
      skillId,
      reason: err instanceof Error ? err.message : "unknown",
    });

    if (requiresLedger) {
      await deps.recordResult("failed", "DISPATCH_FAILED").catch(() => void 0);
    }

    await deps.createOutcome("failed").catch(() => void 0);

    return { ok: false, error: "Skill dispatch failed.", status: 500 };
  }

  if (requiresLedger) {
    await deps.recordResult("success").catch((err) => {
      logger.warn("agent.execute.ledger_post_dispatch.failed", {
        agentId,
        skillId,
        reason: err instanceof Error ? err.message : "unknown",
      });
    });
  }

  const outcomeRecord = await deps.createOutcome("pending", dispatchResult.actionRef).catch((err) => {
    logger.warn("agent.execute.outcome.record.failed", {
      agentId,
      skillId,
      reason: err instanceof Error ? err.message : "unknown",
    });
    return null;
  });

  return {
    ok: true,
    result: dispatchResult.result,
    actionRef: dispatchResult.actionRef,
    outcomeId: outcomeRecord?.id,
  };
}
