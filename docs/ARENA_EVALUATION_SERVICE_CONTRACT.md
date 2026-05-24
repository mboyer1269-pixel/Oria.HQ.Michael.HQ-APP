# Arena Evaluation Service Contract

**Current status:** PR8.1 — implemented, in review.

---

## Intention

The Arena Evaluation Service is a thin composition layer that connects the ROI evaluation engine (`roi-arena.ts`) with the in-memory verdict store (`arena-verdict-store.ts`). It answers: *"Evaluate this candidate and remember what you decided."*

It allows server-side callers (future API routes, planning surfaces) to evaluate candidates and retain their verdicts without reaching the store directly. All dependencies are injected for testability.

---

## Non-Goals

- No database writes.
- No Supabase.
- No API route or HTTP endpoint.
- No UI surface.
- No ledger writes.
- No calendar access.
- No external HTTP calls.
- No LLM calls.
- No modification of the scoring heuristic in `roi-arena.ts`.
- No modification of `arena-verdict-store.ts`.
- No batch evaluation — reserved for PR10.
- No cross-process persistence — store is ephemeral.

---

## API

### Factory

```typescript
createArenaEvaluationService(deps?: ArenaEvaluationServiceDeps): ArenaEvaluationServiceInstance
```

Returns an isolated service instance. All dependencies are optional and fall back to process-scoped defaults.

### Dependencies (injected)

```typescript
type ArenaEvaluationServiceDeps = {
  store?: StoreInstance;              // defaults to defaultArenaVerdictStore
  evaluateCandidate?: EvaluateFn;    // defaults to evaluateCandidate from roi-arena.ts
};
```

Injecting dependencies makes the service fully testable without touching module-level singletons.

### Methods

#### `evaluateAndStore(candidate, context?): StoredArenaVerdict`

Evaluates a candidate using the injected `evaluateCandidate` function, then stores the resulting verdict in the injected store.

- All decisions are stored — including `not-evaluable`. Callers should not filter before storing.
- Returns the `StoredArenaVerdict` record (shallow copy of verdict + `storedAt` / `expiresAt`).
- The original verdict object produced by the evaluator is not mutated.
- Overwrites the previous verdict for the same `candidateId` (last-write-wins).

#### `getVerdict(candidateId): StoredArenaVerdict | null`

Returns the stored verdict for `candidateId`, or `null` if absent or expired (delegates to `store.get`).

#### `listVerdicts(): StoredArenaVerdict[]`

Returns all non-expired stored verdicts, most recent first (delegates to `store.list`).

#### `clearVerdicts(): void`

Clears all verdicts from the in-memory store (delegates to `store.clear`). No effect on any external system.

---

## Default Service

A module-level singleton is exported for production server-side callers:

```typescript
import { defaultArenaEvaluationService } from "@/server/arena/arena-evaluation-service";
```

This service uses `defaultArenaVerdictStore` (no TTL, no maxEntries). It is process-scoped and cleared on server restart. **Tests must not rely on this singleton** — use `createArenaEvaluationService({ store, evaluateCandidate })`.

---

## Design Notes

### Why a service layer?

The service exists to:
1. Keep route handlers thin — they call `evaluateAndStore`, not `evaluateCandidate` + `store.store`.
2. Allow future middleware (audit log, dedup, rate limiting) to be inserted in one place.
3. Enable clean test isolation via dependency injection.

### Why no `evaluateRankAndStore`?

Batch evaluation is scoped to PR10. Including it here would expand the scope and require changes later. PR10 will add a `createArenaBatchService` that composes this service.

---

## Known Limits

1. **Ephemeral.** Verdicts are cleared on server restart. Supabase persistence is PR9.
2. **No deduplication guard.** Evaluating the same candidate twice overwrites the first verdict.
3. **No audit trail.** No history of how a verdict changed over time.
4. **No concurrency guard.** Two concurrent calls for the same `candidateId` may produce a race; last write wins.

---

## What Comes Next

| Item | Target |
|---|---|
| API routes — `POST /api/arena/evaluate`, `GET /api/arena/verdicts` | PR8.2 |
| Supabase persistence for verdict history | PR9 |
| Batch evaluation + ranking — `POST /api/arena/batch` | PR10 |
| UI/dashboard integration | PR10+ |
