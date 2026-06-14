import {
  measureUnit,
  type KpiLinkRow,
  type KpiLinkStatus,
  type KpiObservationReport,
  type KpiUnit,
} from "../kpi-observations";

// ---------------------------------------------------------------------------
// KPI ↔ observations panel — every charter KPI with its observed value, its
// target and a verdict. Bound KPIs read real observed signal; unbound KPIs are
// shown honestly as "binding à définir". Presentational, no I/O.
// ---------------------------------------------------------------------------

const STATUS_STYLE: Record<KpiLinkStatus, { label: string; chip: string }> = {
  met: { label: "Atteint", chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" },
  at_risk: { label: "À risque", chip: "border-amber-500/30 bg-amber-500/10 text-amber-200" },
  missed: { label: "Manqué", chip: "border-rose-500/30 bg-rose-500/10 text-rose-200" },
  awaiting_observations: {
    label: "En attente d'observations",
    chip: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  },
  unbound: { label: "Binding à définir", chip: "border-white/12 bg-white/[0.04] text-neutral-400" },
};

function formatActual(value: number | null, unit: KpiUnit): string {
  if (value === null) return "—";
  switch (unit) {
    case "percent":
      return `${value}%`;
    case "minutes":
      return `${value} min`;
    case "seconds":
      return `${value} s`;
    case "hours":
      return `${value} h`;
    case "days":
      return `${value} j`;
    case "currency_cents":
      return `${Math.round(value / 100)} $`;
    default:
      return `${value}`;
  }
}

function KpiRow({ row }: { row: KpiLinkRow }) {
  const style = STATUS_STYLE[row.status];
  const actualLabel =
    row.measure !== null ? formatActual(row.actual, measureUnit(row.measure)) : "—";

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3.5 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-neutral-100">{row.label}</p>
        <p className="truncate text-[11px] text-neutral-500" title={row.note ?? undefined}>
          Cible {row.target.raw}
          {row.note ? <span className="text-neutral-600"> · {row.note}</span> : null}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Réel</p>
          <p className="tabular-nums text-sm font-bold text-white">{actualLabel}</p>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.chip}`}
        >
          {style.label}
        </span>
      </div>
    </div>
  );
}

export function KpiObservationPanel({
  report,
  agentNames = {},
}: {
  report: KpiObservationReport;
  agentNames?: Readonly<Record<string, string>>;
}) {
  // Group rows by agent, preserving first-seen (charter) order.
  const order: string[] = [];
  const byAgent = new Map<string, KpiLinkRow[]>();
  for (const row of report.rows) {
    if (!byAgent.has(row.agentId)) {
      byAgent.set(row.agentId, []);
      order.push(row.agentId);
    }
    byAgent.get(row.agentId)!.push(row);
  }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiStat label="Atteints" value={report.metCount} tone="emerald" />
        <KpiStat label="À risque" value={report.atRiskCount} tone="amber" />
        <KpiStat label="Manqués" value={report.missedCount} tone="rose" />
        <KpiStat
          label="Branchés / total"
          value={`${report.boundCount}/${report.rows.length}`}
          tone="violet"
        />
      </div>

      <p className="text-[11px] leading-5 text-neutral-500">
        {report.measuredCount} KPI calculé{report.measuredCount > 1 ? "s" : ""} sur observations
        réelles · {report.awaitingCount} en attente d&apos;observations · {report.unboundCount}{" "}
        binding{report.unboundCount > 1 ? "s" : ""} à définir.
      </p>

      <div className="grid gap-4 xl:grid-cols-2">
        {order.map((agentId) => (
          <div
            key={agentId}
            className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-black/30 p-4"
          >
            <h3 className="mb-3 text-sm font-bold text-white">
              {agentNames[agentId] ?? agentId}
            </h3>
            <div className="grid gap-2">
              {byAgent.get(agentId)!.map((row) => (
                <KpiRow key={row.kpiId} row={row} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KpiStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "emerald" | "amber" | "rose" | "violet";
}) {
  const accent = {
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    rose: "text-rose-300",
    violet: "text-violet-300",
  }[tone];
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1 tabular-nums text-lg font-extrabold ${accent}`}>{value}</p>
    </div>
  );
}
