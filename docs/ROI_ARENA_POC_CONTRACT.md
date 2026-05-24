# ROI Arena Contract

**Current status:** PR7 + PR7.1 merged — all three kinds evaluated, financial validation active.

---

## Intention

The ROI Arena is a deterministic, pure evaluation harness that ranks missions, ideas, and agent-actions by estimated business value before any execution occurs. It answers: *"Is this worth doing, and in what order?"* — without doing anything.

It is designed to be called by planning surfaces, dashboards, or future approval flows. It never triggers side effects.

---

## Non-Goals

- No public API route.
- No UI.
- No database writes.
- No Supabase migration.
- No ledger writes.
- No calendar access.
- No LLM calls.
- No external HTTP calls.
- No live executor invocation.
- No modification of the PR6 Hermès Execution Guard.
- No invented revenue (caller must supply `assumedRevenueInfluencedCents`).

---

## Contract

### Constants

| Constant | Value | Meaning |
|---|---|---|
| `REVENUE_SANITY_CEILING_CENTS` | `1_000_000_000` | Hard ceiling on `assumedRevenueInfluencedCents` ($10M). Revise upward when business scale justifies it. |

### Types

```typescript
type ArenaCandidateKind = "mission" | "idea" | "agent-action";

type ArenaDecision = "promising" | "marginal" | "reject" | "not-evaluable";

type ArenaCandidate = {
  id: string;
  kind: ArenaCandidateKind;
  title: string;
  workspaceId: string;
  missionId?: string;
  skillId?: string;   // required for agent-action
  agentId?: string;   // required for agent-action
  objective?: string;
  expectedOutput?: string;
  riskLevel?: "low" | "medium" | "high";
  autonomyLevel?: number;
  assumedRevenueInfluencedCents?: number;  // caller-supplied, never invented; must be >= 0 and <= REVENUE_SANITY_CEILING_CENTS
  estimatedCostCents?: number;             // or mapped from Mission.costBudgetCents; must be >= 0
};

type ArenaVerdict = {
  candidateId: string;
  kind: ArenaCandidateKind;
  decision: ArenaDecision;
  score: number;          // 0–100 heuristic
  netValueCents: number | null;
  roiMultiple: number | null;
  executable: boolean;    // true = guard allowed; false = guard denied or kind not executable (idea)
  guardReason?: string;   // present only when the guard explicitly denied — absent for idea kind and absent when guard passes
  reasons: string[];      // human-readable explanation
};
```

### Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `estimateCandidateValue` | `(candidate) → { netValueCents, roiMultiple }` | Deterministic value estimation from caller-supplied data. |
| `evaluateCandidate` | `(candidate, context?) → ArenaVerdict` | Pure evaluation. Calls guard for `mission` and `agent-action`. Returns verdict. No side effects. |
| `rankCandidates` | `(candidates, context?) → ArenaVerdict[]` | Evaluates all candidates, sorts by score descending, `not-evaluable` last. |

---

## Financial Validation

Applied before kind routing for all three kinds. Values outside bounds return `not-evaluable` immediately.

| Field | Rule |
|---|---|
| `assumedRevenueInfluencedCents` | Must be `>= 0` and `<= REVENUE_SANITY_CEILING_CENTS` when provided |
| `estimatedCostCents` | Must be `>= 0` when provided |

Absent fields (`undefined`) are not a validation error — they are caught later as "missing ROI data."

---

## Scoring (POC Heuristic)

All scoring is deterministic and hardcoded. No LLM, no ML model.

### Thresholds

| Decision | Condition |
|----------|-----------|
| `not-evaluable` | Guard denied / unknown skill / missing ROI data / invalid financial input / missing skillId or agentId for agent-action |
| `reject` | `netValueCents < 0`, OR score `< 45` |
| `marginal` | score `45–69` |
| `promising` | score `≥ 70` AND `netValueCents ≥ 0` |

### Score Formula

Base score: **50**

**ROI contribution (+0 to +30):**

| ROI multiple | Points |
|---|---|
| ≥ 5× | +30 |
| ≥ 3× | +22 |
| ≥ 2× | +15 |
| ≥ 1.5× | +10 |
| ≥ 1.0× | +5 |
| cost = 0, revenue > 0 | +25 |

**Risk penalty:**

| riskLevel | Points |
|---|---|
| `high` | −15 |
| `medium` | −8 |
| `low` / unspecified | 0 |

**Autonomy penalty:**

| autonomyLevel | Points |
|---|---|
| 1–2 | 0 |
| 3 | −5 |
| ≥ 4 | −15 (guard will also reject for `mission` and `agent-action`) |

Score is clamped to [0, 100].

### Guard Integration

`evaluateCandidate` calls `canPrepareExecution` (PR6) and `buildDryRunExecutionPlan` (PR6) for `mission` and `agent-action` kinds only. `idea` kind never calls the guard.

- If the guard denies for any reason (effectful skill, unknown skill, live mode, autonomy > 3, wrong agent): verdict = `not-evaluable`, `executable = false`, `guardReason` set.
- If the guard allows: `executable = true`.
- For `idea`: guard is not called, `executable = false` always, `guardReason` is absent.

---

## Kind Support

| Kind | Status | Guard | `executable` |
|------|--------|-------|---|
| `mission` | ✅ Fully implemented | Yes — defaults to `mission.plan` / `joris` | Guard result |
| `idea` | ✅ Fully implemented | No | Always `false` |
| `agent-action` | ✅ Fully implemented | Yes — requires explicit `skillId` + `agentId` | Guard result |

---

## Known Limits

1. **Scoring heuristic is POC-grade.** The ROI multiple bands and penalty weights are first-pass estimates. They need calibration against real outcomes.
2. **No persistence.** Verdicts are ephemeral. No history, no trend analysis.
3. **No UI.** Arena is server-side only. A dashboard can consume it in a future PR.
4. **Revenue ceiling is $10M.** `REVENUE_SANITY_CEILING_CENTS = 1_000_000_000`. Not validated against market reality — adjust for enterprise use.
5. **No multi-criteria weighting.** Strategic alignment, urgency, and opportunity cost are not modelled.

---

## What Comes Next

| Item | Target |
|---|---|
| Persistence of verdicts (in-memory store or Supabase) | PR7.3 or PR8 |
| UI surface (Moneyboard integration or standalone Arena view) | PR8 |
| Revenue validation rules — tighter domain-specific bounds | PR8 |
| Batch evaluation API | PR8 |
| Score calibration from historical outcomes | Post-PR8 |
