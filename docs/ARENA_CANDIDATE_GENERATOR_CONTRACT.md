# Arena Candidate Generator Contract

## Goal

Standardize Arena candidates from the existing mission source so Arena can rank real work without manual candidate assembly.

## Source of truth

- Missions are the only implemented source for PR12.
- `ideas` are not implemented because no real repo source exists yet.
- The generator is server-side only and consumes injected mission data or the mission repository result.

## Mapping

- `candidate.id` = `mission.id`
- `candidate.kind` = `"mission"`
- `candidate.workspaceId` = server workspace id
- `candidate.title` = `mission.title`
- `candidate.objective` = `mission.objective`
- `candidate.expectedOutput` = `mission.expectedOutput`
- `candidate.missionId` = `mission.id`
- `candidate.agentId` = `mission.assignedAgentId`
- `candidate.autonomyLevel` = `mission.autonomyLevel`
- `candidate.riskLevel` = `mission.riskLevel`
- `candidate.estimatedCostCents` = `mission.costBudgetCents` when present
- `candidate.assumedRevenueInfluencedCents` is never invented

## Eligibility

- Exclude terminal missions: `completed`, `failed`, `cancelled`
- Exclude `archived` / `deleted` if they appear in future data
- `includeNotReady: true` can include `draft` missions
- The output order is deterministic: `createdAt` ascending, then `id`

## Route

- `GET /api/arena/candidates`
- owner auth required
- workspace resolved server-side
- no persistence, no batch execution, no scoring change

## Notes

- The generator is intentionally conservative: it standardizes inputs for Arena, but it does not fabricate ROI numbers or reach for external data.
