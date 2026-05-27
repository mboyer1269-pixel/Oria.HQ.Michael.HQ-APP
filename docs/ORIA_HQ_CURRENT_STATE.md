# Oria HQ — Current State Sync

Last updated: 2026-05-27  
Branch at time of writing: `main` at `4af014c`  
Sprint board: GitHub issue [#91](https://github.com/mboyer1269-pixel/Oria.HQ.Michael.HQ-APP/issues/91) (Task Manager)

This document is the **canonical source of truth** for what is live, partial, or locked in Oria HQ after the observability sprint (PRs #88–#92) and the mission-draft gate (PRs #94–#96). Historical snapshots (`ORIA_HQ_PHASE2_SNAPSHOT.md`, `MISSION_CONTROL_COMPLETION_SNAPSHOT.md`) remain for archaeology; prefer this file for current operations.

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
| [#94](https://github.com/mboyer1269-pixel/Oria.HQ.Michael.HQ-APP/pull/94) | `0ac5704` | **Ledger Activity** read-only panel on `/hq` (`#ledger-activity`) |
| [#95](https://github.com/mboyer1269-pixel/Oria.HQ.Michael.HQ-APP/pull/95) | `9c91561` | Mission ↔ ledger traceability in Ledger Activity (**Liée** / **Orphelin** / **Réf. inconnue**) |
| [#96](https://github.com/mboyer1269-pixel/Oria.HQ.Michael.HQ-APP/pull/96) | `4af014c` | **Joris → Mission Draft** gate before confirmed `calendar.book` (pending draft + explicit confirm) |

---

## Module inventory

| Surface | Status | Notes |
| --- | --- | --- |
| `/hq` | Live | Overview + **Operator Snapshot** (`#operator-snapshot`) + **Ledger Activity** (`#ledger-activity`) |
| `/hq/missions` | Live | Pipeline UI; dry-run planning only |
| `/hq/agents` | Live | Registry (7 agents, seed) |
| `/hq/skills` | Live | Catalog (15 skills, seed) |
| `/hq/runtime` | Live | Local prototype status (read-only narrative) |
| `/hq/memory` | Partial | Shell / placeholder |
| `/dashboard/documents` | Live | Owner documents |
| `/contact` | Live | Public contact form |
| `/login` | Live | Supabase auth (optional in dev) |
| Joris chat (`/api/joris/chat`) | Live | Mission draft proposal + confirm gate for `calendar.book`; `mission.plan` dry-run; workspace context injected |
| POST `/api/missions/plan` | Live | Dry-run only; `approvalConfirmed` always false |
| POST `/api/missions/execute` | **Does not exist** | By design |
| Calendar API (`/api/calendar/events`) | Live | Workspace-scoped reads/writes via service |
| Arena APIs (`/api/arena/*`) | Live | Evaluation, verdicts, batch (owner-gated) |
| CEO brief (`/api/brief/ceo`) | Live | Brief generation |
| Health (`/api/health`) | Live | Liveness |
| Local runtime (`local-runtime.ts`) | Prototype | `runtime.health.echo` smoke only; **no** runtime API route |
| CI (`.github/workflows/ci.yml`) | Live | `verify` on PRs |

---

## Joris → Mission Draft (post #96)

Actionable `calendar.book` intents no longer create a calendar event on the first message. Joris runs a **two-step controlled flow** (v1: `calendar.book` only).

| Step | User action | Joris behavior |
| --- | --- | --- |
| 1 — Proposal | Natural-language booking (e.g. « Book RDV demain 10h00 ») | Intent `mission.draft`; structured **Mission Draft** preview; `requiresConfirmation: true`; **no** `calendarEvent` |
| 2 — Confirm | Explicit short reply (`confirme`, `oui`, `go`) or cancel (`annule`) | On valid confirm: create **local** mission draft (`status: draft`) + `calendar.book` with `missionId` |

**Pending draft session** (`src/server/missions/mission-draft-session.ts`):

- Keyed by `workspaceId` + `userId` (one pending draft per session).
- TTL **10 minutes**; expired drafts must be re-proposed.
- Confirmation words only apply when a non-expired pending draft exists for that session.
- Idempotent re-confirm: cached result per `pendingDraftId` avoids double booking.

**Persistence boundaries:**

- Mission drafts: **local in-memory only** (`mission-draft-repository.ts`) — merged into mission list when `source=local`; **no** Supabase mission write.
- Pending drafts: in-memory session store (dev/local fallback); not durable across restarts.
- **No** live executor; **no** mission execution beyond draft creation + calendar write.

**Implementation files:** `mission-draft-builder.ts`, `mission-draft-confirmation.ts`, `mission-draft-session.ts`, `brain.ts` (`handleMissionDraftReply` before intent routing).

**Smoke**: `npm run smoke:joris` — message 1 → `mission.draft`; message 2 `confirme` → `calendar.book` + `missionId` on ledger.

**Tests**: `npm run test:mission-draft`.

---

## Calendar + ledger (post #88 / #89 / #90 / #96)

**Joris entry path:** booking requests go through the Mission Draft gate (#96) before `createCalendarEvent` is called.

**Write path** (`src/server/calendar/calendar-service.ts`), after human confirm:

1. Assert assistant has `calendar.book` in `allowedTools` (workspace context).
2. Record ledger event `eventType: "decision"` **before** `calendarRepository.create` — includes `missionId` when provided (#96).
3. Create calendar event (workspace id on row per #89).
4. Record ledger event `eventType: "action"` with `calendarEventId` and `missionId` metadata.
5. On post-create ledger failure: compensate delete when possible; else `ledgerStatus: "failed"` on partial state.

**Metadata** (`src/server/actions/action-ledger-repository.ts`): `toWorkspaceLedgerMetadata` / `withWorkspaceActionMetadata` merge workspace, mode, skill, agent, mission, and event type into ledger rows (local and Supabase paths).

**Ledger Activity** (`#ledger-activity` on `/hq`, #94–#95): read-only list classifies each row as **Liée** (known `missionId`), **Orphelin** (no mission id), or **Réf. inconnue** (id present but not in mission list).

**Smoke**: `npm run smoke:joris` asserts two-step flow and ledger `missionId` after confirm.

**Tests**: `npm run test:calendar-ledger-atomicity`, `npm run test:ledger-events`, `npm run test:ledger-activity-read`, `npm run test:mission-draft`.

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
| Joris `mission.draft` + confirm | Live (#96–#98) — pending TTL on `/hq`, owner-gated API confirm/cancel; local draft + `calendar.book` with `missionId`; not live executor |
| `/hq/missions` alignment | Live (#99) — légende flux, pending embedded (CTA `/hq`), badges calendrier confirmé |
| POST `/api/missions/plan` | Live (10-gate sequence; idempotency in-memory) |
| `MissionApprovalRecord` contract | Defined in TypeScript |
| Mission draft persistence (Supabase) | Not applied — local in-memory drafts only (#96) |
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

- Use `/hq`, Operator Snapshot, and Ledger Activity for read-only health.
- Propose then confirm calendar bookings via Joris (two messages; local or Supabase per env).
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

Recommended for ledger/runtime/calendar/mission-draft changes:

```powershell
npm run smoke:runtime
npm run test:execution-guard
npm run test:ledger-events
npm run test:calendar-ledger-atomicity
npm run test:ledger-activity-read
npm run test:mission-draft
npm run test:mission-display
git diff --check
```

---

## Recommended next sequence (from board #91)

| Priority | Track | Type | Depends on |
| --- | --- | --- | --- |
| 1 | Current State Sync (post-#96) | Docs | — (this document) |
| 2 | Mission persistence | Schema + wiring | CEO mandate + staging |
| 3 | Runtime echo endpoint audit | Docs/review | Persistence clarity |
| 4 | Memory vault / Money cockpit | Plan only | Later phases |

**Shipped on main (board #91):** Ledger Activity (#94), mission traceability labels (#95), Joris Mission Draft gate (#96).

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
| 2026-05-27 | #99: Mission Control alignment on `/hq/missions` (flux calendrier vs mock approval) |
| 2026-05-27 | #98: HQ Mission Draft Control (bandeau + API pending/confirm/cancel) |
| 2026-05-27 | Post-#96 sync: Mission Draft gate, Ledger Activity (#94–#95), `main` @ `4af014c` |
| 2026-05-27 | Initial sync after PRs #88, #89, #90, #92 |
