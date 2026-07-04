// src/server/joris/memex-memory-evidence-summary.ts
//
// Minimal display-safe summary derived from a Memory Evidence Pack.
// Pure helper: no I/O, no transport, no Memex calls.

import type { MemoryEvidencePack } from "@/server/agents/evidence/memory-evidence-pack";
import type { MemexContextEnrichmentTrace } from "@/server/joris/memex-context-source";

export type MemexMemoryEvidenceConfidence = "none" | "low" | "medium" | "high";

export type MemexMemoryEvidenceSummary = {
  status: MemexContextEnrichmentTrace["status"];
  sourceCount: number;
  confidence: MemexMemoryEvidenceConfidence;
  freshness: {
    oldestIso: string | null;
    newestIso: string | null;
    ageDays: number | null;
  };
  limitations: readonly string[];
  fallbackReasons: readonly string[];
};

const BASE_LIMITATIONS: readonly string[] = [
  "Memex is advisory context only; Oria keeps model, tool, Sentinelle, and ledger authority.",
  "Read-only v1: no write, proposal, consolidation, delete, or raw vault file access.",
  "The summary reflects the injected evidence pack only; absent or rejected memories are not inferred.",
];

function confidenceFromPack(pack: MemoryEvidencePack | null): MemexMemoryEvidenceConfidence {
  if (!pack) return "none";
  if (pack.trustLevel === "verified") return "high";
  if (pack.trustLevel === "active") return "medium";
  return "low";
}

function ageDays(newestIso: string, nowIso: string): number | null {
  const newest = Date.parse(newestIso);
  const now = Date.parse(nowIso);
  if (Number.isNaN(newest) || Number.isNaN(now)) return null;
  return Math.floor(Math.max(0, now - newest) / 86_400_000);
}

export function summarizeMemexMemoryEvidence(input: {
  evidencePack: MemoryEvidencePack | null;
  trace: MemexContextEnrichmentTrace;
  nowIso: string;
}): MemexMemoryEvidenceSummary {
  const pack = input.evidencePack;
  const limitations = [...BASE_LIMITATIONS];

  if (!pack) {
    limitations.push("No Memex memory was injected; Joris must rely on existing memory rails.");
  }
  if (pack && pack.redactionsApplied > 0) {
    limitations.push("Sensitive-looking values were redacted before reaching Joris.");
  }
  if (pack && pack.conflicts.length > 0) {
    limitations.push("Conflicting memories were marked and must not be merged silently.");
  }

  return {
    status: input.trace.status,
    sourceCount: pack?.provenance.length ?? 0,
    confidence: confidenceFromPack(pack),
    freshness: {
      oldestIso: pack?.freshness.oldestIso ?? null,
      newestIso: pack?.freshness.newestIso ?? null,
      ageDays: pack ? ageDays(pack.freshness.newestIso, input.nowIso) : null,
    },
    limitations,
    fallbackReasons: input.trace.status === "enriched" ? [] : [input.trace.reason],
  };
}

export function formatMemexMemoryEvidenceSummaryForContext(
  summary: MemexMemoryEvidenceSummary,
): string {
  const freshness = summary.freshness.newestIso
    ? `${summary.freshness.oldestIso ?? "unknown"} -> ${summary.freshness.newestIso} (${summary.freshness.ageDays ?? "unknown"} day(s) old)`
    : "unavailable";
  const fallbackReasons = summary.fallbackReasons.length > 0 ? summary.fallbackReasons.join("; ") : "none";

  return [
    "--- Memex Memory Evidence Summary ---",
    `sourceCount: ${summary.sourceCount}`,
    `confidence: ${summary.confidence}`,
    `freshness: ${freshness}`,
    `limitations: ${summary.limitations.join(" | ")}`,
    `fallbackReasons: ${fallbackReasons}`,
    "---",
  ].join("\n");
}

/** Structured log event name for Memex evidence observability (read-only metadata). */
export const MEMEX_EVIDENCE_OBSERVABILITY_LOG_EVENT = "joris.memex.summary" as const;

/** Upper bound for the formatted summary block — keeps agent context compact. */
export const MEMEX_EVIDENCE_SUMMARY_BLOCK_MAX_CHARS = 1200;

export type MemexMemoryEvidenceObservabilityPayload = {
  status: MemexMemoryEvidenceSummary["status"];
  sourceCount: number;
  confidence: MemexMemoryEvidenceConfidence;
  ageDays: number | null;
  fallbackReasonCount: number;
  evidencePackValid: boolean;
};

/**
 * Log-safe observability payload — counts and labels only.
 * Never includes raw memory content, secrets, tool names from packs, or fallback reason text.
 */
export function buildMemexMemoryEvidenceObservabilityPayload(input: {
  summary: MemexMemoryEvidenceSummary;
  evidencePackValid?: boolean;
}): MemexMemoryEvidenceObservabilityPayload {
  return {
    status: input.summary.status,
    sourceCount: input.summary.sourceCount,
    confidence: input.summary.confidence,
    ageDays: input.summary.freshness.ageDays,
    fallbackReasonCount: input.summary.fallbackReasons.length,
    evidencePackValid: input.evidencePackValid ?? false,
  };
}

export function isMemexEvidenceSummaryBlockCompact(block: string): boolean {
  return block.length <= MEMEX_EVIDENCE_SUMMARY_BLOCK_MAX_CHARS;
}

const PREVIEW_LIMITATION_LABELS = ["advisory-only", "read-only-v1", "oria-authority"] as const;

const PREVIEW_MAX_FALLBACK_REASON_CHARS = 120;

function truncatePreviewReason(reason: string): string {
  return reason.length <= PREVIEW_MAX_FALLBACK_REASON_CHARS
    ? reason
    : `${reason.slice(0, PREVIEW_MAX_FALLBACK_REASON_CHARS - 1)}…`;
}

/**
 * Short, human-readable preview for selected Joris intents.
 * Metadata only — never includes raw memory text, provenance paths, or secrets.
 */
export function buildMemexMemoryEvidencePreview(summary: MemexMemoryEvidenceSummary): string {
  const freshnessLabel =
    summary.freshness.ageDays === null ? "unavailable" : `${summary.freshness.ageDays} day(s) old`;
  const limitationLabels = PREVIEW_LIMITATION_LABELS.slice(
    0,
    Math.min(PREVIEW_LIMITATION_LABELS.length, summary.limitations.length),
  );
  const fallbackShort =
    summary.fallbackReasons.length === 0
      ? null
      : truncatePreviewReason(summary.fallbackReasons[0]!);

  const lines = [
    "--- Memex Evidence Preview (read-only · advisory · no execution authorized) ---",
    `status: ${summary.status}`,
    `sourceCount: ${summary.sourceCount}`,
    `confidence: ${summary.confidence}`,
    `freshnessAgeDays: ${freshnessLabel}`,
    `limitationsCount: ${summary.limitations.length}`,
  ];

  if (limitationLabels.length > 0) {
    lines.push(`limitationLabels: ${limitationLabels.join(", ")}`);
  }

  lines.push(
    fallbackShort
      ? `fallbackReasons: ${summary.fallbackReasons.length} (${fallbackShort})`
      : "fallbackReasons: none",
  );
  lines.push("---");

  return lines.join("\n");
}

export function shouldAttachMemexEvidencePreview(
  intent: string,
  memoryContext: string | null,
): boolean {
  return memoryContext !== null && (intent === "board.consult" || intent === "brief.generate");
}

export function withMemexEvidencePreview(
  summaryText: string,
  input: {
    intent: string;
    memoryContext: string | null;
    evidenceSummary: MemexMemoryEvidenceSummary;
  },
): string {
  if (!shouldAttachMemexEvidencePreview(input.intent, input.memoryContext)) {
    return summaryText;
  }
  return `${summaryText}\n\n${buildMemexMemoryEvidencePreview(input.evidenceSummary)}`;
}
