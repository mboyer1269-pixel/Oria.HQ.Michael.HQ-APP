# Mission Executor Idempotency + Rate Limit Contract

Last updated: 2026-05-21  
Branch: `claude/mission-executor-idempotency-contract`  
File: `src/server/missions/idempotency-contract.ts`

---

## What This Is

A pure-function contract that defines the typed shapes and validation logic for
two executor safety mechanisms:

1. **Idempotency** — prevents duplicate execution of the same attempt
2. **Rate limiting** — prevents per-workspace execution flooding

**No I/O. No writes. No timers. No shared state.**

The enforcement layer (in-memory store or Redis TTL window) is the caller's
responsibility and is out of scope until PR #19D (dry-run endpoint).

---

## Why These Are Required

From `MISSION_EXECUTOR_READINESS_REVIEW.md` §3.4 and §3.5:

> **§3.4 — Missing idempotency key:** Two concurrent calls with the same mission
> both return `allowed: true` and both would execute. No deduplication exists.

> **§3.5 — Missing rate limiting:** A misconfigured caller looping on
> `buildDryRunMissionExecutionPlan()` could flood the system with execution attempts.

---

## Types

### `MissionIdempotencyKey`

```ts
type MissionIdempotencyKey = string;
// Recommended format: "<workspaceId>:<missionId>:<requestId>"
// Example: "michael-hq:msn_1:req_abc123"
```

### `MissionIdempotencyRecord`

```ts
type MissionIdempotencyRecord = {
  key: MissionIdempotencyKey;
  missionId: string;
  workspaceId: string;
  firstSeenAt: string;   // ISO timestamp — when this key was first seen
  expiresAt: string;     // ISO timestamp — after which the key may be reused
};
```

### `MissionIdempotencyCheckResult`

```ts
type MissionIdempotencyCheckResult =
  | { duplicate: false }
  | { duplicate: true; firstSeenAt: string; expiresAt: string };
```

### `MissionRateLimitConfig`

```ts
type MissionRateLimitConfig = {
  maxAttempts: number;    // Default: 10
  windowSeconds: number;  // Default: 60
};

const DEFAULT_RATE_LIMIT_CONFIG: MissionRateLimitConfig = {
  maxAttempts: 10,
  windowSeconds: 60,
};
```

### `MissionRateLimitRecord`

```ts
type MissionRateLimitRecord = {
  workspaceId: string;
  attemptTimestamps: string[];  // ISO timestamps within the current window
  windowSeconds: number;
};
```

### `MissionRateLimitCheckResult`

```ts
type MissionRateLimitCheckResult =
  | { allowed: true;  attemptsInWindow: number; remainingAttempts: number }
  | { allowed: false; attemptsInWindow: number; retryAfterSeconds: number };
```

### `MissionExecutionAttemptInput`

```ts
type MissionExecutionAttemptInput = {
  missionId: string;
  workspaceId: string;
  idempotencyKey: MissionIdempotencyKey;  // required — executor must reject if absent
};
```

### `MissionExecutionAttemptValidation`

```ts
type MissionExecutionAttemptValidation =
  | { valid: true }
  | {
      valid: false;
      reason: "duplicate_key" | "rate_limit_exceeded" | "missing_idempotency_key";
      detail: MissionIdempotencyCheckResult | MissionRateLimitCheckResult | null;
    };
```

---

## Functions

### `createIdempotencyRecord(input, ttlSeconds?)`

```ts
function createIdempotencyRecord(
  input: MissionExecutionAttemptInput,
  ttlSeconds?: number,   // default: 300 (5 minutes)
): MissionIdempotencyRecord
```

Shapes a new idempotency record for a first-seen key. The caller must persist it
and check for existing records before calling this function.

**Example:**

```ts
const record = createIdempotencyRecord({
  missionId: "msn_1",
  workspaceId: "michael-hq",
  idempotencyKey: "michael-hq:msn_1:req_abc123",
});
// → { key: "michael-hq:msn_1:req_abc123", firstSeenAt: "...", expiresAt: "..." }
```

---

### `checkIdempotencyRecord(record, now?)`

```ts
function checkIdempotencyRecord(
  record: MissionIdempotencyRecord,
  now?: Date,
): MissionIdempotencyCheckResult
```

Returns `duplicate: true` if the record is still within its TTL window.
Returns `duplicate: false` if the TTL has expired — the caller should then
delete the old record and treat the incoming key as a new attempt.

**Example — duplicate:**

```ts
checkIdempotencyRecord(activeRecord);
// → { duplicate: true, firstSeenAt: "...", expiresAt: "..." }
```

**Example — expired:**

```ts
checkIdempotencyRecord({ ...record, expiresAt: "2026-05-20T00:00:00.000Z" });
// → { duplicate: false }
```

---

### `checkRateLimit(record, config?, now?)`

```ts
function checkRateLimit(
  record: MissionRateLimitRecord,
  config?: MissionRateLimitConfig,
  now?: Date,
): MissionRateLimitCheckResult
```

Counts attempts within the rolling window. Returns `allowed: true` with
remaining capacity, or `allowed: false` with a `retryAfterSeconds` delay
computed from when the oldest in-window attempt will roll out.

**Example — allowed:**

```ts
checkRateLimit({ workspaceId: "michael-hq", attemptTimestamps: ["..."], windowSeconds: 60 });
// → { allowed: true, attemptsInWindow: 1, remainingAttempts: 9 }
```

**Example — exceeded:**

```ts
checkRateLimit({ workspaceId: "michael-hq", attemptTimestamps: Array(10).fill(recentTs), windowSeconds: 60 });
// → { allowed: false, attemptsInWindow: 10, retryAfterSeconds: 42 }
```

---

### `validateExecutionAttempt(input, idempotencyRecord, rateLimitRecord, config?, now?)`

```ts
function validateExecutionAttempt(
  input: Partial<MissionExecutionAttemptInput>,
  existingIdempotencyRecord: MissionIdempotencyRecord | null | undefined,
  rateLimitRecord: MissionRateLimitRecord,
  config?: MissionRateLimitConfig,
  now?: Date,
): MissionExecutionAttemptValidation
```

Combined validator — runs all three gates in order and returns a single result:

| Gate | Check | Failure reason |
|------|-------|----------------|
| 1 | `idempotencyKey` is present and non-empty | `"missing_idempotency_key"` |
| 2 | No active duplicate record for this key | `"duplicate_key"` |
| 3 | Workspace has not exceeded rate limit | `"rate_limit_exceeded"` |

**Example — valid:**

```ts
validateExecutionAttempt(
  { missionId: "msn_1", workspaceId: "michael-hq", idempotencyKey: "michael-hq:msn_1:req_abc" },
  null,   // no existing record → not a duplicate
  { workspaceId: "michael-hq", attemptTimestamps: [], windowSeconds: 60 },
);
// → { valid: true }
```

**Example — duplicate:**

```ts
validateExecutionAttempt(attempt, activeIdempotencyRecord, rateLimitRecord);
// → { valid: false, reason: "duplicate_key", detail: { duplicate: true, ... } }
```

**Example — missing key:**

```ts
validateExecutionAttempt({ missionId: "msn_1", workspaceId: "michael-hq" }, null, rateLimitRecord);
// → { valid: false, reason: "missing_idempotency_key", detail: null }
```

---

## How the Executor Must Use This

The dry-run endpoint (PR #19D) and live executor (PR #21) must call
`validateExecutionAttempt()` before passing anything to `buildDryRunMissionExecutionPlan()`:

```ts
// 1. Validate idempotency + rate limit
const validation = validateExecutionAttempt(
  { missionId, workspaceId, idempotencyKey },
  await idempotencyStore.find(idempotencyKey),   // null if first seen
  await rateLimitStore.findOrCreate(workspaceId),
);

if (!validation.valid) {
  return { blocked: true, reason: validation.reason, detail: validation.detail };
}

// 2. Record the attempt (persist idempotency key + rate limit timestamp)
await idempotencyStore.save(createIdempotencyRecord({ missionId, workspaceId, idempotencyKey }));
await rateLimitStore.appendTimestamp(workspaceId, new Date().toISOString());

// 3. Now safe to proceed to the executor contract
const plan = buildDryRunMissionExecutionPlan({ mission, mode: "dry_run", approvalConfirmed });
```

---

## What This PR Does NOT Do

| Item | Status | Next PR |
|------|--------|---------|
| In-memory or Redis store for idempotency keys | ❌ Not included | #19D |
| Rate limit store (per workspace) | ❌ Not included | #19D |
| Dry-run POST endpoint | ❌ Not included | #19D |
| Modify `buildDryRunMissionExecutionPlan()` | ❌ Not modified | Not needed yet |
| Mission persistence | ❌ Not included | #19C (Michael sign-off required) |
