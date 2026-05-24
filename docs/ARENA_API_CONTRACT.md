# Arena API Contract

**Current status:** PR8.2 — implemented, in review.

---

## Intention

The Arena API exposes the ROI evaluation service over HTTP. It allows any server-side caller (or future dashboard) to evaluate candidates, retrieve verdicts, and list recent arena decisions without touching the evaluation engine or the store directly.

All verdicts are held in the process-scoped in-memory store (PR8). They are ephemeral — cleared on server restart.

---

## Non-Goals

- No database writes.
- No Supabase.
- No UI (routes only).
- No ledger writes.
- No calendar access.
- No external HTTP calls.
- No LLM calls.
- No live executor invocation.
- No real effects of any kind.
- No batch evaluation — reserved for PR10.
- No modification of the scoring heuristic.
- No authentication layer (internal API, trusted callers assumed — add auth at PR9+).

---

## Routes

### POST `/api/arena/evaluate`

Evaluates a candidate and stores the resulting verdict in the in-memory store.

**Request body:**
```json
{
  "candidate": {
    "id": "cand-123",
    "kind": "mission",
    "title": "Launch campaign",
    "workspaceId": "ws-abc",
    "skillId": "board.consult",
    "agentId": "joris",
    "autonomyLevel": 1,
    "riskLevel": "low",
    "assumedRevenueInfluencedCents": 50000,
    "estimatedCostCents": 5000
  },
  "context": { "requestedMode": "dry-run" }
}
```

`context` is optional. `candidate` fields mirror `ArenaCandidate` from `roi-arena.ts`.

**Response 200:**
```json
{
  "candidateId": "cand-123",
  "verdict": { "decision": "promising", "score": 80, ... },
  "storedAt": "2026-05-24T14:00:00.000Z",
  "expiresAt": null
}
```

All decisions — including `not-evaluable` — return 200. The decision field communicates the arena result.

**Response 400** — invalid or missing required fields:
```json
{ "error": "Invalid request body.", "issues": { ... } }
```

---

### GET `/api/arena/verdicts`

Returns all non-expired verdicts from the in-memory store.

**Response 200:**
```json
{
  "verdicts": [ { "candidateId": "...", "verdict": {...}, "storedAt": "..." }, ... ],
  "total": 3
}
```

Returns an empty array if no verdicts are stored. No pagination (in-memory store is process-scoped and bounded by `maxEntries` if configured).

---

### GET `/api/arena/verdicts/[candidateId]`

Returns a specific verdict by candidateId.

**Response 200** — verdict found:
```json
{ "candidateId": "cand-123", "verdict": { ... }, "storedAt": "...", "expiresAt": null }
```

**Response 404** — verdict absent or expired:
```json
{ "error": "No verdict found for candidateId: cand-123" }
```

---

## Input Validation

Schema defined in `src/server/arena/arena-api-schema.ts` using Zod.

| Field | Rule |
|---|---|
| `candidate.id` | Required, non-empty string |
| `candidate.kind` | Required, `"mission" \| "idea" \| "agent-action"` |
| `candidate.title` | Required, max 500 chars |
| `candidate.workspaceId` | Required, non-empty string |
| `candidate.autonomyLevel` | Optional, integer 1–5 |
| `candidate.assumedRevenueInfluencedCents` | Optional, integer |
| `candidate.estimatedCostCents` | Optional, integer |

Financial bound enforcement (≥0, ≤ceiling) is handled by the arena engine, not the API schema.

---

## Known Limits

1. **No authentication.** Routes are currently open. Add auth middleware (Supabase session check) at PR9.
2. **Ephemeral store.** Verdicts are lost on server restart. Persist at PR9.
3. **No batch endpoint.** Single-candidate evaluation only. Batch reserved for PR10.
4. **No pagination.** `GET /verdicts` returns all live entries. Add pagination when store grows.
5. **Shared singleton.** Routes use `defaultArenaEvaluationService` — no per-request isolation.

---

## What Comes Next

| Item | Target |
|---|---|
| Authentication (Supabase session guard) | PR9 |
| Supabase persistence for verdict history | PR9 |
| Batch evaluation endpoint — `POST /api/arena/batch` | PR10 |
| UI/dashboard integration | PR10+ |
| Pagination for `GET /verdicts` | PR10+ |
