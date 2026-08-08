// src/server/actions/action-ledger-chain-read.ts
//
// Read-only hash-chain export for workspace audit (Ledger Health panel).

import type { CalendarStorageMode } from "@/core/types";
import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import type { ActionLedgerRow } from "@/server/db/types";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import { getLocalChainEntries } from "@/server/ledger/hash-chain-local-registry";
import {
  resolveLedgerChainScope,
  toLedgerChainEntry,
  type LedgerRowForChain,
} from "@/server/ledger/hash-chain-ledger-fields";
import type { LedgerChainEntry } from "@/server/ledger/hash-chain-verifier";

export type LedgerChainReadResult = {
  workspaceId: string;
  chainScope: string;
  entries: LedgerChainEntry[];
  source: CalendarStorageMode;
  migrationRequired?: boolean;
};

function mapRowToChainInput(row: ActionLedgerRow): LedgerRowForChain {
  const extended = row as ActionLedgerRow & {
    prev_hash?: string | null;
    entry_hash?: string | null;
    hmac?: string | null;
    canonical_version?: number | null;
  };

  return {
    id: extended.id,
    user_id: extended.user_id,
    workspace_id: extended.workspace_id,
    agent_id: extended.agent_id,
    skill_id: extended.skill_id,
    mission_id: extended.mission_id,
    action_type: extended.action_type,
    event_type: extended.event_type,
    summary: extended.summary,
    autonomy_level: extended.autonomy_level,
    requires_confirmation: extended.requires_confirmation,
    payload: extended.payload as LedgerRowForChain["payload"],
    metadata: extended.metadata as LedgerRowForChain["metadata"],
    created_at: extended.created_at,
    prev_hash: extended.prev_hash,
    entry_hash: extended.entry_hash,
    hmac: extended.hmac,
    canonical_version: extended.canonical_version,
  };
}

function rowsToChain(rows: LedgerRowForChain[]): LedgerChainEntry[] {
  const chain: LedgerChainEntry[] = [];
  for (const row of rows) {
    const entry = toLedgerChainEntry(row);
    if (entry) chain.push(entry);
  }
  return chain;
}

/**
 * Load the sealed hash chain for a workspace, ordered genesis → tip.
 */
export async function listLedgerChainForWorkspace(
  workspaceId: string,
  userId: string,
): Promise<LedgerChainReadResult> {
  const chainScope = resolveLedgerChainScope(workspaceId, userId);
  const supabase = createOptionalSupabaseAdminClient();

  if (supabase) {
    const { data, error } = await supabase
      .from("action_ledger")
      .select("*")
      .eq("workspace_id", workspaceId)
      .not("entry_hash", "is", null)
      .order("created_at", { ascending: true });

    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes("entry_hash") || message.includes("column")) {
        return {
          workspaceId,
          chainScope,
          entries: [],
          source: "supabase",
          migrationRequired: true,
        };
      }
      throw new Error(`Failed to read ledger chain from Supabase: ${error.message}`);
    }

    const rows = (data ?? []).map((row) => mapRowToChainInput(row as ActionLedgerRow));
    return {
      workspaceId,
      chainScope,
      entries: rowsToChain(rows),
      source: "supabase",
    };
  }

  if (!isLocalPersistenceFallbackAllowed()) {
    throw new Error("Supabase configuration is required for ledger chain reads in production.");
  }

  return {
    workspaceId,
    chainScope,
    entries: [...getLocalChainEntries(chainScope)],
    source: "local",
  };
}
