# Permission Policy Consolidation

Last updated: 2026-05-21  
Branch: `claude/permission-policy-consolidation`  
Related: `docs/MISSION_CONTROL_RED_TEAM_REVIEW.md` — Risk 1 and Risk 2

---

## What Was Consolidated (PR #15)

### Risk 1 — Dual `PermissionRule` types ✅ RESOLVED

**Before:**

| File | Shape |
|------|-------|
| `src/core/types.ts` | `{ autoApprove: boolean, reason?: string }` — unused |
| `src/features/hq/types.ts` | `{ level: AutonomyLevel, reason: string }` — live, used by seed and engine |

**After:**

`src/core/types.ts` is the single source of truth:
```ts
export type PermissionRule = {
  id: string;
  action: PermissionActionId;
  level: AutonomyLevel;
  requiresConfirmation: boolean;
  reason: string;
};
```

`src/features/hq/types.ts` imports and re-exports it:
```ts
import type { AutonomyLevel, PermissionRule } from "@/core/types";
export type { AutonomyLevel, PermissionRule };
```

`src/server/permissions/permissions.ts` now imports `AutonomyLevel` directly from `@/core/types`.

---

### Risk 2 — Dual `AutonomyLevel` / `MissionAutonomyLevel` ✅ RESOLVED

**Before:**

| File | Type |
|------|------|
| `src/features/hq/types.ts` | `type AutonomyLevel = 0\|1\|2\|3\|4\|5` — live |
| `src/core/types.ts` | `type MissionAutonomyLevel = 0\|1\|2\|3\|4\|5` — redundant |

**After:**

`src/core/types.ts` defines both:
```ts
// Canonical
export type AutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5;

// Mission-domain alias — same scale, kept for Mission type compat
export type MissionAutonomyLevel = AutonomyLevel;
```

`src/features/hq/types.ts` re-exports `AutonomyLevel` from core.  
`Mission.autonomyLevel` remains typed as `MissionAutonomyLevel` — no callsite changes.

---

## Boundary After This PR

| Concept | Canonical location | Features layer |
|---------|-------------------|----------------|
| `AutonomyLevel` | `src/core/types.ts` | Re-exported from `src/features/hq/types.ts` |
| `PermissionRule` | `src/core/types.ts` | Re-exported from `src/features/hq/types.ts` |
| `PermissionPolicy` | `src/core/types.ts` | Not needed in features layer |
| `MissionAutonomyLevel` | `src/core/types.ts` (alias) | Not in features layer |
| `HqModule`, `BoardFigure`, etc. | `src/features/hq/types.ts` | View-model types — stay in features |
| `CalendarEvent`, `CommandResult`, etc. | `src/features/hq/types.ts` | HQ-specific — stay in features |

---

## What Remains — Future Work

The Red Team identified 6 risks. This PR resolves risks 1 and 2.

| Risk | Status |
|------|--------|
| 1. Dual `PermissionRule` types | ✅ Resolved — PR #15 |
| 2. Dual `AutonomyLevel` types | ✅ Resolved — PR #15 |
| 3. Permission engine not wired to `Mission` types | ⏳ Future — PR #16 or #17 |
| 4. Action Ledger has no `missionId` | ⏳ Future — PR #17 |
| 5. Joris brain has no Mission awareness | ⏳ Future — PR #18/19 |
| 6. No idempotency on mission state transitions | ⏳ Future — PR #17 |

**No runtime behavior was changed in this PR.** The permission engine (`checkPermission`), the seed data, and the HQ UI all operate identically — only the type source of truth changed.

---

## Files Changed

| File | Change |
|------|--------|
| `src/core/types.ts` | Added `AutonomyLevel`; updated `PermissionRule` shape; aliased `MissionAutonomyLevel` |
| `src/features/hq/types.ts` | Removed duplicate definitions; added import + re-export from core |
| `src/server/permissions/permissions.ts` | Updated `AutonomyLevel` import to point directly to `@/core/types` |
