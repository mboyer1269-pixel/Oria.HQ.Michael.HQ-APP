// src/features/ventures/venture-score-proposal.ts
//
// Pure contract for an agent-proposed venture score (V7 Phase 1 — shadow mode).
//
// A proposal is a RECOMMENDATION ONLY. It never mutates a venture's lifecycle,
// never advances a status, and authorizes nothing. The owner scores normally;
// the system records both and measures the divergence between them. Autonomy is
// earned from that measured agreement, not granted up front.
//
// Two independent judgements, deliberately kept apart:
//
//   - The SCORE answers "is this promising?" — a weighted average over the 11
//     existing dimensions, reusing venture-scoring.ts unchanged.
//   - The EVIDENCE GATES answer "do we have the proof?" — boolean presence
//     checks. A high score built on nothing must not pass.
//
// Collapsing the two would let a confident-sounding proposal with no sources
// clear the bar, which is the failure mode this module exists to prevent.
//
// Pure: no I/O, no persistence, no network, no clock of its own.

import type { VentureSubScores } from "./venture-scoring";
import {
  MAX_SUB_SCORE,
  MIN_SUB_SCORE,
  SCORE_DIMENSIONS,
  buildVentureScore,
  isValidSubScores,
} from "./venture-scoring";
import type { VentureScore } from "@/core/types";

/** Where a proposed sub-score came from. `none` is an explicit admission. */
export type EvidenceSource =
  | { kind: "none" }
  | { kind: "internal"; ref: string }
  | { kind: "external"; url: string };

/** One proposed dimension: the value, the reasoning, and the source behind it. */
export type ScoreEvidence = {
  dimension: keyof VentureSubScores;
  value: number;
  rationale: string;
  source: EvidenceSource;
};

export type EvidenceGate = {
  id: string;
  label: string;
  passed: boolean;
  /** Present only when the gate failed: what is missing, in one phrase. */
  missing?: string;
};

export type EvidenceGateResult = {
  gates: EvidenceGate[];
  /** True only when every gate passed. Never a partial or weighted verdict. */
  allPassed: boolean;
};

export type VentureScoreProposal = {
  /**
   * Identity of this proposal, owned by the domain and generated before any
   * persistence touches it.
   *
   * Deliberately NOT the ledger row id: that would couple venture evaluation to
   * the audit infrastructure, make the identity unknowable until a write
   * returned, and break the pairing if events were ever replayed or migrated.
   * The ledger observes this id; it does not issue it.
   *
   * It is a CORRELATION key, never a lookup key — retrieval goes by venture and
   * recency, and this value is what proves the outcome measured *this* proposal
   * once retrieved.
   */
  proposalId: string;
  ventureId: string;
  workspaceId: string;
  /** Identity that produced the proposal. */
  proposedBy: string;
  proposedAt: string;
  /** Exactly the 11 dimensions, in the canonical order. */
  evidence: ScoreEvidence[];
  /** Derived from evidence — never supplied by the proposer. */
  score: VentureScore;
  gates: EvidenceGateResult;
  /** Structural invariant: a proposal can never authorize execution. */
  authorizesExecution: false;
};

export type ProposalRejectionCode =
  | "wrong_dimension_count"
  | "duplicate_dimension"
  | "unknown_dimension"
  | "invalid_value"
  | "missing_rationale"
  | "invalid_source"
  | "invalid_timestamp"
  | "missing_identity";

export type BuildProposalResult =
  | { status: "built"; proposal: VentureScoreProposal }
  | { status: "rejected"; code: ProposalRejectionCode; detail: string };

// ---------------------------------------------------------------------------
// Evidence gates
// ---------------------------------------------------------------------------

/**
 * Dimensions that may not rest on an unsourced judgement. These are the ones a
 * wrong answer is most expensive on: whether money is there, whether the pain is
 * real, and what finding out will cost.
 */
const EVIDENCE_CRITICAL_DIMENSIONS: readonly (keyof VentureSubScores)[] = [
  "revenuePotential",
  "marketPain",
  "costToValidate",
];

/** Minimum distinct external sources across the whole proposal. */
export const MIN_DISTINCT_EXTERNAL_SOURCES = 3;

function isSourced(source: EvidenceSource): boolean {
  return isPlainSource(source) && source.kind !== "none";
}

function isPlainSource(source: unknown): source is EvidenceSource {
  return typeof source === "object" && source !== null && "kind" in source;
}

/**
 * Reduces a url to the page it identifies, so cosmetic variants collapse to one
 * key: lowercased host, no fragment, no trailing slash.
 *
 * The distinct-source gate is only meaningful if `https://example.com`,
 * `https://example.com/` and `https://example.com/#top` count once. Without
 * this, citing a single page three ways would satisfy a gate whose purpose is
 * to require three independent sources.
 *
 * The query string is preserved: `?id=1` and `?id=2` are genuinely different
 * pages on many sites.
 */
export function canonicalizeSourceUrl(raw: string): string {
  const fallback = raw.trim().toLowerCase();
  try {
    const parsed = new URL(raw);
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${parsed.search}`;
  } catch {
    return fallback;
  }
}

function externalUrls(evidence: readonly ScoreEvidence[]): Set<string> {
  const urls = new Set<string>();
  for (const item of evidence) {
    const source = item.source;
    if (isPlainSource(source) && source.kind === "external" && typeof source.url === "string") {
      urls.add(canonicalizeSourceUrl(source.url));
    }
  }
  return urls;
}

/**
 * Evaluates the boolean evidence gates over a complete evidence set.
 *
 * Presence checks only — they never look at how high a score is. All-green here
 * still does not mean the case is strong; it means the case is *documented*
 * enough to be judged. The judgement itself stays with the owner.
 */
export function evaluateEvidenceGates(evidence: readonly ScoreEvidence[]): EvidenceGateResult {
  const gates: EvidenceGate[] = [];

  const unreasoned = evidence.filter(
    (item) => typeof item.rationale !== "string" || item.rationale.trim().length === 0,
  );
  gates.push({
    id: "every_dimension_reasoned",
    label: "Chaque dimension porte une justification",
    passed: unreasoned.length === 0,
    ...(unreasoned.length > 0
      ? { missing: `${unreasoned.length} dimension(s) sans justification` }
      : {}),
  });

  const unsourcedCritical = EVIDENCE_CRITICAL_DIMENSIONS.filter((dimension) => {
    const item = evidence.find((candidate) => candidate.dimension === dimension);
    return !item || !isSourced(item.source);
  });
  gates.push({
    id: "critical_dimensions_sourced",
    label: "Revenu, douleur marché et coût de validation sont sourcés",
    passed: unsourcedCritical.length === 0,
    ...(unsourcedCritical.length > 0
      ? { missing: `non sourcé : ${unsourcedCritical.join(", ")}` }
      : {}),
  });

  const distinctExternal = externalUrls(evidence).size;
  gates.push({
    id: "min_external_sources",
    label: `Au moins ${MIN_DISTINCT_EXTERNAL_SOURCES} sources externes distinctes`,
    passed: distinctExternal >= MIN_DISTINCT_EXTERNAL_SOURCES,
    ...(distinctExternal < MIN_DISTINCT_EXTERNAL_SOURCES
      ? { missing: `${distinctExternal}/${MIN_DISTINCT_EXTERNAL_SOURCES} sources externes` }
      : {}),
  });

  const unsourcedCount = evidence.filter((item) => !isSourced(item.source)).length;
  const majoritySourced = unsourcedCount * 2 < evidence.length;
  gates.push({
    id: "majority_sourced",
    label: "La majorité des dimensions sont sourcées",
    passed: majoritySourced,
    ...(majoritySourced
      ? {}
      : { missing: `${unsourcedCount}/${evidence.length} dimensions sans source` }),
  });

  return { gates, allPassed: gates.every((gate) => gate.passed) };
}

// ---------------------------------------------------------------------------
// Proposal construction
// ---------------------------------------------------------------------------

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validates a source without trusting its shape.
 *
 * Input reaches this module as parsed LLM JSON, so a field the type says is a
 * string may be absent or another type at runtime. Every access is guarded so a
 * malformed payload returns the documented `invalid_source` rejection instead of
 * throwing past the caller.
 */
function validateSource(source: EvidenceSource): string | null {
  if (!isPlainSource(source)) return "source must be an object with a kind";
  if (source.kind === "none") return null;

  if (source.kind === "internal") {
    if (typeof source.ref !== "string") return "internal source ref must be a string";
    return source.ref.trim().length > 0 ? null : "internal source has an empty ref";
  }

  if (source.kind === "external") {
    if (typeof source.url !== "string") return "external source url must be a string";
    return isValidUrl(source.url)
      ? null
      : `external source is not a valid http(s) url: ${source.url}`;
  }

  return "unknown source kind";
}

/** True for a string that parses as a real calendar instant. */
function isIsoTimestamp(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

/**
 * Builds a proposal from a raw evidence set, deriving the score rather than
 * trusting a supplied one.
 *
 * Rejects instead of repairing: a proposal that cannot be validated is not
 * silently downgraded to a partial one, because a partial proposal recorded as
 * complete would corrupt the divergence measurement this whole mode exists for.
 */
export function buildVentureScoreProposal(input: {
  /** Supplied by the caller — this module stays pure and mints no ids. */
  proposalId: string;
  ventureId: string;
  workspaceId: string;
  proposedBy: string;
  proposedAt: string;
  evidence: readonly ScoreEvidence[];
}): BuildProposalResult {
  for (const [field, value] of [
    ["proposalId", input.proposalId],
    ["ventureId", input.ventureId],
    ["workspaceId", input.workspaceId],
    ["proposedBy", input.proposedBy],
    ["proposedAt", input.proposedAt],
  ] as const) {
    if (typeof value !== "string" || value.trim().length === 0) {
      return { status: "rejected", code: "missing_identity", detail: `${field} is required` };
    }
  }

  // Adjacent venture and agent contracts store timestamps as ISO strings; a
  // proposal that carries an unparseable one would order incorrectly against
  // them and corrupt the divergence history it feeds.
  if (!isIsoTimestamp(input.proposedAt)) {
    return {
      status: "rejected",
      code: "invalid_timestamp",
      detail: `proposedAt is not a parseable timestamp: ${input.proposedAt}`,
    };
  }

  if (input.evidence.length !== SCORE_DIMENSIONS.length) {
    return {
      status: "rejected",
      code: "wrong_dimension_count",
      detail: `expected ${SCORE_DIMENSIONS.length} dimensions, received ${input.evidence.length}`,
    };
  }

  const known = new Set(SCORE_DIMENSIONS.map((dimension) => dimension.key));
  const seen = new Set<string>();
  const scores: Partial<VentureSubScores> = {};

  for (const item of input.evidence) {
    if (!known.has(item.dimension)) {
      return { status: "rejected", code: "unknown_dimension", detail: String(item.dimension) };
    }
    if (seen.has(item.dimension)) {
      return { status: "rejected", code: "duplicate_dimension", detail: item.dimension };
    }
    seen.add(item.dimension);

    if (
      typeof item.value !== "number" ||
      !Number.isFinite(item.value) ||
      item.value < MIN_SUB_SCORE ||
      item.value > MAX_SUB_SCORE
    ) {
      return {
        status: "rejected",
        code: "invalid_value",
        detail: `${item.dimension}: ${String(item.value)} is outside [${MIN_SUB_SCORE}, ${MAX_SUB_SCORE}]`,
      };
    }

    if (typeof item.rationale !== "string") {
      return { status: "rejected", code: "missing_rationale", detail: item.dimension };
    }

    const sourceError = validateSource(item.source);
    if (sourceError) {
      return { status: "rejected", code: "invalid_source", detail: `${item.dimension}: ${sourceError}` };
    }

    scores[item.dimension] = item.value;
  }

  if (!isValidSubScores(scores)) {
    return {
      status: "rejected",
      code: "invalid_value",
      detail: "the assembled sub-scores failed validation",
    };
  }

  const evidence = SCORE_DIMENSIONS.map(
    (dimension) => input.evidence.find((item) => item.dimension === dimension.key) as ScoreEvidence,
  );

  return {
    status: "built",
    proposal: {
      proposalId: input.proposalId,
      ventureId: input.ventureId,
      workspaceId: input.workspaceId,
      proposedBy: input.proposedBy,
      proposedAt: input.proposedAt,
      evidence,
      score: buildVentureScore(scores),
      gates: evaluateEvidenceGates(evidence),
      authorizesExecution: false,
    },
  };
}

// ---------------------------------------------------------------------------
// Divergence — the measurement shadow mode exists to produce
// ---------------------------------------------------------------------------

export type DimensionDivergence = {
  dimension: keyof VentureSubScores;
  proposed: number;
  actual: number;
  delta: number;
};

export type ProposalDivergence = {
  /** Mean absolute delta across the 11 dimensions, 0–10. */
  meanAbsoluteDelta: number;
  /** Dimensions the owner moved by more than the tolerance. */
  disagreements: DimensionDivergence[];
  /** Whether both landed on the same recommendation band. */
  recommendationAgreed: boolean;
  proposedRecommendation: VentureScore["recommendation"];
  actualRecommendation: VentureScore["recommendation"];
};

/** A dimension moved by more than this counts as a disagreement, not noise. */
export const DIVERGENCE_TOLERANCE = 1;

/**
 * Compares a proposal against the score the owner actually recorded.
 *
 * Reports the recommendation band separately from the numeric deltas: an agent
 * can be off by a point on several dimensions and still reach the right verdict,
 * and that is a materially better outcome than the reverse. Promotion decisions
 * should weigh the band agreement first.
 */
export function measureProposalDivergence(
  proposal: VentureScoreProposal,
  actual: VentureScore,
): ProposalDivergence {
  const disagreements: DimensionDivergence[] = [];
  let totalDelta = 0;

  for (const item of proposal.evidence) {
    const actualValue = actual[item.dimension];
    const delta = item.value - actualValue;
    totalDelta += Math.abs(delta);
    if (Math.abs(delta) > DIVERGENCE_TOLERANCE) {
      disagreements.push({
        dimension: item.dimension,
        proposed: item.value,
        actual: actualValue,
        delta,
      });
    }
  }

  return {
    meanAbsoluteDelta:
      Math.round((totalDelta / proposal.evidence.length + Number.EPSILON) * 100) / 100,
    disagreements,
    recommendationAgreed: proposal.score.recommendation === actual.recommendation,
    proposedRecommendation: proposal.score.recommendation,
    actualRecommendation: actual.recommendation,
  };
}
