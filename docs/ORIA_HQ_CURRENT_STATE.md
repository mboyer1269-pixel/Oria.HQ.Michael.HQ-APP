# Oria HQ — Current State Sync

Last updated: 2026-05-27  
Branch at time of writing: `main` at `b4e95f8`  
Sprint board: GitHub issue [#91](https://github.com/mboyer1269-pixel/Oria.HQ.Michael.HQ-APP/issues/91) (Task Manager)

This document is the **canonical source of truth** for what is live, partial, or locked in Oria HQ after the observability sprint (PRs #88–#92). Historical snapshots (`ORIA_HQ_PHASE2_SNAPSHOT.md`, `MISSION_CONTROL_COMPLETION_SNAPSHOT.md`) remain for archaeology; prefer this file for current operations.

---

## Product decision (active)

```txt
Observer → Journaliser → Approuver → Persister → Auditer → Exécuter
```

Do not advance to runtime HTTP endpoints, VPS provisioning, workers, or live execution until ledger visibility, mission traceability, and documentation stay aligned with production behavior.

---

## Recently merged (observability sprint)

| PR | Merge commit | What shipped |
| --- | --- | --- |
| [#88](https://github.com/mboyer1269-pixel/Oria.HQ.Michael.HQ-APP/pull/88) | `1b7ae5f` | `calendar.book` writes a **decision** ledger event before create, then an **action** event after create; rollback on ledger failure |
| [#89](https://github.com/mboyer1269-pixel/Oria.HQ.Michael.HQ-APP/pull/89) | `df6d669` | `calendar_events` are **workspace-scoped** (migration `0007`, repository isolation) |
| [#90](https://github.com/mboyer1269-pixel/Oria.HQ.Michael.HQ-APP/pull/90) | `de870ba` | Joris `/api/joris/chat` passes `WorkspaceContext`; ledger metadata includes `workspaceId`, `modeId`, `assistantProfileId`, skill/agent ids |
| [#92](https://github.com/mboyer1269-pixel/Oria.HQ.Michael.HQ-APP/pull/92) | `b4e95f8` | **Operator Snapshot** read-only panel on `/hq` (no new routes) |

---

## Module inventory

| Surface | Status | Notes |
| --- | --- | --- |
| `/hq` | Live | Overview + **Operator Snapshot** (`#operator-snapshot`) |
| `/hq/missions` | Live | Pipeline UI; dry-run planning only |
| `/hq/agents` | Live | Registry (7 agents, seed) |
| `/hq/skills` | Live | Catalog (15 skills, seed) |
| `/hq/runtime` | Live | Local prototype status (read-only narrative) |
| `/hq/memory` | Partial | Shell / placeholder |
| `/dashboard/documents` | Live | Owner documents |
| `/contact` | Live | Public contact form |
| `/login` | Live | Supabase auth (optional in dev) |
| Joris chat (`/api/joris/chat`) | Live | Calendar book + ledger; workspace context injected |
| POST `/api/missions/plan` | Live | Dry-run only; `approvalConfirmed` always false |
| POST `/api/missions/execute` | **Does not exist** | By design |
| Calendar API (`/api/calendar/events`) | Live | Workspace-scoped reads/writes via service |
| Arena APIs (`/api/arena/*`) | Live | Evaluation, verdicts, batch (owner-gated) |
| CEO brief (`/api/brief/ceo`) | Live | Brief generation |
| Health (`/api/health`) | Live | Liveness |
| Local runtime (`local-runtime.ts`) | Prototype | `runtime.health.echo` smoke only; **no** runtime API route |
| CI (`.github/workflows/ci.yml`) | Live | `verify` on PRs |

---

## Calendar + ledger (post #88 / #89 / #90)

**Write path** (`src/server/calendar/calendar-service.ts`):

1. Assert assistant has `calendar.book` in `allowedTools` (workspace context).
2. Record ledger event `eventType: "decision"` **before** `calendarRepository.create`.
3. Create calendar event (workspace id on row per #89).
4. Record ledger event `eventType: "action"` with `calendarEventId` metadata.
5. On post-create ledger failure: compensate delete when possible; else `ledgerStatus: "failed"` on partial state.

**Metadata** (`src/server/actions/action-ledger-repository.ts`): `toWorkspaceLedgerMetadata` / `withWorkspaceActionMetadata` merge workspace, mode, skill, agent, mission, and event type into ledger rows (local and Supabase paths).

**Smoke**: `npm run smoke:joris` asserts ledger metadata matches command result (`workspaceId`, `modeId`, `assistantProfileId`, `calendarEventId`).

**Tests**: `npm run test:calendar-ledger-atomicity`, `npm run test:ledger-events`.

---

## Operator Snapshot (post #92)

Read-only **server component** on `/hq` — no execution, no new API.

| File | Role |
| --- | --- |
| `src/features/hq/operator-snapshot.ts` | Pure counts + `calendar.book` ledger contract check |
| `src/features/hq/components/operator-snapshot.tsx` | UI panels |
| `src/app/hq/page.tsx` | Renders `<OperatorSnapshot />`; nav link `#operator-snapshot` |

**Panels:** Runtime Mode, Ledger Health, Guardrails Health, Mission Snapshot, Agent Snapshot, Skills Snapshot.

Data sources: `getActiveWorkspaceContext()`, `listMissionsForWorkspace()`, `agentRegistry`, `skillsCatalog`, runtime constants — all read-only.

---

## Mission Control

| Component | Status |
| --- | --- |
| `/hq/missions` UI | Live |
| Joris `mission.plan` | Live (dry-run) |
| POST `/api/missions/plan` | Live (10-gate sequence; idempotency in-memory) |
| `MissionApprovalRecord` contract | Defined in TypeScript |
| Approval persistence (Supabase) | Not applied — see `MISSION_PERSISTENCE_SCHEMA_PROPOSAL.md` |
| Live executor | Locked |

Detail: `docs/MISSION_CONTROL_OPERATING_MANUAL.md`.

---

## Runtime and execution guardrails

| Capability | Status |
| --- | --- |
| `execution-guard` | Live — rejects live mode, client approval, unsupported skills |
| Local runtime echo | Live — `npm run smoke:runtime` |
| Runtime HTTP endpoint | **Not exposed** |
| VPS / worker | **Not deployed** |

Detail: `docs/LOCAL_RUNTIME_PROTOTYPE.md`, `docs/ORIA_RUNTIME_CONTRACT.md`.

---

## Database migrations (repo; apply only with explicit mandate)

| File | Purpose |
| --- | --- |
| `0001_missions.sql` | Missions tables (proposal-era) |
| `0002_typed_ledger_events.sql` | Typed ledger events |
| `0003_arena_verdicts.sql` | Arena verdicts |
| `0004_arena_verdicts_hardening.sql` | Arena hardening |
| `0005_missions_rls.sql` | Missions RLS |
| `0006_arena_verdicts_restrictive_rls.sql` | Restrictive arena RLS (#87) |
| `0007_calendar_events_workspace_scope.sql` | Workspace column on calendar (#89) |

Do not edit `db/schema.sql` directly. Do not apply migrations without staging review and CEO mandate.

---

## Safe vs locked (operator view)

**Safe today**

- Use `/hq` and Operator Snapshot for read-only health.
- Book calendar via Joris (local or Supabase per env).
- Request dry-run mission plans (Joris or POST `/api/missions/plan`).
- Browse agents, skills, missions, arena surfaces as owner.
- Run all validation scripts locally (no production side effects when `NODE_ENV` dev + local fallback).

**Locked / not available**

- Live mission execution or `approvalConfirmed: true` from client.
- Runtime live mode, VPS, workers, external sends without approval workflow.
- New migrations or schema edits without explicit mandate.
- Treating board PR numbers as GitHub PR numbers without checking (e.g. board “PR #90” was Operator Snapshot; shipped as GitHub **#92**).

---

## Validation commands

Required before declaring docs or product work complete:

```powershell
npm run typecheck
npm run lint
npm run build
npm run smoke:joris
```

Recommended for ledger/runtime/calendar changes:

```powershell
npm run smoke:runtime
npm run test:execution-guard
npm run test:ledger-events
npm run test:calendar-ledger-atomicity
git diff --check
```

---

## Recommended next sequence (from board #91)

| Priority | Track | Type | Depends on |
| --- | --- | --- | --- |
| 1 | Current State Sync | Docs | — (this document) |
| 2 | Ledger Activity Read Model | UI/read path | State sync merged |
| 3 | Mission ↔ Ledger Traceability UI | UI/read path | Ledger visibility |
| 4 | Mission persistence | Schema + wiring | CEO mandate + staging |
| 5 | Runtime echo endpoint audit | Docs/review | Persistence clarity |
| 6 | Memory vault / Money cockpit | Plan only | Later phases |

---

## Reference docs (by topic)

| Topic | Doc |
| --- | --- |
| Mission Control | `MISSION_CONTROL_OPERATING_MANUAL.md` |
| Agents + skills | `ORIA_AGENT_OPERATING_MANUAL.md` |
| Phase 2 history | `ORIA_HQ_PHASE2_SNAPSHOT.md` |
| Repo consolidation | `REPO_CONSOLIDATION.md` |
| Product layers | `PRODUCT_MAP.md` |
| Phased roadmap | `ROADMAP.md` |
| Supabase setup | `supabase-setup.md` |
| Local runtime | `LOCAL_RUNTIME_PROTOTYPE.md` |

---

## Changelog

| Date | Change |
| --- | --- |
| 2026-05-27 | Initial sync after PRs #88, #89, #90, #92 |
