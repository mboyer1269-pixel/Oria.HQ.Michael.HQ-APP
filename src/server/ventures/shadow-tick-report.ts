// src/server/ventures/shadow-tick-report.ts
//
// V7 Phase 1 step 4c-2 — batch selection and the tick report.
//
// Pure. No I/O, no clock of its own. The cron orchestrates; this decides what
// the batch is and what the run has to account for.
//
// The cap exists to bound cost: every proposal is a billed LLM call, and an
// unbounded batch would be an unbounded bill and a timeout. It applies AFTER
// deduplication — capping first would let ventures already proposed today
// consume the whole budget and starve the ones that still need scoring.
//
// Nothing is dropped silently. Ventures beyond the cap are counted as
// `deferred`, so a report always accounts for every candidate it saw. A silent
// truncation reads as "we covered everything" when it did not.

import type { VentureCard } from "@/core/types";

/** Ventures proposed per run. Every one is a billed LLM call. */
export const SHADOW_BATCH_CAP = 20;

export type BatchSelection = {
  /** Ventures to propose for, capped. */
  selected: VentureCard[];
  /** Candidates already proposed today. */
  deduped: string[];
  /** Candidates left for the next run because the cap was reached. */
  deferred: string[];
  /** Candidates seen before any filtering. */
  considered: number;
};

/**
 * Chooses this run's batch: candidates only, minus today's proposals, capped.
 *
 * Order is deliberate — filter, then cap. Reversed, a workspace whose first
 * twenty candidates were already scored today would propose nothing at all
 * while un-scored ventures waited behind them.
 */
export function selectShadowBatch(
  ventures: readonly VentureCard[],
  alreadyProposed: ReadonlySet<string>,
  cap: number = SHADOW_BATCH_CAP,
): BatchSelection {
  const candidates = ventures.filter((venture) => venture.status === "candidate");

  const deduped: string[] = [];
  const eligible: VentureCard[] = [];
  for (const venture of candidates) {
    if (alreadyProposed.has(venture.id)) deduped.push(venture.id);
    else eligible.push(venture);
  }

  const selected = eligible.slice(0, Math.max(0, cap));
  const deferred = eligible.slice(Math.max(0, cap)).map((venture) => venture.id);

  return { selected, deduped, deferred, considered: candidates.length };
}

export type ProposalTally = {
  proposed: number;
  /** Ventures the runner declined, with the reason it gave. */
  skipped: { ventureId: string; reason: string }[];
};

export type TickReport = {
  considered: number;
  proposed: number;
  skipped: number;
  skippedReasons: { ventureId: string; reason: string }[];
  deduped: number;
  deferred: number;
  deferredVentureIds: string[];
  /** True when the dedup read failed and the guard was off for this run. */
  dedupDegraded: boolean;
  /** Every candidate is accounted for: proposed + skipped + deduped + deferred. */
  balanced: boolean;
};

/**
 * Builds the run's account.
 *
 * `balanced` is the report checking itself: every candidate must land in
 * exactly one bucket. A report that does not add up is a report that lost track
 * of a venture, and the first place that would show is a divergence history
 * with holes nobody can explain.
 */
export function buildTickReport(input: {
  selection: BatchSelection;
  tally: ProposalTally;
  dedupDegraded: boolean;
}): TickReport {
  const { selection, tally } = input;
  const skipped = tally.skipped.length;
  const accounted = tally.proposed + skipped + selection.deduped.length + selection.deferred.length;

  return {
    considered: selection.considered,
    proposed: tally.proposed,
    skipped,
    skippedReasons: tally.skipped,
    deduped: selection.deduped.length,
    deferred: selection.deferred.length,
    deferredVentureIds: selection.deferred,
    dedupDegraded: input.dedupDegraded,
    balanced: accounted === selection.considered,
  };
}

/** One-line summary for the ledger row. */
export function formatTickSummary(report: TickReport): string {
  const parts = [
    `${report.proposed} proposée(s)`,
    `${report.skipped} sautée(s)`,
    `${report.deduped} déjà faite(s) aujourd'hui`,
    `${report.deferred} reportée(s)`,
  ];
  const flags = [
    report.dedupDegraded ? "dédup indisponible" : null,
    report.balanced ? null : "COMPTE NON ÉQUILIBRÉ",
  ].filter((flag): flag is string => flag !== null);

  return (
    `Tick mode ombre — ${report.considered} candidate(s) : ${parts.join(", ")}.` +
    (flags.length > 0 ? ` ⚠️ ${flags.join(" · ")}.` : "")
  );
}
