// src/server/ledger/ledger-health.ts
//
// Server-side Ledger Health report for the CEO cockpit panel.

import { listLedgerChainForWorkspace } from "@/server/actions/action-ledger-chain-read";
import { auditChain, type ChainAuditReport } from "./hash-chain-audit.ts";
import { isHashChainWriteEnabled } from "./hash-chain-write-flag.ts";
import { resolveLedgerHmacKey } from "./hash-chain-hmac-key.ts";

export type LedgerHealthReport = ChainAuditReport & {
  workspaceId: string;
  chainScope: string;
  source: "local" | "supabase";
  writeEnabled: boolean;
  migrationRequired: boolean;
};

export async function buildLedgerHealthReport(
  workspaceId: string,
  userId: string,
): Promise<LedgerHealthReport> {
  const writeEnabled = isHashChainWriteEnabled();
  const chainRead = await listLedgerChainForWorkspace(workspaceId, userId);

  if (chainRead.migrationRequired) {
    return {
      ok: false,
      count: 0,
      verifiedCount: 0,
      genesisId: null,
      tipId: null,
      hmacChecked: false,
      brokenAt: null,
      reason: "migration_required",
      brokenEntryId: null,
      summary:
        "hash-chain columns not yet applied — run migrations 0022 + 0023 on the target database",
      workspaceId,
      chainScope: chainRead.chainScope,
      source: chainRead.source,
      writeEnabled,
      migrationRequired: true,
    };
  }

  let hmacKey: string | undefined;
  try {
    hmacKey = resolveLedgerHmacKey();
  } catch {
    hmacKey = undefined;
  }

  const audit = auditChain(chainRead.entries, { hmacKey });

  return {
    ...audit,
    workspaceId,
    chainScope: chainRead.chainScope,
    source: chainRead.source,
    writeEnabled,
    migrationRequired: false,
  };
}
