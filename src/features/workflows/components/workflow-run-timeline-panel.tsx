import type { WorkflowLiveBoard } from "../workflow-live-board";
import type { WorkflowRunStatus } from "../workflow-run";
import { buildRunTimelineFromBoard, type RunTimelineBar } from "../workflow-run-timeline";

// ---------------------------------------------------------------------------
// Run timeline panel — the board's temporal "line graph". One row per run,
// ordered in time, the bar's length proportional to the run's real duration.
// Errors and stuck runs are visually loud. Pure CSS bars (no chart library),
// presentational, no hooks. The geometry is computed by buildRunTimeline.
// ---------------------------------------------------------------------------

const BAR_STYLE: Record<WorkflowRunStatus, string> = {
  running: "bg-violet-500/70 border-violet-300/40",
  blocked: "bg-amber-500/70 border-amber-300/40",
  queued: "bg-neutral-600/60 border-white/10",
  completed: "bg-emerald-500/70 border-emerald-300/40",
  failed: "bg-rose-500/80 border-rose-300/50",
};

function formatDuration(ms: number | null): string {
  if (ms === null || ms < 0) return "en cours";
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  return `${seconds}s`;
}

function TimelineRow({ bar }: { bar: RunTimelineBar }) {
  return (
    <li className="flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-[11px] text-neutral-400" title={bar.title}>
        {bar.title}
      </span>
      <span className="relative h-5 flex-1 rounded-md bg-white/[0.03]">
        <span
          className={`absolute top-0 flex h-full items-center justify-end rounded-md border px-1.5 ${BAR_STYLE[bar.status]} ${
            bar.isStale ? "ring-2 ring-rose-400/70" : ""
          }`}
          style={{ left: `${bar.offsetPct}%`, width: `${bar.widthPct}%` }}
          title={`${bar.title} — ${formatDuration(bar.durationMs)}${bar.isStale ? " · coincé" : ""}`}
        >
          {bar.isStale ? (
            <span className="text-[9px] font-bold uppercase tracking-wide text-white">coincé</span>
          ) : null}
        </span>
      </span>
      <span className="w-16 shrink-0 text-right tabular-nums text-[10px] text-neutral-500">
        {formatDuration(bar.durationMs)}
      </span>
    </li>
  );
}

export function WorkflowRunTimeline({ board }: { board: WorkflowLiveBoard }) {
  const timeline = buildRunTimelineFromBoard(board);

  if (timeline.bars.length === 0) return null;

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-400">
          Chronologie des runs
        </h3>
        <p className="text-[10px] text-neutral-500">largeur ∝ durée · ordre temporel</p>
      </div>
      <ol className="grid gap-1.5">
        {timeline.bars.map((bar) => (
          <TimelineRow key={bar.runId} bar={bar} />
        ))}
      </ol>
    </section>
  );
}
