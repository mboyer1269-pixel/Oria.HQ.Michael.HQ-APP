# Arena Batch Ranking Contract

**Status:** PR11 — batch ranking added on top of Arena evaluation and persistence.

## Goal

Rank multiple Arena candidates in one request, optionally persist each verdict, and return a compact leaderboard.

## Scope

- `POST /api/arena/batch`
- Owner auth required
- Workspace is resolved server-side
- Candidate `workspaceId` is overwritten by the server workspace
- No scoring change
- No migration
- No DB schema change

## Request

```json
{
  "candidates": [],
  "context": {
    "requestedMode": "dry-run"
  },
  "storeResults": true,
  "limit": 25
}
```

### Rules

- `candidates` must contain 1-100 items
- `limit` defaults to `25`
- `limit` max is `100`
- `storeResults` defaults to `true`
- invalid payloads return `400`
- empty arrays return `400`

## Response

```json
{
  "total": 0,
  "evaluated": 0,
  "notEvaluable": 0,
  "stored": true,
  "limit": 25,
  "topCandidateId": null,
  "verdicts": [],
  "generatedAt": "2026-01-01T00:00:00.000Z"
}
```

## Behavior

- `evaluateBatch()` ranks with the existing ROI engine
- `not-evaluable` verdicts stay at the bottom
- `evaluateBatchAndMaybeStore()` persists each candidate only when `storeResults=true`
- `storeResults=false` performs no writes
- output is deterministic for the same input and injected clock

## Non-Goals

- No batch scoring changes
- No pagination
- No UI
- No live executor
- No external calls
- No ledger writes
