# ROI Arena POC Contract

**PR7 — Strict Proof of Concept**
**Status:** POC — evaluation only, no execution, no persistence.

---

## Intention

The ROI Arena is a deterministic, pure evaluation harness that ranks missions, ideas, and agent-actions by estimated business value before any execution occurs. It answers: *"Is this worth doing, and in what order?"* — without doing anything.

PR7 is designed to be called by planning surfaces, dashboards, or future approval flows. It never triggers side effects.

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
  skillId?: string;
  agentId?: string;
  objective?: string;
  expectedOutput?: string;
  riskLevel?: "low" | "medium" | "high";
  autonomyLevel?: number;
  assumedRevenueInfluencedCents?: number;  // caller-supplied, never invented
  estimatedCostCents?: number;             // or mapped from Mission.costBudgetCents
};

type ArenaVerdict = {
  candidateId: string;
  kind: ArenaCandidateKind;
  decision: ArenaDecision;
  score: number;          // 0–100 heuristic
  netValueCents: number | null;
  roiMultiple: number | null;
  executable: boolean;    // true = guard allowed; false = guard denied
  guardReason?: string;   // populated when guard denies
  reasons: string[];      // human-readable explanation
};
```

### Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `estimateCandidateValue` | `(candidate) → { netValueCents, roiMultiple }` | Deterministic value estimation from caller-supplied data. |
| `evaluateCandidate` | `(candidate, context?) → ArenaVerdict` | Pure evaluation. Calls guard. Returns verdict. No side effects. |
| `rankCandidates` | `(candidates, context?) → ArenaVerdict[]` | Evaluates all candidates, sorts by score descending, `not-evaluable` last. |

---

## Scoring (POC Heuristic)

All scoring is deterministic and hardcoded. No LLM, no ML model.

### Thresholds

| Decision | Condition |
|----------|-----------|
| `not-evaluable` | Guard denied / unknown skill / missing ROI data / unsupported kind |
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
| ≥ 4 | −15 (guard will also reject) |

Score is clamped to [0, 100].

### Guard Integration

`evaluateCandidate` calls `canPrepareExecution` (PR6) and `buildDryRunExecutionPlan` (PR6).

- If the guard denies for any reason (effectful skill, unknown skill, live mode, autonomy > 3, wrong agent): verdict = `not-evaluable`, `executable = false`, `guardReason` populated.
- If the guard allows: `executable = true`.

---

## Kind Support

| Kind | Status |
|------|--------|
| `mission` | Fully implemented |
| `idea` | Returns `not-evaluable` (POC) |
| `agent-action` | Returns `not-evaluable` (POC) |

---

## Known Limits

1. **Scoring heuristic is POC-grade.** The ROI multiple bands and penalty weights are first-pass estimates. They need calibration against real outcomes.
2. **No persistence.** Verdicts are ephemeral. No history, no trend analysis.
3. **No UI.** Arena is server-side only. A dashboard can consume it in PR7.1.
4. **Revenue not validated.** The caller supplies `assumedRevenueInfluencedCents`. The arena trusts it without validation.
5. **Only `mission` kind is scored.** `idea` and `agent-action` return `not-evaluable`.
6. **No multi-criteria weighting.** Strategic alignment, urgency, and opportunity cost are not modelled.

---

## What PR7.1 Will Add

- Calibrated score weights from historical mission outcomes.
- Full `idea` and `agent-action` evaluation paths.
- Persistence of verdicts to a read-only verdicts table.
- A minimal UI surface (Moneyboard integration or standalone Arena view).
- Revenue validation rules (sanity bounds on `assumedRevenueInfluencedCents`).
- Batch evaluation API for mission queues.
