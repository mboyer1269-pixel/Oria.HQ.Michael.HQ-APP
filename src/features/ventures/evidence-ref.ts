// src/features/ventures/evidence-ref.ts
//
// Typed, trust-classified revenue evidence for the Ventures domain.
//
// This module hardens "what counts as proof" without touching scoring,
// the ROI Arena, the work-order layer, or any orchestration. It is the
// anti-gaming foundation: a cash claim is only as strong as the verifiable
// evidence behind it, and only real financial proof (a verified Stripe charge
// or a verified signed LOI) can back realized cash.
//
// Dependency-free and pure: no Supabase, no database, no network, no UI,
// no scoring, no persistence, no runtime execution. Validation follows the
// hand-rolled { valid, errors } style of agent-revenue-outcome.ts — the
// adjacent Ventures modules do not use Zod, so neither does this one.

// ---------------------------------------------------------------------------
// SECTION A — Evidence kinds
// ---------------------------------------------------------------------------

export type EvidenceKind =
  | "stripe_charge"
  | "signed_loi"
  | "email_reply"
  | "analytics_event"
  | "screenshot"
  | "manual_note"
  | "self_reported";

export const EVIDENCE_KINDS: readonly EvidenceKind[] = [
  "stripe_charge",
  "signed_loi",
  "email_reply",
  "analytics_event",
  "screenshot",
  "manual_note",
  "self_reported",
];

// Only these kinds, when verified, can back realized cash. manual_note and
// self_reported can never prove cash on their own, by design.
export const VERIFIED_FINANCIAL_KINDS: readonly EvidenceKind[] = [
  "stripe_charge",
  "signed_loi",
];

// Kinds that are always low trust regardless of the isVerified flag — a note or
// a self-report is a claim, not a confirmation.
const ALWAYS_LOW_TRUST_KINDS: readonly EvidenceKind[] = [
  "manual_note",
  "self_reported",
];

// ---------------------------------------------------------------------------
// SECTION B — Trust levels
// ---------------------------------------------------------------------------

export type EvidenceTrustLevel = "none" | "low" | "medium" | "high" | "strongest";

const TRUST_RANK: Record<EvidenceTrustLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  strongest: 4,
};

// ---------------------------------------------------------------------------
// SECTION C — The EvidenceRef type
// ---------------------------------------------------------------------------

export type EvidenceRef = {
  kind: EvidenceKind;
  referenceId: string;
  isVerified: boolean;
  source: string;
  capturedAt: string; // ISO date string
  summary: string;
};

// ---------------------------------------------------------------------------
// SECTION D — Constants
// ---------------------------------------------------------------------------

// A non-empty summary shorter than this is structurally valid but flagged vague.
export const EVIDENCE_MIN_SUMMARY_LENGTH = 10;

// Unverified evidence keeps only half of the confidence a verified item carries.
export const UNVERIFIED_CONFIDENCE_FACTOR = 0.5;

// Legacy string[] evidence has no timestamp or source; these mark the gap
// deterministically (no clock reads, so adapter output stays reproducible).
export const LEGACY_EVIDENCE_SOURCE = "legacy";
export const LEGACY_EVIDENCE_CAPTURED_AT = "1970-01-01T00:00:00.000Z";

// ---------------------------------------------------------------------------
// SECTION E — Validation
// ---------------------------------------------------------------------------

export type EvidenceRefValidation = {
  valid: boolean;
  errors: string[];
};

export function validateEvidenceRef(ref: EvidenceRef): EvidenceRefValidation {
  const errors: string[] = [];

  if (!EVIDENCE_KINDS.includes(ref.kind)) {
    errors.push("kind must be a known evidence kind");
  }
  if (typeof ref.referenceId !== "string" || ref.referenceId.trim() === "") {
    errors.push("referenceId must be non-empty");
  }
  if (typeof ref.isVerified !== "boolean") {
    errors.push("isVerified must be a boolean");
  }
  if (typeof ref.source !== "string" || ref.source.trim() === "") {
    errors.push("source must be non-empty");
  }
  if (typeof ref.summary !== "string" || ref.summary.trim() === "") {
    errors.push("summary must be non-empty");
  } else if (ref.summary.trim().length < EVIDENCE_MIN_SUMMARY_LENGTH) {
    errors.push(
      `summary is too vague (min ${EVIDENCE_MIN_SUMMARY_LENGTH} characters)`,
    );
  }
  if (typeof ref.capturedAt !== "string" || isNaN(+new Date(ref.capturedAt))) {
    errors.push("capturedAt must be a valid ISO date string");
  }

  return { valid: errors.length === 0, errors };
}

// A non-empty-but-thin summary. Distinct from the empty-summary error so callers
// can warn on vague proof without rejecting it outright.
export function isVagueEvidence(ref: EvidenceRef): boolean {
  const trimmed = (ref.summary ?? "").trim();
  return trimmed.length > 0 && trimmed.length < EVIDENCE_MIN_SUMMARY_LENGTH;
}

// ---------------------------------------------------------------------------
// SECTION F — Trust classification
// ---------------------------------------------------------------------------

export function classifyEvidenceTrust(ref: EvidenceRef): EvidenceTrustLevel {
  // Notes and self-reports are claims — always low trust.
  if (ALWAYS_LOW_TRUST_KINDS.includes(ref.kind)) {
    return "low";
  }
  // An unverified claim, whatever its kind, is only low trust — nothing confirms it.
  if (!ref.isVerified) {
    return "low";
  }
  switch (ref.kind) {
    case "stripe_charge":
      return "strongest";
    case "signed_loi":
      return "high";
    case "email_reply":
      return "high";
    case "analytics_event":
      return "medium";
    case "screenshot":
      return "medium";
    default:
      return "low";
  }
}

// Highest trust across a collection; "none" when empty.
export function classifyEvidenceCollectionTrust(
  refs: EvidenceRef[],
): EvidenceTrustLevel {
  let best: EvidenceTrustLevel = "none";
  for (const ref of refs) {
    const level = classifyEvidenceTrust(ref);
    if (TRUST_RANK[level] > TRUST_RANK[best]) {
      best = level;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// SECTION G — Financial proof
// ---------------------------------------------------------------------------

export function isVerifiedFinancialEvidence(ref: EvidenceRef): boolean {
  return ref.isVerified === true && VERIFIED_FINANCIAL_KINDS.includes(ref.kind);
}

export function hasVerifiedFinancialEvidence(refs: EvidenceRef[]): boolean {
  return refs.some(isVerifiedFinancialEvidence);
}

// Realized cash must be backed by at least one verified financial proof.
// amountCents <= 0 is always valid (nothing to prove).
export function validateCashEvidence(
  amountCents: number,
  refs: EvidenceRef[],
): EvidenceRefValidation {
  const errors: string[] = [];
  if (amountCents > 0 && !hasVerifiedFinancialEvidence(refs)) {
    errors.push(
      "cashGenerated.amountCents > 0 requires at least one verified financial evidence " +
        "(stripe_charge or signed_loi)",
    );
  }
  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// SECTION H — Confidence reduction
// ---------------------------------------------------------------------------

// Reduce a base confidence/score for a single evidence item: unverified items
// and always-low-trust kinds keep only UNVERIFIED_CONFIDENCE_FACTOR of it.
// Deterministic — pure arithmetic, no clock or randomness.
export function applyEvidenceConfidence(
  baseScore: number,
  ref: EvidenceRef,
): number {
  let factor = ref.isVerified ? 1 : UNVERIFIED_CONFIDENCE_FACTOR;
  if (ALWAYS_LOW_TRUST_KINDS.includes(ref.kind)) {
    factor = Math.min(factor, UNVERIFIED_CONFIDENCE_FACTOR);
  }
  return Math.round(baseScore * factor);
}

// ---------------------------------------------------------------------------
// SECTION I — Legacy adapter
// ---------------------------------------------------------------------------

// Convert a single legacy evidence string into a typed ref. Deterministic:
// referenceId is index-based and capturedAt is a fixed sentinel (no clock read).
function legacyStringToRef(raw: string, index: number): EvidenceRef {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return {
    kind: "self_reported",
    referenceId: `legacy:${index}`,
    isVerified: false,
    source: LEGACY_EVIDENCE_SOURCE,
    capturedAt: LEGACY_EVIDENCE_CAPTURED_AT,
    summary: trimmed.length > 0 ? trimmed : "legacy evidence (no detail provided)",
  };
}

// Adapt legacy string[] evidence into typed refs. Each string becomes a
// low-trust self_reported, unverified item tagged source="legacy".
export function fromLegacyStringEvidence(strings: string[]): EvidenceRef[] {
  return strings.map((raw, index) => legacyStringToRef(raw, index));
}

// Deep copy a single ref so callers cannot mutate stored evidence by reference.
export function copyEvidenceRef(ref: EvidenceRef): EvidenceRef {
  return {
    kind: ref.kind,
    referenceId: ref.referenceId,
    isVerified: ref.isVerified,
    source: ref.source,
    capturedAt: ref.capturedAt,
    summary: ref.summary,
  };
}

// Build/ingest boundary accepts either typed refs or legacy strings.
export type EvidenceRefInput = string | EvidenceRef;

// Normalize a mixed list to typed refs: strings adapt to self_reported (legacy),
// existing refs are deep-copied. Deterministic and pure — safe at any boundary.
export function normalizeEvidenceList(
  input: readonly EvidenceRefInput[],
): EvidenceRef[] {
  return input.map((item, index) =>
    typeof item === "string" ? legacyStringToRef(item, index) : copyEvidenceRef(item),
  );
}
