// src/server/actions/action-ledger-hash-chain-read.ts
//
// Read-only hash-chain audit for a workspace. Loads sealed ledger rows in
// created_at order and runs auditChain() (linkage + entry_hash; HMAC only when
// LEDGER_HMAC_KEY is available server-side — never sent to the client).

import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import { auditChain, type ChainAuditReport } from "@/server/ledger/hash-chain-audit";
import type { CanonicalJson } from "@/server/ledger/hash-chain-canonicalizer";
import { getLedgerHmacKey } from "@/server/ledger/hash-chain-live-seal";
import type { LedgerChainEntry } from "@/server/ledger/hash-chain-verifier";
import { isHashChainWriteEnabled } from "@/server/ledger/hash-chain-write-flag";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import { listLocalActionLedgerEntries, type ActionLedgerEntry } from "./action-ledger-repository";

export type WorkspaceHashChainAudit = {
  workspaceId: string;
  writeEnabled: boolean;
  source: "supabase" | "local" | "unavailable";
  sealedCount: number;
  /** Truncated tip entry_hash for operator display (never the HMAC key). */
  tipHashPreview: string | null;
  report: ChainAuditReport;
};

const HASH_PREVIEW_LEN = 12;

function previewHash(hash: string | null | undefined): string | null {
  if (typeof hash !== "string" || hash.length === 0) return null;
  return hash.slice(0, HASH_PREVIEW_LEN);
}

function entryToChainEntry(entry: ActionLedgerEntry): LedgerChainEntry | null {
  if (typeof entry.entryHash !== "string" || entry.entryHash.length === 0) {
    return null;
  }

  return {
    id: entry.id,
    workspace_id: entry.workspaceId ?? null,
    user_id: entry.userId,
    agent_id: entry.agentId ?? null,
    skill_id: entry.skillId ?? null,
    mission_id: entry.missionId ?? null,
    action_type: entry.actionType,
    event_type: entry.eventType ?? null,
    summary: entry.summary,
    autonomy_level: entry.autonomyLevel,
    requires_confirmation: entry.requiresConfirmation,
    payload: entry.payload as CanonicalJson,
    metadata: entry.metadata as CanonicalJson,
    created_at: entry.createdAt,
    prev_hash: entry.prevHash ?? null,
    entry_hash: entry.entryHash,
    hmac: entry.hmac ?? null,
    canonical_version: entry.canonicalVersion,
  };
}

function localSealedChain(workspaceId: string): LedgerChainEntry[] {
  return listLocalActionLedgerEntries()
    .filter((entry) => entry.workspaceId === workspaceId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map(entryToChainEntry)
    .filter((entry): entry is LedgerChainEntry => entry !== null);
}

async function supabaseSealedChain(workspaceId: string): Promise<LedgerChainEntry[] | null> {
  const supabase = createOptionalSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("action_ledger")
    .select(
      "id, user_id, workspace_id, agent_id, skill_id, mission_id, action_type, event_type, summary, autonomy_level, requires_confirmation, payload, metadata, created_at, prev_hash, entry_hash, hmac, canonical_version",
    )
    .eq("workspace_id", workspaceId)
    .not("entry_hash", "is", null)
    .order("created_at", { ascending: true });

  if (error) {
    // Schema without Phase 1 columns, or RLS/permission gap — treat as unavailable.
    throw new Error(`Failed to load sealed ledger chain: ${error.message}`);
  }

  return (data ?? [])
    .filter((row) => typeof row.entry_hash === "string" && row.entry_hash.length > 0)
    .map((row) => ({
      id: row.id,
      workspace_id: row.workspace_id,
      user_id: row.user_id,
      agent_id: row.agent_id,
      skill_id: row.skill_id,
      mission_id: row.mission_id,
      action_type: row.action_type,
      event_type: row.event_type,
      summary: row.summary,
      autonomy_level: row.autonomy_level,
      requires_confirmation: row.requires_confirmation,
      payload: row.payload as CanonicalJson,
      metadata: row.metadata as CanonicalJson,
      created_at: row.created_at,
      prev_hash: row.prev_hash ?? null,
      entry_hash: row.entry_hash as string,
      hmac: row.hmac ?? null,
      canonical_version: row.canonical_version ?? undefined,
    }));
}

/**
 * Audit the sealed hash-chain for a workspace. HMAC is checked only when
 * LEDGER_HMAC_KEY is present in the server environment; the key is never
 * returned in the result.
 */
export async function auditWorkspaceHashChain(input: {
  workspaceId: string;
}): Promise<WorkspaceHashChainAudit> {
  const writeEnabled = isHashChainWriteEnabled();
  const hmacKey = getLedgerHmacKey();

  let source: WorkspaceHashChainAudit["source"] = "unavailable";
  let chain: LedgerChainEntry[] = [];

  try {
    const fromSupabase = await supabaseSealedChain(input.workspaceId);
    if (fromSupabase) {
      source = "supabase";
      chain = fromSupabase;
    } else if (isLocalPersistenceFallbackAllowed()) {
      source = "local";
      chain = localSealedChain(input.workspaceId);
    }
  } catch {
    if (isLocalPersistenceFallbackAllowed()) {
      source = "local";
      chain = localSealedChain(input.workspaceId);
    } else {
      source = "unavailable";
      chain = [];
    }
  }

  const report = auditChain(chain, hmacKey ? { hmacKey } : {});
  const tipHash = chain.length > 0 ? chain[chain.length - 1]!.entry_hash : null;

  return {
    workspaceId: input.workspaceId,
    writeEnabled,
    source,
    sealedCount: chain.length,
    tipHashPreview: previewHash(tipHash),
    report,
  };
}
