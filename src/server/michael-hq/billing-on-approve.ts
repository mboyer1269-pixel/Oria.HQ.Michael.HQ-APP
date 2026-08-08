// src/server/michael-hq/billing-on-approve.ts
//
// Hook invoked after a CEO-approved intent executes successfully.
// Deducts estimated_cost from the sovereign wallet (+ Stripe sync when configured).

import type { AgentExecutionIntent } from "@/features/agents/execution-intent";
import { extractEstimatedCostFromIntentData } from "./telemetry-extract.ts";
import { syncApprovedUsageCharge, type SyncApprovedUsageResult } from "./stripe-billing.ts";
import { recordLedgerEvent } from "@/server/actions/ledger-events";
import type { WorkspaceContext } from "@/core/workspace-context";

export async function billApprovedIntentUsage(input: {
  ctx: WorkspaceContext;
  intent: AgentExecutionIntent;
  actorId: string;
}): Promise<SyncApprovedUsageResult | null> {
  const data = input.intent.payload?.data as Record<string, unknown> | undefined;
  const estimatedCost = extractEstimatedCostFromIntentData(data);
  if (!estimatedCost || estimatedCost.totalCents <= 0) {
    return null;
  }

  const result = await syncApprovedUsageCharge({
    workspaceId: input.ctx.workspace.id,
    userId: input.ctx.userId,
    intentId: input.intent.intentId,
    agentId: input.intent.agentId,
    skillId: input.intent.skillId,
    estimatedCost,
    customerEmail: input.ctx.currentOwnerUser?.email,
  });

  await recordLedgerEvent(input.ctx, {
    eventType: "cost",
    actionType: "michael_hq.usage_charge",
    summary: `Usage charge ${result.walletEntry.amountCents}¢ for intent ${input.intent.intentId} (no revenue share).`,
    autonomyLevel: 0,
    requiresConfirmation: false,
    workspaceId: input.ctx.workspace.id,
    skillId: input.intent.skillId,
    agentId: input.intent.agentId,
    actorId: input.actorId,
    effect: { kind: "runtime_result", operation: "execute", target: "michael_hq_wallet" },
    metadata: {
      intentId: input.intent.intentId,
      amountCents: result.walletEntry.amountCents,
      stripeSynced: result.stripeSynced,
      stripeReference: result.stripeReference ?? null,
      billingModel: result.billingModel,
      revenueSharePercent: result.revenueSharePercent,
    },
  }).catch(() => void 0);

  return result;
}
