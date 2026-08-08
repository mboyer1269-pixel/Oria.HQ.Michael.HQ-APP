// src/server/michael-hq/finance-dashboard.ts
//
// Read model for /hq/finance — wallet + ledger cost history + Stripe balance.

import { listActionLedgerForWorkspace } from "@/server/actions/action-ledger-read";
import { getWalletSnapshot, listWalletCharges } from "./wallet.ts";
import { fetchStripeCustomerBalanceCents } from "./stripe-billing.ts";
import { BILLING_MODEL, REVENUE_SHARE_PERCENT } from "./billing-policy.ts";

export type FinanceDashboard = {
  workspaceId: string;
  billingModel: typeof BILLING_MODEL;
  revenueSharePercent: typeof REVENUE_SHARE_PERCENT;
  wallet: ReturnType<typeof getWalletSnapshot>;
  stripe: {
    available: boolean;
    balanceCents: number | null;
    customerId?: string;
  };
  recentCharges: ReturnType<typeof listWalletCharges>;
  ledgerCostEvents: {
    id: string;
    summary: string;
    createdAt: string;
    agentId?: string;
    amountCents?: number;
  }[];
};

export async function buildFinanceDashboard(workspaceId: string): Promise<FinanceDashboard> {
  const [ledger, stripe] = await Promise.all([
    listActionLedgerForWorkspace({ workspaceId, limit: 40 }),
    fetchStripeCustomerBalanceCents(),
  ]);

  const ledgerCostEvents = ledger.entries
    .filter((e) => e.eventType === "cost" || e.actionType === "michael_hq.usage_charge")
    .map((e) => {
      const meta = e.metadata as Record<string, unknown> | null;
      const amountCents =
        meta && typeof meta.amountCents === "number" ? meta.amountCents : undefined;
      return {
        id: e.id,
        summary: e.summary,
        createdAt: e.createdAt,
        agentId: e.agentId,
        amountCents,
      };
    });

  return {
    workspaceId,
    billingModel: BILLING_MODEL,
    revenueSharePercent: REVENUE_SHARE_PERCENT,
    wallet: getWalletSnapshot(workspaceId),
    stripe,
    recentCharges: listWalletCharges(workspaceId).slice(0, 25),
    ledgerCostEvents,
  };
}
