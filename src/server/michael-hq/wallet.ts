// src/server/michael-hq/wallet.ts
//
// Sovereign usage wallet — infrastructure costs only.
// NEVER deducts a percentage of end-user project revenue.
// Charges are applied only AFTER explicit CEO approval of an intent.

import type { EstimatedCost } from "./telemetry.ts";

export type WalletChargeReason = "approved_intent_usage";

export type WalletLedgerEntry = {
  id: string;
  workspaceId: string;
  userId: string;
  intentId: string;
  agentId: string;
  skillId: string;
  amountCents: number;
  currency: "USD";
  reason: WalletChargeReason;
  estimatedCost: EstimatedCost;
  stripeSync: "skipped" | "queued" | "synced" | "failed";
  stripeReference?: string;
  createdAt: string;
  /** Explicit policy marker — revenue share is forbidden. */
  billingModel: "usage_only_no_revenue_share";
};

export type WalletSnapshot = {
  workspaceId: string;
  currency: "USD";
  balanceCents: number;
  startingBalanceCents: number;
  chargedCents: number;
  entryCount: number;
  billingModel: "usage_only_no_revenue_share";
  revenueSharePercent: 0;
};

const DEFAULT_STARTING_BALANCE_CENTS = 10_000; // $100.00 demo credit for local/dev

type WalletState = {
  startingBalanceCents: number;
  entries: WalletLedgerEntry[];
};

const wallets = new Map<string, WalletState>();

function getState(workspaceId: string): WalletState {
  let state = wallets.get(workspaceId);
  if (!state) {
    state = { startingBalanceCents: DEFAULT_STARTING_BALANCE_CENTS, entries: [] };
    wallets.set(workspaceId, state);
  }
  return state;
}

export function getWalletSnapshot(workspaceId: string): WalletSnapshot {
  const state = getState(workspaceId);
  const chargedCents = state.entries.reduce((sum, e) => sum + e.amountCents, 0);
  return {
    workspaceId,
    currency: "USD",
    balanceCents: state.startingBalanceCents - chargedCents,
    startingBalanceCents: state.startingBalanceCents,
    chargedCents,
    entryCount: state.entries.length,
    billingModel: "usage_only_no_revenue_share",
    revenueSharePercent: 0,
  };
}

export function listWalletCharges(workspaceId: string): WalletLedgerEntry[] {
  return [...getState(workspaceId).entries];
}

export type ChargeWalletInput = {
  workspaceId: string;
  userId: string;
  intentId: string;
  agentId: string;
  skillId: string;
  estimatedCost: EstimatedCost;
  stripeSync?: WalletLedgerEntry["stripeSync"];
  stripeReference?: string;
};

/**
 * Deduct usage cost after CEO approval. Amount is the telemetry estimated_cost
 * in cents — never a percentage of project revenue.
 */
export function chargeWalletForApprovedIntent(input: ChargeWalletInput): WalletLedgerEntry {
  if (input.estimatedCost.totalCents < 0) {
    throw new Error("Wallet charge amount must be non-negative.");
  }

  const entry: WalletLedgerEntry = {
    id: `wchg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    workspaceId: input.workspaceId,
    userId: input.userId,
    intentId: input.intentId,
    agentId: input.agentId,
    skillId: input.skillId,
    amountCents: input.estimatedCost.totalCents,
    currency: "USD",
    reason: "approved_intent_usage",
    estimatedCost: input.estimatedCost,
    stripeSync: input.stripeSync ?? "skipped",
    stripeReference: input.stripeReference,
    createdAt: new Date().toISOString(),
    billingModel: "usage_only_no_revenue_share",
  };

  getState(input.workspaceId).entries.unshift(entry);
  return entry;
}

export function setWalletStartingBalance(workspaceId: string, cents: number): void {
  getState(workspaceId).startingBalanceCents = Math.max(0, Math.floor(cents));
}

/** Test helper */
export function resetWallet(workspaceId?: string): void {
  if (workspaceId) wallets.delete(workspaceId);
  else wallets.clear();
}
