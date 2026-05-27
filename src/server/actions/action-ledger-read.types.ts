import type { ActionLedgerEntry } from "./action-ledger-repository";

export const DEFAULT_LEDGER_ACTIVITY_LIMIT = 25;
export const MAX_LEDGER_ACTIVITY_LIMIT = 100;

export type ListActionLedgerInput = {
  workspaceId: string;
  limit?: number;
};

export type ListActionLedgerResult = {
  workspaceId: string;
  entries: ActionLedgerEntry[];
  source: "supabase" | "local";
};
