# Mission Model Proposal

Last updated: 2026-05-21

## Purpose

Mission is the proposed unit of supervised work in Oria. It gives Joris, Hermes agents, Claude Code / AgentOS, and future runtimes a shared contract for what should be done, who owns it, how risky it is, what output is expected, and whether approval is required.

This proposal does not add storage, endpoints, UI, or runtime behavior.

## Mission

```ts
export type Mission = {
  id: string;
  workspaceId: WorkspaceId;
  modeId: string;
  title: string;
  objective: string;
  assignedAgentId: AssistantProfileId;
  autonomyLevel: MissionAutonomyLevel;
  status: MissionStatus;
  riskLevel: MissionRiskLevel;
  input: Record<string, unknown>;
  expectedOutput: string;
  requiresApproval: boolean;
  costBudgetCents?: number;
  result?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};
```

## MissionStatus

```ts
export type MissionStatus =
  | "draft"
  | "queued"
  | "running"
  | "needs_approval"
  | "completed"
  | "failed"
  | "cancelled";
```

## MissionRiskLevel

```ts
export type MissionRiskLevel = "low" | "medium" | "high";
```

## MissionAutonomyLevel

```ts
export type MissionAutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5;
```

Suggested interpretation:

- `0`: disabled or forbidden;
- `1`: read-only or analysis;
- `2`: internal draft;
- `3`: supervised reversible write;
- `4`: external or shared action requiring confirmation;
- `5`: financial, publish, client delivery, credential, or irreversible action.

## MissionResult

Mission result should stay structured but generic:

```ts
export type MissionResult = {
  missionId: string;
  status: Extract<MissionStatus, "completed" | "failed" | "cancelled">;
  output: Record<string, unknown>;
  summary: string;
  error?: string;
  completedAt: string;
};
```

## MissionApprovalRequirement

```ts
export type MissionApprovalRequirement = {
  missionId: string;
  required: boolean;
  reason: string;
  policyId?: string;
  evidenceRequired: string[];
  approvedBy?: string;
  approvedAt?: string;
};
```

## Relationship Between Mission, ActionQueueItem, PermissionPolicy, And ActionLedger

- **Mission** defines the objective and expected outcome.
- **PermissionPolicy** decides whether the mission can run, needs approval, or is forbidden.
- **ActionQueueItem** represents a proposed executable step inside or after the mission.
- **ActionLedger** records what was prepared, approved, executed, skipped, failed, or completed.

Mission should not replace the action ledger. The ledger is the audit trail. Mission is the work object.

## Example JSON

```json
{
  "id": "mission_market_brief_2026_05_21",
  "workspaceId": "michael-hq",
  "modeId": "suivia",
  "title": "Prepare weekly Signal-to-Client demo brief",
  "objective": "Collect public market signals for aesthetic clinics in Quebec and Ontario, draft a client-ready briefing, and flag claims that need human review.",
  "assignedAgentId": "briefing-analyst",
  "autonomyLevel": 2,
  "status": "queued",
  "riskLevel": "medium",
  "input": {
    "territory": ["QC", "ON"],
    "vertical": "medical aesthetics",
    "sourcePolicy": "public_sources_only"
  },
  "expectedOutput": "A draft briefing with source citations, market tension score, recommended actions, and confidence notes.",
  "requiresApproval": true,
  "costBudgetCents": 500,
  "createdAt": "2026-05-21T14:00:00.000Z",
  "updatedAt": "2026-05-21T14:00:00.000Z"
}
```

## Safety Rules

- A mission cannot bypass permissions.
- External send, publish, billing, purchases, client delivery, credential access, and irreversible writes require approval.
- Raw secrets and `.env` contents must never be placed in `input`, `result`, logs, or prompts.
- A mission must keep `workspaceId` explicit.
- Mission outputs must be source-labeled when used for client or revenue decisions.
- Failed and cancelled missions must remain auditable.
- Mission storage must not be added until a migration and repository design are approved.
