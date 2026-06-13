import type { AgentCharter, AgentKpi } from "@/features/agents/agent-charter";
import type {
  ObservedAgentOutcome,
  ObservedAgentOutcomeMetrics,
} from "@/features/agents/observed-agent-outcome";

// ---------------------------------------------------------------------------
// KPI ↔ Observations linker.
//
// Charter KPIs are human-readable targets ("≥ 90 %", "< 30 s", "0"). Observed
// outcomes carry numeric metrics. This module wires the two together so the
// health view reads REAL observed signal instead of a static target string.
//
// Honesty first:
//   - A KPI only gets a computed value through an EXPLICIT, documented binding
//     (no heuristic guessing which metric "feels" right).
//   - A bound KPI with no observations reports `awaiting_observations`, not a
//     fabricated number.
//   - An unbound KPI reports `unbound` — visible, never hidden, trivially
//     extended by adding a binding.
//   - Pure functions only. No I/O, no Date.now(), no DB.
// ---------------------------------------------------------------------------

export type KpiComparator = ">=" | "<=" | ">" | "<" | "==";

export type KpiUnit =
  | "percent"
  | "seconds"
  | "minutes"
  | "hours"
  | "days"
  | "count"
  | "currency_cents"
  | "unknown";

export type KpiTarget = {
  raw: string;
  comparator: KpiComparator;
  value: number;
  unit: KpiUnit;
  /** False when the string could not be parsed into a comparable target. */
  parsed: boolean;
};

/** Aggregate measures we can compute from observed outcome metrics. */
export type KpiMeasureKey =
  | "useful_output_rate"
  | "guardrail_clean_rate"
  | "realized_profit_cents"
  | "ceo_minutes_saved"
  | "reviewed_outputs"
  | "useful_outputs"
  | "guardrail_violations"
  | "run_count";

const MEASURE_UNIT: Record<KpiMeasureKey, KpiUnit> = {
  useful_output_rate: "percent",
  guardrail_clean_rate: "percent",
  realized_profit_cents: "currency_cents",
  ceo_minutes_saved: "minutes",
  reviewed_outputs: "count",
  useful_outputs: "count",
  guardrail_violations: "count",
  run_count: "count",
};

/** Explicit, documented KPI → measure binding. */
export type KpiObservationBinding = {
  kpiId: string;
  measure: KpiMeasureKey;
  /** Why this measure stands in for the KPI — surfaced for human review. */
  note: string;
};

export type KpiLinkStatus =
  | "met"
  | "at_risk"
  | "missed"
  | "awaiting_observations"
  | "unbound";

export type KpiObservationAggregate = {
  agentId: string;
  runCount: number;
  realizedProfitCents: number;
  ceoMinutesSaved: number;
  guardrailViolations: number;
  usefulOutputs: number;
  reviewedOutputs: number;
  usefulOutputRatePct: number | null;
  guardrailCleanRatePct: number | null;
};

export type KpiLinkRow = {
  agentId: string;
  kpiId: string;
  label: string;
  target: KpiTarget;
  measure: KpiMeasureKey | null;
  note: string | null;
  /** Observed value in the measure's natural unit, or null when not measured. */
  actual: number | null;
  observationCount: number;
  status: KpiLinkStatus;
};

export type KpiObservationReport = {
  rows: KpiLinkRow[];
  boundCount: number;
  measuredCount: number;
  metCount: number;
  atRiskCount: number;
  missedCount: number;
  awaitingCount: number;
  unboundCount: number;
};

const ZERO_METRICS: ObservedAgentOutcomeMetrics = {
  realizedProfitCents: 0,
  ceoMinutesSaved: 0,
  guardrailViolations: 0,
  usefulOutputs: 0,
  reviewedOutputs: 0,
};

/** Outcome statuses that carry usable measured signal. */
const MEASURED_STATUSES: ReadonlySet<ObservedAgentOutcome["status"]> = new Set([
  "completed",
  "failed",
]);

// ---------------------------------------------------------------------------
// Target parsing
// ---------------------------------------------------------------------------

const UNIT_PATTERNS: { unit: KpiUnit; test: RegExp }[] = [
  { unit: "percent", test: /%/ },
  { unit: "seconds", test: /\b(s|sec|secondes?)\b/i },
  { unit: "minutes", test: /\b(min|minutes?)\b/i },
  { unit: "hours", test: /\b(h|heures?)\b/i },
  { unit: "days", test: /\b(j|jours?|days?)\b/i },
];

function detectUnit(raw: string): KpiUnit {
  for (const { unit, test } of UNIT_PATTERNS) {
    if (test.test(raw)) return unit;
  }
  return "count";
}

/**
 * Parses a charter target string into a comparable target. Understands the
 * comparators used across the seed (≥ ≤ > < and bare equality) and the units
 * (%, s, min, h, j). A bare number ("0", "100 %") is treated as "==" for an
 * exact target unless a comparator is present. Unparseable → parsed:false.
 */
export function parseKpiTarget(raw: string): KpiTarget {
  const text = raw.trim();
  let comparator: KpiComparator = "==";

  if (/(≥|>=)/.test(text)) comparator = ">=";
  else if (/(≤|<=)/.test(text)) comparator = "<=";
  else if (/>/.test(text)) comparator = ">";
  else if (/</.test(text)) comparator = "<";

  const numberMatch = text.match(/-?\d+(?:[.,]\d+)?/);
  if (!numberMatch) {
    return { raw, comparator, value: Number.NaN, unit: detectUnit(text), parsed: false };
  }

  const value = Number.parseFloat(numberMatch[0].replace(",", "."));
  return {
    raw,
    comparator,
    value,
    unit: detectUnit(text),
    parsed: Number.isFinite(value),
  };
}

// ---------------------------------------------------------------------------
// Observation aggregation
// ---------------------------------------------------------------------------

function roundPct(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)));
}

/**
 * Aggregates measured outcomes (completed/failed) per agent. Draft/simulated/
 * blocked outcomes carry no measured signal and are excluded so rates reflect
 * concluded work only.
 */
export function aggregateObservationsByAgent(
  outcomes: readonly ObservedAgentOutcome[],
): Map<string, KpiObservationAggregate> {
  const byAgent = new Map<string, KpiObservationAggregate>();

  for (const outcome of outcomes) {
    if (!MEASURED_STATUSES.has(outcome.status)) continue;
    const metrics = outcome.metrics ?? ZERO_METRICS;

    const current =
      byAgent.get(outcome.agentId) ??
      {
        agentId: outcome.agentId,
        runCount: 0,
        realizedProfitCents: 0,
        ceoMinutesSaved: 0,
        guardrailViolations: 0,
        usefulOutputs: 0,
        reviewedOutputs: 0,
        usefulOutputRatePct: null,
        guardrailCleanRatePct: null,
      };

    current.runCount += 1;
    current.realizedProfitCents += metrics.realizedProfitCents;
    current.ceoMinutesSaved += metrics.ceoMinutesSaved;
    current.guardrailViolations += metrics.guardrailViolations;
    current.usefulOutputs += metrics.usefulOutputs;
    current.reviewedOutputs += metrics.reviewedOutputs;
    byAgent.set(outcome.agentId, current);
  }

  for (const agg of byAgent.values()) {
    if (agg.reviewedOutputs > 0) {
      agg.usefulOutputRatePct = roundPct((agg.usefulOutputs / agg.reviewedOutputs) * 100);
      agg.guardrailCleanRatePct = roundPct(
        (1 - agg.guardrailViolations / agg.reviewedOutputs) * 100,
      );
    }
  }

  return byAgent;
}

function readMeasure(
  agg: KpiObservationAggregate,
  measure: KpiMeasureKey,
): number | null {
  switch (measure) {
    case "useful_output_rate":
      return agg.usefulOutputRatePct;
    case "guardrail_clean_rate":
      return agg.guardrailCleanRatePct;
    case "realized_profit_cents":
      return agg.realizedProfitCents;
    case "ceo_minutes_saved":
      return agg.ceoMinutesSaved;
    case "reviewed_outputs":
      return agg.reviewedOutputs;
    case "useful_outputs":
      return agg.usefulOutputs;
    case "guardrail_violations":
      return agg.guardrailViolations;
    case "run_count":
      return agg.runCount;
  }
}

function satisfies(actual: number, comparator: KpiComparator, value: number): boolean {
  switch (comparator) {
    case ">=":
      return actual >= value;
    case "<=":
      return actual <= value;
    case ">":
      return actual > value;
    case "<":
      return actual < value;
    case "==":
      return actual === value;
  }
}

/**
 * Three-state verdict with a 10% tolerance band. "At risk" means the target is
 * missed but within reach (≥ 90% of a floor target, or ≤ ~111% of a ceiling
 * target). Exact targets ("==", "0") have no band — they are met or missed.
 */
function evaluate(actual: number, target: KpiTarget): "met" | "at_risk" | "missed" {
  if (satisfies(actual, target.comparator, target.value)) return "met";

  switch (target.comparator) {
    case ">=":
    case ">":
      return target.value > 0 && actual >= target.value * 0.9 ? "at_risk" : "missed";
    case "<=":
    case "<":
      return actual <= target.value * 1.1 ? "at_risk" : "missed";
    case "==":
      // A "100 %"-style ceiling gets an at-risk band just below it; an exact
      // count target ("0") stays strict (any miss is a miss).
      return target.unit === "percent" && target.value > 0 && actual >= target.value * 0.9
        ? "at_risk"
        : "missed";
  }
}

/**
 * Builds the KPI observation report: one row per charter KPI, wired to its
 * bound measure and the aggregated observations for that agent. Deterministic;
 * row order follows charter then KPI declaration order.
 */
export function buildKpiObservationReport(
  charters: readonly AgentCharter[],
  outcomes: readonly ObservedAgentOutcome[],
  bindings: readonly KpiObservationBinding[],
): KpiObservationReport {
  const aggregates = aggregateObservationsByAgent(outcomes);
  const bindingByKpi = new Map(bindings.map((b) => [b.kpiId, b]));

  const rows: KpiLinkRow[] = [];

  for (const charter of charters) {
    for (const kpi of charter.kpis as AgentKpi[]) {
      const target = parseKpiTarget(kpi.target);
      const binding = bindingByKpi.get(kpi.id) ?? null;
      const agg = aggregates.get(charter.agentId) ?? null;

      let status: KpiLinkStatus;
      let actual: number | null = null;

      if (!binding) {
        status = "unbound";
      } else if (!agg || agg.runCount === 0) {
        status = "awaiting_observations";
      } else {
        actual = readMeasure(agg, binding.measure);
        if (actual === null) {
          status = "awaiting_observations";
        } else if (!target.parsed) {
          status = "unbound";
        } else {
          status = evaluate(actual, target);
        }
      }

      rows.push({
        agentId: charter.agentId,
        kpiId: kpi.id,
        label: kpi.label,
        target,
        measure: binding?.measure ?? null,
        note: binding?.note ?? null,
        actual,
        observationCount: agg?.runCount ?? 0,
        status,
      });
    }
  }

  return {
    rows,
    boundCount: rows.filter((r) => r.measure !== null).length,
    measuredCount: rows.filter((r) => r.actual !== null).length,
    metCount: rows.filter((r) => r.status === "met").length,
    atRiskCount: rows.filter((r) => r.status === "at_risk").length,
    missedCount: rows.filter((r) => r.status === "missed").length,
    awaitingCount: rows.filter((r) => r.status === "awaiting_observations").length,
    unboundCount: rows.filter((r) => r.status === "unbound").length,
  };
}

/** Natural unit of a measure — exported for UI labelling. */
export function measureUnit(measure: KpiMeasureKey): KpiUnit {
  return MEASURE_UNIT[measure];
}
