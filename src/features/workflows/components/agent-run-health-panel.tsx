import { AlertTriangle, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import type { AgentRunHealth, RunHealthReport } from "../agent-run-health";

// ---------------------------------------------------------------------------
// Agent run-health scorecard — reads the centralized RunHealthReport and shows,
// per agent and across the board: success, errors, pending, stuck, average
// duration, last run, and failure rate. Presentational only (no hooks, no I/O)
// so it renders server-side. The numbers come from `buildRunHealthReport` —
// this component never re-derives health, it only displays it.
// ---------------------------------------------------------------------------

function formatDuration(ms: number | null): string {
  if (ms === null || ms < 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  return `${seconds}s`;
}

function formatLastRun(ms: number | null, nowMs: number | undefined): string {
  if (ms === null) return "—";
  if (nowMs !== undefined) {
    const ago = Math.max(0, nowMs - ms);
    if (ago < 60_000) return "à l'instant";
    return `il y a ${formatDuration(ago)}`;
  }
  return new Intl.DateTimeFormat("fr-CA", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

function failureTone(pct: number): string {
  if (pct === 0) return "text-emerald-300";
  if (pct < 25) return "text-amber-300";
  return "text-rose-300";
}

function Stat({
  label,
  value,
  tone = "text-white",
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">{label}</p>
      <p className={`mt-0.5 tabular-nums text-base font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

function HealthCard({
  health,
  name,
  nowMs,
}: {
  health: AgentRunHealth;
  name: string;
  nowMs: number | undefined;
}) {
  const hasStuck = health.stuck > 0;
  return (
    <article
      className={`rounded-xl border p-4 ${
        hasStuck
          ? "border-rose-500/25 bg-rose-500/[0.04]"
          : "border-neutral-800 bg-neutral-950/60"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-white">{name}</h3>
        <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
          <span className="tabular-nums">{health.total} run{health.total > 1 ? "s" : ""}</span>
          {hasStuck ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-bold uppercase tracking-wide text-rose-200">
              <AlertTriangle className="h-3 w-3" />
              {health.stuck} coincé{health.stuck > 1 ? "s" : ""}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Succès" value={health.success} tone="text-emerald-300" />
        <Stat label="Erreurs" value={health.failed} tone={health.failed > 0 ? "text-rose-300" : "text-neutral-300"} />
        <Stat label="En cours" value={health.pending} tone="text-sky-300" />
        <Stat label="Coincés" value={health.stuck} tone={hasStuck ? "text-rose-300" : "text-neutral-300"} />
        <Stat label="Durée moy." value={formatDuration(health.avgDurationMs)} tone="text-amber-300" />
        <Stat label="Taux d'échec" value={`${health.failureRatePct}%`} tone={failureTone(health.failureRatePct)} />
      </div>

      <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-neutral-500">
        <Clock className="h-3 w-3" />
        Dernier run : {formatLastRun(health.lastRunAtMs, nowMs)}
      </p>
    </article>
  );
}

export function AgentRunHealthPanel({
  report,
  agentNames,
  nowMs,
}: {
  report: RunHealthReport;
  agentNames: Readonly<Record<string, string>>;
  nowMs?: number;
}) {
  const { global, byAgent } = report;

  if (global.total === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/40 px-5 py-8 text-center">
        <p className="text-sm font-semibold text-neutral-300">Aucun run observé</p>
        <p className="mt-1 text-xs text-neutral-500">
          La santé des agents s&apos;allumera dès que des runs réels seront projetés depuis le ledger.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <RollupStat icon={CheckCircle2} label="Succès" value={global.success} tone="text-emerald-300" />
        <RollupStat icon={XCircle} label="Erreurs" value={global.failed} tone={global.failed > 0 ? "text-rose-300" : "text-neutral-300"} />
        <RollupStat icon={Loader2} label="En cours" value={global.pending} tone="text-sky-300" />
        <RollupStat icon={AlertTriangle} label="Coincés" value={global.stuck} tone={global.stuck > 0 ? "text-rose-300" : "text-neutral-300"} />
        <RollupStat icon={Clock} label="Durée moy." value={formatDuration(global.avgDurationMs)} tone="text-amber-300" />
        <RollupStat icon={XCircle} label="Taux d'échec" value={`${global.failureRatePct}%`} tone={failureTone(global.failureRatePct)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {byAgent.map((health) => (
          <HealthCard
            key={health.agentId}
            health={health}
            name={agentNames[health.agentId] ?? health.agentId}
            nowMs={nowMs}
          />
        ))}
      </div>
    </div>
  );
}

function RollupStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: string | number;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className={`mt-1 tabular-nums text-lg font-extrabold ${tone}`}>{value}</p>
    </div>
  );
}
