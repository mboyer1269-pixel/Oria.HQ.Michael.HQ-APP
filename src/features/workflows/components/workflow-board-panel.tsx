import type { WorkflowAgentSwimlane, WorkflowLiveBoard } from "../workflow-live-board";
import { RunLane } from "./workflow-run-lane";
import { WorkflowRunTimeline } from "./workflow-run-timeline-panel";

// ---------------------------------------------------------------------------
// Workflow live board panel — multi-agent swimlanes, each run drawn by the
// shared <RunLane> (duration-proportional step line + click-to-expand detail),
// plus a board-level temporal timeline. Presentational, no I/O, no hooks of its
// own. Run-lane rendering lives in ONE place (workflow-run-lane.tsx) so the
// board and any other surface stay visually identical — no duplicated lane code.
// ---------------------------------------------------------------------------

function Swimlane({ swimlane }: { swimlane: WorkflowAgentSwimlane }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-black/30 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-white">{swimlane.agentName}</h3>
        <div className="flex items-center gap-1.5 text-[10px] font-semibold">
          {swimlane.staleRunCount > 0 ? (
            <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-rose-200">
              {swimlane.staleRunCount} coincé{swimlane.staleRunCount > 1 ? "s" : ""}
            </span>
          ) : null}
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <BoardStat label="Agents engagés" value={totals.agentsEngaged} tone="violet" />
        <BoardStat label="Runs actifs" value={totals.active} tone="sky" />
        <BoardStat label="Terminés" value={totals.completed} tone="emerald" />
        <BoardStat
          label="Coincés"
          value={totals.stale}
          tone={totals.stale > 0 ? "rose" : "neutral"}
        />
        <BoardStat label="Progression moy." value={`${totals.avgProgressPct}%`} tone="amber" />
      </div>

      {note ? (
        <p className="rounded-xl border border-amber-500/15 bg-amber-500/[0.05] px-3.5 py-2.5 text-[11px] leading-5 text-amber-200/80">
          {note}
        </p>
      ) : null}

      <WorkflowRunTimeline board={board} />

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
  tone: "violet" | "sky" | "emerald" | "amber" | "rose" | "neutral";
}) {
  const accent = {
    violet: "text-violet-300",
    sky: "text-sky-300",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    rose: "text-rose-300",
    neutral: "text-neutral-300",
  }[tone];
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1 tabular-nums text-lg font-extrabold ${accent}`}>{value}</p>
    </div>
  );
}
