# Arena Verdict Store Contract

**Current status:** PR8 — implemented, in review.

---

## Intention

The Arena Verdict Store is a lightweight, in-memory key-value cache for `ArenaVerdict` objects produced by the ROI Arena (`roi-arena.ts`). It allows server-side callers to retain verdicts across calls within the same process lifecycle without touching a database.

It answers: *"What did the arena decide about this candidate, and is that decision still fresh enough to use?"*

It never re-evaluates. It never recalculates. It never writes to any external system.

---

## Non-Goals

- No database writes.
- No Supabase migration or schema change.
- No API route or HTTP endpoint.
- No UI surface.
- No ledger writes.
- No calendar access.
- No external HTTP calls.
- No LLM calls.
- No modification of `roi-arena.ts` or the scoring heuristic.
- No singleton required for tests (factory pattern used instead).
- No cross-process persistence (restarts clear everything).

---

## API

### Factory

```typescript
createArenaVerdictStore(options?: ArenaVerdictStoreOptions): ArenaVerdictStoreInstance
```

Returns an isolated store instance. Prefer this over `defaultArenaVerdictStore` in tests and isolated callers.

### Options

```typescript
type ArenaVerdictStoreOptions = {
  ttlMs?: number;      // Time-to-live per entry in milliseconds. Absent = no expiry.
  now?: () => number;  // Clock function. Defaults to Date.now. Override for deterministic tests.
  maxEntries?: number; // Maximum live entries. Absent = unlimited.
};
```

### Stored Record

```typescript
type StoredArenaVerdict = {
  verdict: ArenaVerdict;    // Shallow copy of the verdict — original is not mutated.
  candidateId: string;      // Mirrors verdict.candidateId. Convenience field.
  storedAt: string;         // ISO 8601 timestamp of when store() was called.
  expiresAt: string | null; // ISO 8601 expiry, or null if no TTL was set.
};
```

### Methods

#### `store(verdict: ArenaVerdict): StoredArenaVerdict`

Stores or overwrites the verdict for `verdict.candidateId`.

- Key = `verdict.candidateId`. Overwrite semantics: last write wins.
- Throws if `verdict.candidateId` is empty or not a string.
- `storedAt` is set from `now()` at call time.
- `expiresAt` is `storedAt + ttlMs`, or `null` if no TTL.
- If `maxEntries` is set and the store is at capacity, the entry with the oldest `storedAt` is evicted before insertion. Overwriting an existing `candidateId` does not count as a new entry for capacity purposes.
- Returns the `StoredArenaVerdict` record (shallow copy of verdict).

#### `get(candidateId: string): StoredArenaVerdict | null`

Returns the stored record for `candidateId`, or `null` if absent or expired.

- If the entry is expired, it is removed from the store before returning `null`.

#### `list(): StoredArenaVerdict[]`

Returns all non-expired records, sorted by `storedAt` descending (most recent first).

- Expired entries are purged before the list is built.

#### `clear(): void`

Removes all entries from the store immediately.

#### `size(): number`

Returns the count of non-expired entries. Expired entries are purged before counting.

---

## TTL Behaviour

When `ttlMs` is provided, each entry expires `ttlMs` milliseconds after `store()` was called. Expiry is checked lazily:

- `get()` checks the specific entry and purges it if expired.
- `list()` and `size()` purge all expired entries before returning.

There is no background timer. Memory is reclaimed on the next read/list/size call.

---

## maxEntries Behaviour

When `maxEntries` is set:

- The store will not exceed `maxEntries` live entries.
- Before inserting a brand-new `candidateId`, if `size() >= maxEntries`, the entry with the smallest `storedAt` (oldest) is removed.
- Overwriting an existing `candidateId` does not trigger eviction (it replaces in-place).

---

## Default Store

A module-level singleton is exported for convenience:

```typescript
import { defaultArenaVerdictStore } from "@/server/arena/arena-verdict-store";
```

This store has no TTL and no `maxEntries` limit. It is process-scoped and is cleared on server restart. **Tests must not rely on this singleton** — use `createArenaVerdictStore()` to get an isolated instance.

---

## Known Limits

1. **Ephemeral.** All verdicts are lost on server restart. This is intentional for POC phase.
2. **No cross-request deduplication.** Two simultaneous requests for the same `candidateId` may each trigger a full evaluation before either stores its result.
3. **No size cap by default.** Without `maxEntries`, the store grows unbounded for the process lifetime.
4. **No cross-process sharing.** In a multi-process Node.js deployment (e.g. PM2 cluster, multiple Next.js workers), each process has its own store.
5. **Shallow copy only.** `store()` does a one-level shallow copy of the verdict. Nested objects (e.g. `reasons` array) are shared references. Callers must not mutate returned verdict contents.
6. **No TTL background sweep.** Expired entries accumulate in memory until a read/list/size call purges them.

---

## What Comes Next

| Item | Target |
|---|---|
| Route/API surface — `GET /api/arena/verdicts` | PR9 or later |
| UI/dashboard integration (Moneyboard or standalone) | PR10 or later |
| Supabase persistence for verdict history | PR9 or later |
| Per-workspace store isolation | Post-PR9 |
| TTL tuning and background sweep | Post-PR9 |
| Cross-process store (Redis or shared state) | Enterprise phase |
