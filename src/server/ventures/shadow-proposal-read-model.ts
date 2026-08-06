// src/server/ventures/shadow-proposal-read-model.ts
//
// V7 Phase 1 step 4a — retrieving a shadow proposal so the owner's real
// decision can be measured against it.
//
// ---------------------------------------------------------------------------
// Two keys, two jobs — they are not the same key
// ---------------------------------------------------------------------------
//
//   RETRIEVAL is by ventureId + recency. When the owner scores a venture the
//   hook holds a ventureId, not a proposalId — so that is what it searches by.
//
//   CORRELATION is by proposalId. It is carried into both the proposal event
//   and the outcome event, and it is what proves an outcome measured *that*
//   proposal once one has been retrieved. It is never searched by.
//
// Conflating them would produce an index nobody queries and a pairing nobody
// can trust.
//
// ---------------------------------------------------------------------------
// Why the query is bounded rather than indexed
// ---------------------------------------------------------------------------
//
// Measured against the live database, the natural query plans as:
//
//   Limit → Sort (created_at DESC) → Index Scan on action_ledger_workspace_id_idx
//            Filter: action_type = … AND (metadata ->> 'ventureId') = …
//
// In a single-owner deployment `workspace_id` has one value, so that index scan
// reads essentially the whole table, filters row by row, then sorts. No index
// covers action_type, created_at, or any jsonb path.
//
// The prepared index that fixes it is a PARTIAL EXPRESSION index — not a GIN on
// the whole metadata column, which would index every key of every ledger row,
// slow every ledger write, and be useless for all but this one query:
//
//   create index action_ledger_shadow_proposal_lookup_idx
//     on public.action_ledger ((metadata->>'ventureId'), created_at desc)
//     where action_type = 'venture.score.shadow_proposal';
//
// It is NOT applied. Applying it is a production write behind an explicit GO,
// and nothing justifies it yet — the ledger holds a single row today. So this
// read model is written to be CORRECT WITHOUT IT and merely faster with it:
// the lookup is bounded by a time window and a row cap, which keeps the scan
// small regardless of how long the ledger grows. Adding the index later changes
// no contract here.
//
// Read-only. No writes, no execution, never throws toward the caller.

import "server-only";

import type { WorkspaceContext } from "@/core/workspace-context";
import type { VentureSubScores } from "@/features/ventures/venture-scoring";
import { SCORE_DIMENSIONS } from "@/features/ventures/venture-scoring";
import type {
  EvidenceSource,
  ScoreEvidence,
  VentureScoreProposal,
} from "@/features/ventures/venture-score-proposal";
import { buildVentureScoreProposal } from "@/features/ventures/venture-score-proposal";
import { listActionLedgerForWorkspace } from "@/server/actions/action-ledger-read";
import type { ActionLedgerEntry } from "@/server/actions/action-ledger-repository";
import { SHADOW_PROPOSAL_ACTION_TYPE } from "./venture-score-shadow-runner";

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

/**
 * How far back a proposal is considered pairable.
 *
 * A proposal much older than the decision is not a measurement of that
 * decision — the venture will have changed underneath it. The window is a
 * correctness bound first and a performance bound second.
 */
export const SHADOW_PROPOSAL_MAX_AGE_DAYS = 30;

/** Rows pulled from the ledger before filtering. Bounds the scan. */
export const SHADOW_PROPOSAL_SCAN_LIMIT = 500;

// ---------------------------------------------------------------------------
// Lossy reconstruction
// ---------------------------------------------------------------------------

/**
 * What could not survive the round trip through the ledger.
 *
 * Rebuilding a proposal from ledger metadata is a LOSSY conversion and is
 * treated as one rather than cast into shape: rationales were truncated to 240
 * characters on the way in, so a rebuilt proposal is fit for measuring
 * divergence — which reads values, not prose — and unfit for anything that
 * needs the agent's original wording.
 */
export type ReconstructionLoss = {
  /** Rationale text was truncated when written and cannot be recovered. */
  rationalesTruncated: true;
};

export type ReconstructedProposal = {
  proposal: VentureScoreProposal;
  loss: ReconstructionLoss;
  /** When the proposal was written to the ledger. */
  recordedAt: string;
};

export type ReconstructionFailure =
  | "not_found"
  | "malformed_metadata"
  | "dimension_mismatch"
  | "rejected_by_contract";

export type ShadowProposalLookup =
  | { status: "found"; result: ReconstructedProposal }
  | { status: "absent"; reason: ReconstructionFailure };

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Restores a source from its flattened ledger form. */
function readStoredSource(kind: unknown, source: unknown): EvidenceSource {
  const text = typeof source === "string" ? source : "";
  if (kind === "external" && text.length > 0) return { kind: "external", url: text };
  if (kind === "internal" && text.length > 0) return { kind: "internal", ref: text };
  return { kind: "none" };
}

/**
 * Rebuilds a proposal from one ledger entry's metadata.
 *
 * Refuses rather than repairs. A partially rebuilt proposal would produce a
 * divergence number that looks authoritative while comparing against values
 * that were never proposed — worse than reporting no measurement at all.
 */
export function reconstructProposalFromLedger(
  entry: Pick<ActionLedgerEntry, "metadata" | "createdAt">,
): ShadowProposalLookup {
  const metadata = readRecord(entry.metadata);
  if (!metadata) return { status: "absent", reason: "malformed_metadata" };

  const proposalId = typeof metadata.proposalId === "string" ? metadata.proposalId : "";
  const ventureId = typeof metadata.ventureId === "string" ? metadata.ventureId : "";
  const proposedBy = typeof metadata.proposedBy === "string" ? metadata.proposedBy : "";
  const rows = Array.isArray(metadata.dimensions) ? metadata.dimensions : null;

  if (!proposalId || !ventureId || !proposedBy || !rows) {
    return { status: "absent", reason: "malformed_metadata" };
  }

  const byDimension = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const record = readRecord(row);
    if (record && typeof record.dimension === "string") {
      byDimension.set(record.dimension, record);
    }
  }

  const evidence: ScoreEvidence[] = [];
  for (const dimension of SCORE_DIMENSIONS) {
    const row = byDimension.get(dimension.key);
    if (!row || typeof row.value !== "number") {
      return { status: "absent", reason: "dimension_mismatch" };
    }
    evidence.push({
      dimension: dimension.key as keyof VentureSubScores,
      value: row.value,
      // Truncated at write time. Preserved as stored so the loss is visible in
      // the rebuilt object rather than silently invented.
      rationale: typeof row.rationale === "string" && row.rationale.length > 0 ? row.rationale : "—",
      source: readStoredSource(row.sourceKind, row.source),
    });
  }

  const built = buildVentureScoreProposal({
    proposalId,
    ventureId,
    workspaceId: typeof metadata.workspaceId === "string" ? metadata.workspaceId : ventureId,
    proposedBy,
    proposedAt: entry.createdAt,
    evidence,
  });

  if (built.status === "rejected") {
    return { status: "absent", reason: "rejected_by_contract" };
  }

  return {
    status: "found",
    result: {
      proposal: built.proposal,
      loss: { rationalesTruncated: true },
      recordedAt: entry.createdAt,
    },
  };
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export type ShadowProposalReadDeps = {
  listLedger?: typeof listActionLedgerForWorkspace;
  now?: () => Date;
  maxAgeDays?: number;
  scanLimit?: number;
};

/**
 * Finds the most recent pairable shadow proposal for a venture.
 *
 * Bounded on both axes — a row cap and an age window — so the cost does not
 * grow with total ledger history. Returns `absent` rather than throwing: the
 * caller is the owner's live scoring path, and a missing measurement must never
 * disturb the decision being recorded.
 */
export async function findLatestShadowProposal(
  ctx: WorkspaceContext,
  ventureId: string,
  deps: ShadowProposalReadDeps = {},
): Promise<ShadowProposalLookup> {
  const listLedger = deps.listLedger ?? listActionLedgerForWorkspace;
  const now = (deps.now ?? (() => new Date()))();
  const maxAgeDays = deps.maxAgeDays ?? SHADOW_PROPOSAL_MAX_AGE_DAYS;
  const cutoff = new Date(now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000);

  let entries: readonly ActionLedgerEntry[];
  try {
    const result = await listLedger({
      workspaceId: ctx.workspace.id,
      limit: deps.scanLimit ?? SHADOW_PROPOSAL_SCAN_LIMIT,
    });
    entries = result.entries;
  } catch {
    return { status: "absent", reason: "not_found" };
  }

  // The ledger returns most-recent-first, so the first match is the latest.
  for (const entry of entries) {
    if (entry.actionType !== SHADOW_PROPOSAL_ACTION_TYPE) continue;
    if (new Date(entry.createdAt) < cutoff) break;

    const metadata = readRecord(entry.metadata);
    if (!metadata || metadata.ventureId !== ventureId) continue;

    return reconstructProposalFromLedger(entry);
  }

  return { status: "absent", reason: "not_found" };
}
