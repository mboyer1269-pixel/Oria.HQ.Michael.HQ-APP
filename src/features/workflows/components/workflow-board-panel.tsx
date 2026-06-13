import type {
  WorkflowAgentSwimlane,
  WorkflowLiveBoard,
  WorkflowRunLane,
  WorkflowStepPoint,
} from "../workflow-live-board";
import type { WorkflowRunStatus, WorkflowStepStatus } from "../workflow-run";

// ---------------------------------------------------------------------------
// Workflow live board panel — multi-agent swimlanes, each run drawn as a line
// of step nodes (the live "line graph"). Presentational, no I/O, no hooks.
// ---------------------------------------------------------------------------

const RUN_STATUS_STYLE: Record<
  WorkflowRunStatus,
  { label: string; chip: string; dot: string }
> = {
  running: {
    label: "En cours",
    chip: "border-violet-500/30 bg-violet-500/10 text-violet-200",
    dot: "bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.85)]",
  },
  blocked: {
    label: "Bloqué",
    chip: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    dot: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.85)]",
  },
  queued: {
    label: "En file",
    chip: "border-white/10 bg-white/[0.05] text-neutral-300",
    dot: "bg-neutral-400",
  },
  completed: {
    label: "Terminé",
    chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.85)]",
  },
  failed: {
    label: "Échec",
    chip: "border-rose-500/30 bg-rose-500/10 text-rose-200",
    dot: "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.85)]",
  },
};

const STEP_NODE_STYLE: Record<WorkflowStepStatus, string> = {
  done: "border-emerald-400/70 bg-emerald-400/80 text-[#04140d]",
  active: "border-violet-300 bg-violet-500/30 text-violet-100 animate-pulse",
  failed: "border-rose-400/80 bg-rose-500/70 text-white",
  skipped: "border-dashed border-neutral-500/60 bg-transparent text-neutral-500",
  pending: "border-white/15 bg-white/[0.03] text-neutral-500",
};

/** Connector segment colour reflects whether the step it leads into is resolved. */
function connectorClass(step: WorkflowStepPoint): string {
  if (step.status === "done") return "bg-emerald-400/50";
  if (step.status === "failed") return "bg-rose-400/50";
  if (step.status === "active") return "bg-violet-400/40";
  return "bg-white/10";
}

function formatDuration(ms: number | null): string | null {
  if (ms === null || ms < 0) return null;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function StepLine({ lane }: { lane: WorkflowRunLane }) {
  return (
    <ol className="flex items-stretch gap-0" aria-label="Étapes du run">
      {lane.steps.map((step, index) => {
        const duration = formatDuration(step.durationMs);
        const isCurrent = index === lane.currentStepIndex;
        return (
          <li key={step.key} className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-center">
              <span
                title={`${step.label} — ${step.detail}`}
                className={`relative z-10 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${STEP_NODE_STYLE[step.status]} ${
                  isCurrent ? "ring-2 ring-violet-400/50 ring-offset-2 ring-offset-[#080a16]" : ""
                }`}
              >
                {step.status === "done"
                  ? "✓"
                  : step.status === "failed"
                    ? "✕"
                    : step.status === "skipped"
                      ? "–"
                      : index + 1}
              </span>
              {index < lane.steps.length - 1 ? (
                <span className={`h-[2px] flex-1 ${connectorClass(lane.steps[index + 1])}`} />
              ) : null}
            </div>
            <div className="min-w-0 pr-2">
              <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                {step.label}
              </p>
              <p className="truncate text-[11px] text-neutral-500" title={step.detail}>
                {duration ?? step.detail}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function RunLane({ lane }: { lane: WorkflowRunLane }) {
  const style = RUN_STATUS_STYLE[lane.status];
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-100">{lane.title}</p>
          <p className="truncate text-[11px] text-neutral-500" title={lane.trigger}>
            {lane.trigger}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="tabular-nums text-[11px] font-semibold text-neutral-400">
            {lane.progressPct}%
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.chip}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
            {style.label}
          </span>
        </div>
      </div>
      <StepLine lane={lane} />
    </div>
  );
}

function Swimlane({ swimlane }: { swimlane: WorkflowAgentSwimlane }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-black/30 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-white">{swimlane.agentName}</h3>
        <div className="flex items-center gap-1.5 text-[10px] font-semibold">
          {swimlane.activeRunCount > 0 ? (
            <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-violet-200">
              {swimlane.activeRunCount} actif{swimlane.activeRunCount > 1 ? "s" : ""}
            </span>
          ) : null}
          {swimlane.completedRunCount > 0 ? (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-200">
              {swimlane.completedRunCount} terminé{swimlane.completedRunCount > 1 ? "s" : ""}
            </span>
          ) : null}
          {swimlane.failedRunCount > 0 ? (
            <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-rose-200">
              {swimlane.failedRunCount} échec{swimlane.failedRunCount > 1 ? "s" : ""}
            </span>
          ) : null}
        </div>
      </div>
      <div className="grid gap-3">
        {swimlane.lanes.map((lane) => (
          <RunLane key={lane.runId} lane={lane} />
        ))}
      </div>
    </div>
  );
}

export function WorkflowBoardPanel({
  board,
  note,
}: {
  board: WorkflowLiveBoard;
  note?: string;
}) {
  if (board.swimlanes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-5 py-8 text-center">
        <p className="text-sm font-semibold text-neutral-300">Aucun run actif</p>
        <p className="mt-1 text-xs text-neutral-500">
          Les lignes d&apos;étapes apparaîtront ici dès qu&apos;un workflow émettra des événements
          de run.
        </p>
      </div>
    );
  }

  const { totals } = board;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <BoardStat label="Agents engagés" value={totals.agentsEngaged} tone="violet" />
        <BoardStat label="Runs actifs" value={totals.active} tone="sky" />
        <BoardStat label="Terminés" value={totals.completed} tone="emerald" />
        <BoardStat label="Progression moy." value={`${totals.avgProgressPct}%`} tone="amber" />
      </div>

      {note ? (
        <p className="rounded-xl border border-amber-500/15 bg-amber-500/[0.05] px-3.5 py-2.5 text-[11px] leading-5 text-amber-200/80">
          {note}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {board.swimlanes.map((swimlane) => (
          <Swimlane key={swimlane.agentId} swimlane={swimlane} />
        ))}
      </div>
    </div>
  );
}

function BoardStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "violet" | "sky" | "emerald" | "amber";
}) {
  const accent = {
    violet: "text-violet-300",
    sky: "text-sky-300",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
  }[tone];
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1 tabular-nums text-lg font-extrabold ${accent}`}>{value}</p>
    </div>
  );
}
