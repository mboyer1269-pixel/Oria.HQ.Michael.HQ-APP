import type { WorkflowLiveBoard, WorkflowRunLane } from "./workflow-live-board";
import { isRunTerminal, type WorkflowRunStatus } from "./workflow-run";

// ---------------------------------------------------------------------------
// Run timeline — a board-level temporal view of runs.
//
// Each run becomes a horizontal bar positioned by its start time and sized in
// proportion to its real duration, all within one shared time window. Terminal
// runs span [start, end]; in-flight runs run from their start to the window
// edge ("still going"). The result reads like a compact Gantt of the whole
// board, ordered in time, with errors and stuck runs called out.
//
// Pure and deterministic: no Date.now(), no I/O. Percentages are computed from
// the supplied lanes only, so the same lanes always yield the same timeline.
// ---------------------------------------------------------------------------

export type RunTimelineBar = {
  runId: string;
  agentId: string;
  title: string;
  status: WorkflowRunStatus;
  isStale: boolean;
  startedAtMs: number | null;
  durationMs: number | null;
  /** Left offset within the window, percent 0..100. */
  offsetPct: number;
  /** Bar length, percent of the window, proportional to duration. */
  widthPct: number;
};

export type RunTimeline = {
  bars: RunTimelineBar[];
  windowStartMs: number | null;
  windowEndMs: number | null;
  windowMs: number;
};

/** Smallest visible bar so a zero/near-zero-duration run is still clickable. */
const MIN_BAR_PCT = 2;

const EMPTY_TIMELINE: RunTimeline = {
  bars: [],
  windowStartMs: null,
  windowEndMs: null,
  windowMs: 0,
};

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value * 100) / 100;
}

/**
 * Builds the timeline from run lanes. Bars are ordered by start time (runs with
 * no recorded start sort last). Width tracks duration; in-flight runs extend to
 * the window edge. Returns an empty, well-formed timeline for no/zero-span data.
 */
export function buildRunTimeline(lanes: readonly WorkflowRunLane[]): RunTimeline {
  if (lanes.length === 0) return EMPTY_TIMELINE;

  let windowStartMs = Infinity;
  let windowEndMs = -Infinity;
  for (const lane of lanes) {
    if (lane.startedAtMs !== null) {
      windowStartMs = Math.min(windowStartMs, lane.startedAtMs);
      windowEndMs = Math.max(windowEndMs, lane.startedAtMs);
    }
    if (lane.endedAtMs !== null) {
      windowEndMs = Math.max(windowEndMs, lane.endedAtMs);
    }
  }

  // No run ever recorded a start: nothing temporal to draw.
  if (!Number.isFinite(windowStartMs)) return EMPTY_TIMELINE;
  if (!Number.isFinite(windowEndMs)) windowEndMs = windowStartMs;

  const windowMs = Math.max(windowEndMs - windowStartMs, 0);
  const span = windowMs === 0 ? 1 : windowMs; // avoid divide-by-zero

  const ordered = [...lanes].sort((a, b) => {
    const as = a.startedAtMs;
    const bs = b.startedAtMs;
    if (as === null && bs === null) return a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0;
    if (as === null) return 1;
    if (bs === null) return -1;
    return as !== bs ? as - bs : a.runId < b.runId ? -1 : 1;
  });

  const bars = ordered.map((lane): RunTimelineBar => {
    const start = lane.startedAtMs;
    const offsetPct = start === null ? 0 : clampPct(((start - windowStartMs) / span) * 100);

    // Terminal runs span their real duration; in-flight runs extend to the
    // window edge to read as "ongoing". Both are clamped to a visible minimum.
    let rawWidth: number;
    if (lane.durationMs !== null) {
      rawWidth = (lane.durationMs / span) * 100;
    } else if (start !== null && !isRunTerminal(lane.status)) {
      rawWidth = ((windowEndMs - start) / span) * 100;
    } else {
      rawWidth = 0;
    }
    const widthPct = Math.max(MIN_BAR_PCT, clampPct(Math.min(rawWidth, 100 - offsetPct)));

    return {
      runId: lane.runId,
      agentId: lane.agentId,
      title: lane.title,
      status: lane.status,
      isStale: lane.isStale,
      startedAtMs: lane.startedAtMs,
      durationMs: lane.durationMs,
      offsetPct,
      widthPct,
    };
  });

  return { bars, windowStartMs, windowEndMs, windowMs };
}

/** Convenience: flatten a whole board's swimlanes into one timeline. */
export function buildRunTimelineFromBoard(board: WorkflowLiveBoard): RunTimeline {
  return buildRunTimeline(board.swimlanes.flatMap((swimlane) => swimlane.lanes));
}
