"use client";

import { useState } from "react";
import { computeStepWidths, type WorkflowRunLane } from "../workflow-live-board";
import type { WorkflowRunStatus, WorkflowStepStatus } from "../workflow-run";

// ---------------------------------------------------------------------------
// One run lane: a clickable header (status + progress + stale flag), a
// duration-proportional step line (mini-Gantt), and an expandable detail panel
// showing each step's recorded text and timing. Client component — the only
// interactivity is local expand/collapse.
// ---------------------------------------------------------------------------

const RUN_STATUS_STYLE: Record<
  WorkflowRunStatus,
  { label: string; chip: string; dot: string }
> = {
  running: { label: "En cours", chip: "border-violet-500/30 bg-violet-500/10 text-violet-200", dot: "bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.85)]" },
  blocked: { label: "Bloqué", chip: "border-amber-500/30 bg-amber-500/10 text-amber-200", dot: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.85)]" },
  queued: { label: "En file", chip: "border-white/10 bg-white/[0.05] text-neutral-300", dot: "bg-neutral-400" },
  completed: { label: "Terminé", chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200", dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.85)]" },
  failed: { label: "Échec", chip: "border-rose-500/30 bg-rose-500/10 text-rose-200", dot: "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.85)]" },
};

const STEP_NODE_STYLE: Record<WorkflowStepStatus, string> = {
  done: "border-emerald-400/70 bg-emerald-400/80 text-[#04140d]",
  active: "border-violet-300 bg-violet-500/30 text-violet-100 animate-pulse",
  failed: "border-rose-400/80 bg-rose-500/70 text-white",
  skipped: "border-dashed border-neutral-500/60 bg-transparent text-neutral-500",
  pending: "border-white/15 bg-white/[0.03] text-neutral-500",
};

function connectorClass(status: WorkflowStepStatus): string {
  if (status === "done") return "bg-emerald-400/50";
  if (status === "failed") return "bg-rose-400/50";
  if (status === "active") return "bg-violet-400/40";
  return "bg-white/10";
}

function formatDuration(ms: number | null): string | null {
  if (ms === null || ms < 0) return null;
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  return `${seconds}s`;
}

function nodeGlyph(status: WorkflowStepStatus, index: number): string {
  if (status === "done") return "✓";
  if (status === "failed") return "✕";
  if (status === "skipped") return "–";
  return String(index + 1);
}

function StepLine({ lane }: { lane: WorkflowRunLane }) {
  const widths = computeStepWidths(lane.steps.map((s) => s.durationMs));
  return (
    <ol className="flex items-stretch gap-0" aria-label="Étapes du run (largeur ∝ durée)">
      {lane.steps.map((step, index) => {
        const isCurrent = index === lane.currentStepIndex;
        const duration = formatDuration(step.durationMs);
        return (
          <li
            key={step.key}
            className="flex min-w-0 flex-col gap-1.5"
            style={{ flexBasis: `${widths[index]}%` }}
          >
            <div className="flex items-center">
              <span
                title={`${step.label} — ${step.detail}`}
                className={`relative z-10 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${STEP_NODE_STYLE[step.status]} ${
                  isCurrent ? "ring-2 ring-violet-400/50 ring-offset-2 ring-offset-[#080a16]" : ""
                }`}
              >
                {nodeGlyph(step.status, index)}
              </span>
              {index < lane.steps.length - 1 ? (
                <span className={`h-[2px] flex-1 ${connectorClass(lane.steps[index + 1].status)}`} />
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

export function RunLane({ lane }: { lane: WorkflowRunLane }) {
  const [open, setOpen] = useState(false);
  const style = RUN_STATUS_STYLE[lane.status];
  const idle = lane.isStale ? formatDuration(lane.idleMs) : null;

  return (
    <div
      className={`rounded-xl border p-3.5 ${
        lane.isStale ? "border-rose-500/25 bg-rose-500/[0.04]" : "border-white/[0.07] bg-white/[0.02]"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mb-3 flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-100">{lane.title}</p>
          <p className="truncate text-[11px] text-neutral-500" title={lane.trigger}>
            {lane.trigger}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {lane.isStale ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-200">
              Coincé{idle ? ` · ${idle}` : ""}
            </span>
          ) : null}
          <span className="tabular-nums text-[11px] font-semibold text-neutral-400">
            {lane.progressPct}%
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.chip}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
            {style.label}
          </span>
          <span className="text-neutral-500" aria-hidden>
            {open ? "▾" : "▸"}
          </span>
        </div>
      </button>

      <StepLine lane={lane} />

      {open ? (
        <ol className="mt-3 grid gap-1.5 border-t border-white/[0.06] pt-3">
          {lane.steps.map((step) => {
            const duration = formatDuration(step.durationMs);
            return (
              <li key={step.key} className="flex items-start justify-between gap-3 text-[12px]">
                <div className="min-w-0">
                  <span className="font-semibold text-neutral-300">{step.label}</span>
                  <span className="text-neutral-500"> — {step.detail}</span>
                </div>
                <span className="shrink-0 tabular-nums text-[11px] text-neutral-500">
                  {duration ?? step.status}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
