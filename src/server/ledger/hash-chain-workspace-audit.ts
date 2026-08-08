// src/server/ledger/hash-chain-workspace-audit.ts
//
// Server-side audit of a workspace action_ledger chain. Loads sealed rows in
// chronological order and runs auditChain() (entry_hash + linkage; HMAC when
// the key is available). Never exposes the HMAC key to callers.

import type { CalendarStorageMode } from "@/core/types";
import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import type { ActionLedgerRow, Json } from "@/server/db/types";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import { listLocalActionLedgerEntries } from "@/server/actions/action-ledger-repository";
import { auditChain, type ChainAuditReport } from "./hash-chain-audit.ts";
import type { CanonicalJson, CanonicalLedgerFields } from "./hash-chain-canonicalizer.ts";
import { getLedgerHmacKey } from "./hash-chain-hmac-key.ts";
import { isHashChainWriteEnabled } from "./hash-chain-write-flag.ts";
import type { LedgerChainEntry } from "./hash-chain-verifier.ts";

export type WorkspaceChainAuditStatus =
  | "inactive"
  | "partial"
  | "intact"
  | "broken"
  | "unavailable";

export type WorkspaceChainAuditView = {
  workspaceId: string;
  source: CalendarStorageMode | "unavailable";
  writeEnabled: boolean;
  hmacChecked: boolean;
  status: WorkspaceChainAuditStatus;
  sealedCount: number;
  unsealedCount: number;
  report: ChainAuditReport | null;
  /** Tip entry_hash preview (first 12 hex chars), or null. */
  tipPreview: string | null;
  /** Genesis entry id, or null. */
  genesisId: string | null;
};

function asCanonicalJson(value: Json): CanonicalJson {
  return value as CanonicalJson;
}

function rowToChainEntry(row: {
  id: string;
  workspace_id: string | null;
  user_id: string;
  agent_id: string | null;
  skill_id: string | null;
  mission_id: string | null;
  action_type: string;
  event_type: string | null;
  summary: string;
  autonomy_level: number;
  requires_confirmation: boolean;
  payload: Json;
  metadata: Json;
  created_at: string;
  prev_hash: string | null;
  entry_hash: string;
  hmac: string | null;
  canonical_version: number | null;
}): LedgerChainEntry {
  const fields: CanonicalLedgerFields = {
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
    payload: asCanonicalJson(row.payload),
    metadata: asCanonicalJson(row.metadata),
    created_at: row.created_at,
  };

  return {
    ...fields,
    prev_hash: row.prev_hash,
    entry_hash: row.entry_hash,
    hmac: row.hmac,
    canonical_version: row.canonical_version ?? undefined,
  };
}

function classify(
  sealedCount: number,
  unsealedCount: number,
  report: ChainAuditReport | null,
): WorkspaceChainAuditStatus {
  if (sealedCount === 0 && unsealedCount === 0) return "inactive";
  if (sealedCount === 0) return "inactive";
  if (unsealedCount > 0) return report?.ok === false ? "broken" : "partial";
  if (!report) return "unavailable";
  return report.ok ? "intact" : "broken";
}

function auditLocalWorkspace(workspaceId: string): WorkspaceChainAuditView {
  const rows = listLocalActionLedgerEntries()
    .filter((entry) => entry.workspaceId === workspaceId)
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const sealed = rows.filter((e) => typeof e.entryHash === "string" && e.entryHash.length > 0);
  const unsealedCount = rows.length - sealed.length;
  const writeEnabled = isHashChainWriteEnabled();
  const hmacKey = getLedgerHmacKey();

  if (sealed.length === 0) {
    return {
      workspaceId,
      source: "local",
      writeEnabled,
      hmacChecked: false,
      status: "inactive",
      sealedCount: 0,
      unsealedCount,
      report: null,
      tipPreview: null,
      genesisId: null,
    };
  }

  const entries = sealed.map((entry) =>
    rowToChainEntry({
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
      payload: entry.payload,
      metadata: entry.metadata,
      created_at: entry.createdAt,
      prev_hash: entry.prevHash ?? null,
      entry_hash: entry.entryHash!,
      hmac: entry.hmac ?? null,
      canonical_version: entry.canonicalVersion ?? null,
    }),
  );

  const report = auditChain(entries, hmacKey ? { hmacKey } : {});
  const tip = entries[entries.length - 1]!;

  return {
    workspaceId,
    source: "local",
    writeEnabled,
    hmacChecked: report.hmacChecked,
    status: classify(sealed.length, unsealedCount, report),
    sealedCount: sealed.length,
    unsealedCount,
    report,
    tipPreview: tip.entry_hash.slice(0, 12),
    genesisId: report.genesisId,
  };
}

async function auditSupabaseWorkspace(workspaceId: string): Promise<WorkspaceChainAuditView> {
  const supabase = createOptionalSupabaseAdminClient();
  if (!supabase) {
    return {
      workspaceId,
      source: "unavailable",
      writeEnabled: isHashChainWriteEnabled(),
      hmacChecked: false,
      status: "unavailable",
      sealedCount: 0,
      unsealedCount: 0,
      report: null,
      tipPreview: null,
      genesisId: null,
    };
  }

  const { data, error } = await supabase
    .from("action_ledger")
    .select(
      "id, workspace_id, user_id, agent_id, skill_id, mission_id, action_type, event_type, summary, autonomy_level, requires_confirmation, payload, metadata, created_at, prev_hash, entry_hash, hmac, canonical_version",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    throw new Error(`Failed to audit action ledger chain: ${error.message}`);
  }

  const rows = (data ?? []) as Array<
    ActionLedgerRow & {
      prev_hash: string | null;
      entry_hash: string | null;
      hmac: string | null;
      canonical_version: number | null;
    }
  >;

  const sealed = rows.filter((row) => typeof row.entry_hash === "string" && row.entry_hash.length > 0);
  const unsealedCount = rows.length - sealed.length;
  const writeEnabled = isHashChainWriteEnabled();
  const hmacKey = getLedgerHmacKey();

  if (sealed.length === 0) {
    return {
      workspaceId,
      source: "supabase",
      writeEnabled,
      hmacChecked: false,
      status: "inactive",
      sealedCount: 0,
      unsealedCount,
      report: null,
      tipPreview: null,
      genesisId: null,
    };
  }

  const entries = sealed.map((row) =>
    rowToChainEntry({
      ...row,
      prev_hash: row.prev_hash,
      entry_hash: row.entry_hash!,
      hmac: row.hmac,
      canonical_version: row.canonical_version,
    }),
  );

  const report = auditChain(entries, hmacKey ? { hmacKey } : {});
  const tip = entries[entries.length - 1]!;

  return {
    workspaceId,
    source: "supabase",
    writeEnabled,
    hmacChecked: report.hmacChecked,
    status: classify(sealed.length, unsealedCount, report),
    sealedCount: sealed.length,
    unsealedCount,
    report,
    tipPreview: tip.entry_hash.slice(0, 12),
    genesisId: report.genesisId,
  };
}

/**
 * Audit the hash-chain for a workspace. Prefer Supabase when configured;
 * otherwise use the in-memory local ledger (dev only).
 */
export async function auditWorkspaceLedgerChain(
  workspaceId: string,
): Promise<WorkspaceChainAuditView> {
  const supabase = createOptionalSupabaseAdminClient();
  if (supabase) {
    return auditSupabaseWorkspace(workspaceId);
  }

  if (!isLocalPersistenceFallbackAllowed()) {
    return {
      workspaceId,
      source: "unavailable",
      writeEnabled: isHashChainWriteEnabled(),
      hmacChecked: false,
      status: "unavailable",
      sealedCount: 0,
      unsealedCount: 0,
      report: null,
      tipPreview: null,
      genesisId: null,
    };
  }

  return auditLocalWorkspace(workspaceId);
}
