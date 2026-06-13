import type { LedgerEventType } from "@/features/skills/types";
import {
  getLedgerEventTypeLabel,
  resolveLedgerMissionId,
  type MissionLookup,
} from "@/features/hq/ledger-activity";
import type { ActionLedgerEntry } from "@/server/actions/action-ledger-repository";
import type { WorkflowStepDef } from "./workflow-run";
import type { WorkflowRunEvent } from "./workflow-run-events";

// ---------------------------------------------------------------------------
// Real run projection from the action ledger.
//
// The ledger is the system's truth: every governed action is recorded there
// (decision → action → result) and tagged with its mission and agent. This
// module folds those REAL recorded events into runs — one run per mission, its
// step line advancing as actual events land. No fabrication: a step is "done"
// only because a matching ledger entry exists; a run is "completed" only when a
// result was recorded (or the mission closed).
//
// Read-only and pure: it transforms entries the caller already read, supplies
// no timestamps of its own beyond the entries' own createdAt, and triggers
// nothing. When the ledger is empty (no live activity), it returns [] and the
// board shows its honest empty state.
// ---------------------------------------------------------------------------

/** The execution spine every governed mission moves through. */
const RUN_SPINE: readonly LedgerEventType[] = ["decision", "action", "result"];

const CLOSED_MISSION_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "done",
  "closed",
  "archived",
  "delivered",
]);

const FAILED_MISSION_STATUSES: ReadonlySet<string> = new Set([
  "failed",
  "cancelled",
  "canceled",
  "rejected",
]);

function toMs(iso: string, fallback: number): number {
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : fallback;
}

type MissionGroup = {
  missionId: string;
  entries: ActionLedgerEntry[];
  startMs: number;
};

function groupByMission(entries: readonly ActionLedgerEntry[]): MissionGroup[] {
  const groups = new Map<string, ActionLedgerEntry[]>();

  for (const entry of entries) {
    const missionId = resolveLedgerMissionId(entry);
    if (!missionId) continue; // orphan ledger entries are not runs
    const bucket = groups.get(missionId);
    if (bucket) bucket.push(entry);
    else groups.set(missionId, [entry]);
  }

  const result: MissionGroup[] = [];
  for (const [missionId, bucket] of groups) {
    const sorted = [...bucket].sort((a, b) => toMs(a.createdAt, 0) - toMs(b.createdAt, 0));
    result.push({ missionId, entries: sorted, startMs: toMs(sorted[0].createdAt, 0) });
  }

  // Deterministic board order: earliest mission first, then id.
  return result.sort((a, b) =>
    a.startMs !== b.startMs ? a.startMs - b.startMs : a.missionId < b.missionId ? -1 : 1,
  );
}

function firstEntryOfType(
  entries: readonly ActionLedgerEntry[],
  eventType: LedgerEventType,
): ActionLedgerEntry | undefined {
  return entries.find((entry) => entry.eventType === eventType);
}

function concludeKind(
  missionStatus: string | undefined,
  hasResult: boolean,
): "completed" | "failed" | null {
  const status = missionStatus?.trim().toLowerCase();
  if (status && FAILED_MISSION_STATUSES.has(status)) return "failed";
  if (hasResult) return "completed";
  if (status && CLOSED_MISSION_STATUSES.has(status)) return "completed";
  return null;
}

/**
 * Projects ledger entries into run events. One run per mission; the spine steps
 * (decision/action/result) light up from the real entries. Deterministic given
 * the same entries — timestamps come from each entry's createdAt.
 */
export function projectRunsFromLedger(
  entries: readonly ActionLedgerEntry[],
  missionLookup: MissionLookup,
): WorkflowRunEvent[] {
  const events: WorkflowRunEvent[] = [];

  for (const group of groupByMission(entries)) {
    const { missionId, entries: missionEntries, startMs } = group;
    const lastMs = toMs(missionEntries[missionEntries.length - 1].createdAt, startMs);

    const phaseEntry = new Map<LedgerEventType, ActionLedgerEntry>();
    for (const phase of RUN_SPINE) {
      const found = firstEntryOfType(missionEntries, phase);
      if (found) phaseEntry.set(phase, found);
    }

    const steps: WorkflowStepDef[] = RUN_SPINE.map((phase) => ({
      key: phase,
      label: getLedgerEventTypeLabel(phase),
      detail: phaseEntry.get(phase)?.summary ?? "—",
    }));

    const decision = phaseEntry.get("decision");
    const lookup = missionLookup.get(missionId);
    const agentId = decision?.agentId ?? missionEntries[0].agentId ?? "système";
    const title =
      lookup?.title ?? decision?.summary ?? `Mission ${missionId.slice(0, 8)}`;
    const trigger = decision?.summary ?? missionEntries[0].summary ?? "Activité ledger";

    const runId = `ledger-${missionId}`;
    events.push({
      type: "run.started",
      runId,
      workflowId: missionId,
      agentId,
      title,
      trigger,
      steps,
      atMs: startMs,
    });

    RUN_SPINE.forEach((phase, index) => {
      const entry = phaseEntry.get(phase);
      if (!entry) return;
      const at = toMs(entry.createdAt, startMs);
      events.push({ type: "step.started", runId, stepIndex: index, atMs: at });
      events.push({
        type: "step.completed",
        runId,
        stepIndex: index,
        atMs: at,
        note: entry.summary,
      });
    });

    const conclude = concludeKind(lookup?.status, phaseEntry.has("result"));
    if (conclude === "completed") {
      const at = toMs(phaseEntry.get("result")?.createdAt ?? "", lastMs);
      events.push({ type: "run.completed", runId, atMs: at });
    } else if (conclude === "failed") {
      events.push({ type: "run.failed", runId, atMs: lastMs });
    } else {
      // Still in flight: surface the first not-yet-recorded phase as active.
      const pendingIndex = RUN_SPINE.findIndex((phase) => !phaseEntry.has(phase));
      if (pendingIndex !== -1) {
        events.push({ type: "step.started", runId, stepIndex: pendingIndex, atMs: lastMs });
      }
    }
  }

  return events;
}
