// src/server/michael-hq/stripe-billing.ts
//
// Ethical Stripe sync for Michael HQ usage billing.
//
// Policy (hard-coded):
//   - Bill infrastructure usage only (tokens + external API costs).
//   - Charge ONLY after explicit CEO approval of an execution intent.
//   - NEVER take a percentage of end-user project revenue (no 20% tax).
//
// When STRIPE_SECRET_KEY is absent, charges stay in the local wallet (dev).

import "server-only";

import Stripe from "stripe";
import type { EstimatedCost } from "./telemetry.ts";
import { chargeWalletForApprovedIntent, type WalletLedgerEntry } from "./wallet.ts";
import { BILLING_MODEL, REVENUE_SHARE_PERCENT } from "./billing-policy.ts";
import { logger } from "@/lib/logger";

export { BILLING_MODEL, REVENUE_SHARE_PERCENT } from "./billing-policy.ts";

export type StripeBillingConfig = {
  secretKey: string | undefined;
  customerId: string | undefined;
  meterEventName: string;
};

export function resolveStripeBillingConfig(
  env: Record<string, string | undefined> = process.env,
): StripeBillingConfig {
  return {
    secretKey: env.STRIPE_SECRET_KEY?.trim() || undefined,
    customerId: env.STRIPE_CUSTOMER_ID?.trim() || undefined,
    meterEventName: env.STRIPE_METER_EVENT_NAME?.trim() || "michael_hq_agent_usage",
  };
}

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: "2025-08-27.basil",
    typescript: true,
  });
}

export type SyncApprovedUsageInput = {
  workspaceId: string;
  userId: string;
  intentId: string;
  agentId: string;
  skillId: string;
  estimatedCost: EstimatedCost;
  customerEmail?: string;
};

export type SyncApprovedUsageResult = {
  walletEntry: WalletLedgerEntry;
  stripeSynced: boolean;
  stripeReference?: string;
  billingModel: typeof BILLING_MODEL;
  revenueSharePercent: typeof REVENUE_SHARE_PERCENT;
};

/**
 * After CEO approval: record wallet debit and optionally sync to Stripe.
 * Never computes revenue share.
 */
export async function syncApprovedUsageCharge(
  input: SyncApprovedUsageInput,
  env: Record<string, string | undefined> = process.env,
): Promise<SyncApprovedUsageResult> {
  const config = resolveStripeBillingConfig(env);

  // Absolute guard — refuse any attempt to inject revenue share via metadata abuse.
  if (REVENUE_SHARE_PERCENT !== 0) {
    throw new Error("Illegal billing configuration: revenue share must remain 0.");
  }

  if (!config.secretKey) {
    const walletEntry = chargeWalletForApprovedIntent({
      ...input,
      stripeSync: "skipped",
    });
    return {
      walletEntry,
      stripeSynced: false,
      billingModel: BILLING_MODEL,
      revenueSharePercent: REVENUE_SHARE_PERCENT,
    };
  }

  try {
    const stripe = createStripeClient(config.secretKey);
    const customerId =
      config.customerId ??
      (await ensureStripeCustomer(stripe, input.userId, input.customerEmail));

    // Invoice item for exact usage amount (cents). Not a % of project revenue.
    const amountCents = Math.max(0, input.estimatedCost.totalCents);
    const invoiceItem = await stripe.invoiceItems.create({
      customer: customerId,
      amount: amountCents,
      currency: "usd",
      description: `Michael HQ usage — ${input.agentId}/${input.skillId} (${input.intentId})`,
      metadata: {
        workspaceId: input.workspaceId,
        intentId: input.intentId,
        agentId: input.agentId,
        skillId: input.skillId,
        billingModel: BILLING_MODEL,
        revenueSharePercent: String(REVENUE_SHARE_PERCENT),
        modelId: input.estimatedCost.modelId,
        inputTokens: String(input.estimatedCost.inputTokens),
        outputTokens: String(input.estimatedCost.outputTokens),
      },
    });

    const walletEntry = chargeWalletForApprovedIntent({
      ...input,
      stripeSync: "synced",
      stripeReference: invoiceItem.id,
    });

    logger.info("michael-hq.stripe.usage_synced", {
      intentId: input.intentId,
      amountCents,
      invoiceItemId: invoiceItem.id,
    });

    return {
      walletEntry,
      stripeSynced: true,
      stripeReference: invoiceItem.id,
      billingModel: BILLING_MODEL,
      revenueSharePercent: REVENUE_SHARE_PERCENT,
    };
  } catch (err) {
    logger.warn("michael-hq.stripe.usage_sync_failed", {
      intentId: input.intentId,
      reason: err instanceof Error ? err.message : "unknown",
    });
    const walletEntry = chargeWalletForApprovedIntent({
      ...input,
      stripeSync: "failed",
    });
    return {
      walletEntry,
      stripeSynced: false,
      billingModel: BILLING_MODEL,
      revenueSharePercent: REVENUE_SHARE_PERCENT,
    };
  }
}

async function ensureStripeCustomer(
  stripe: Stripe,
  userId: string,
  email?: string,
): Promise<string> {
  if (email) {
    const existing = await stripe.customers.list({ email, limit: 1 });
    if (existing.data[0]?.id) return existing.data[0].id;
  }

  const created = await stripe.customers.create({
    email,
    metadata: { oriaUserId: userId, billingModel: BILLING_MODEL },
  });
  return created.id;
}

export async function fetchStripeCustomerBalanceCents(
  env: Record<string, string | undefined> = process.env,
): Promise<{ available: boolean; balanceCents: number | null; customerId?: string }> {
  const config = resolveStripeBillingConfig(env);
  if (!config.secretKey || !config.customerId) {
    return { available: false, balanceCents: null };
  }

  try {
    const stripe = createStripeClient(config.secretKey);
    const customer = await stripe.customers.retrieve(config.customerId);
    if (customer.deleted) {
      return { available: false, balanceCents: null, customerId: config.customerId };
    }
    // Stripe balance is in the customer's currency; negative = credit.
    return {
      available: true,
      balanceCents: typeof customer.balance === "number" ? -customer.balance : 0,
      customerId: config.customerId,
    };
  } catch {
    return { available: false, balanceCents: null, customerId: config.customerId };
  }
}
