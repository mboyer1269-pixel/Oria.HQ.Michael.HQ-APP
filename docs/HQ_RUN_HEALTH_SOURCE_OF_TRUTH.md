# HQ Run Health — Single Source of Truth

This note records the one derivation path for everything the HQ shows about
agent runs (board, KPIs, agent quality, run-health scorecard, timeline). It
exists so no surface re-aggregates the same numbers a second way.

## The one pipeline

```
action ledger entries  ──┐
                         ├──►  projectRunsFromLedger(entries, missionLookup)
missions (lookup)  ──────┘            │  one run per mission, spine = decision→action→result
                                      ▼
                          reduceWorkflowRuns(...)  ──►  WorkflowRun[]   ◄── THE run list
                                      │
        ┌─────────────────┬──────────┼─────────────────┬──────────────────┐
        ▼                 ▼          ▼                 ▼                  ▼
 buildWorkflowLiveBoard  buildKpi…  buildAgentObs…   buildRunHealthReport  buildRunTimeline
   (swimlanes/totals)    (KPIs)     (agent quality)   (health scorecard)   (temporal bars)
```

The `WorkflowRun[]` list is the single intermediate. Each consumer is a **pure
projection of that same list** — they never read the ledger independently to
recompute a metric that another consumer already owns.

- **Run source:** `src/features/workflows/workflow-run-projection.ts`
  (`projectRunsFromLedger`). The action ledger is the system of record; one run
  per mission, steps light up only from entries that actually exist.
- **Mission lookup:** `src/features/hq/ledger-activity.ts`
  (`buildMissionLookup` / `resolveLedgerMissionId`). Real mission title + status
  when present; a clean fallback (`Mission <id>` / in-flight) when the
  `missionId` is null, unknown, or orphaned. No UI crash on a missing mission.

## Stuck-run rule — one threshold

A run is **stuck** when it is non-terminal and has been idle longer than a
single shared threshold:

- `DEFAULT_STALE_AFTER_MS` (15 min) and `isRunStale(run, nowMs, staleAfterMs)`
  live in `src/features/workflows/workflow-live-board.ts`.
- `agent-run-health.ts` and the timeline both import that predicate. There is no
  second copy of the threshold anywhere, so "stuck" means the same thing on the
  board, the scorecard, and the timeline.
- Staleness needs a caller-supplied `nowMs`. Pure builders never call
  `Date.now()`; the page/route passes the clock in. Omitting it disables
  staleness deterministically (tests, demo board).

## Who owns which metric

| Metric surface | Module | Notes |
| --- | --- | --- |
| Swimlanes, board totals, avg progress, stale count | `workflow-live-board.ts` | board shape |
| KPI attainment | `kpi-observations.ts` via `deriveObservationsFromRuns` | concluded runs → observations |
| Agent quality (profit, CEO minutes, guardrails) | `agent-quality-from-runs.ts` | bridges to the existing quality scorecard |
| Run health (success, errors, pending, stuck, avg duration, last run, failure rate) | `agent-run-health.ts` | the run-health scorecard on `/hq/agents` |
| Temporal bars (length ∝ duration) | `workflow-run-timeline.ts` | board chronology |

## Provider-agnostic

Nothing above names a provider. The ledger read (`listActionLedgerForWorkspace`)
and missions read (`listMissionsForWorkspace`) already abstract Supabase vs.
local fallback. The run model carries only generic fields (`agentId`,
`missionId`, timestamps, status), so swapping the persistence layer does not
touch any health derivation.
