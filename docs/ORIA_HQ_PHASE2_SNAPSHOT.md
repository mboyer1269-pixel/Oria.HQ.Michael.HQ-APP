# Oria HQ — Phase 2 Snapshot

> **Superseded for operations:** use `docs/ORIA_HQ_CURRENT_STATE.md` (2026-05-27, post #88–#92). This file is kept as a historical checkpoint.

Date: 2026-05-21  
Branch: `main` (post-PR #33)  
Author: CEO checkpoint — Michael Boyer

---

## What Was Built — Full Sprint Summary

### Phase 1: Mission Control (PRs #20–#29)

| PR | Title | Type |
|---|---|---|
| #20 | Mission approval record contract | Contract |
| #21 | Idempotency + rate limit contract | Contract |
| #22 | Mission persistence schema proposal | Docs |
| #23 | Dry-run plan endpoint POST /api/missions/plan | API |
| #24 | Joris dry-run wiring (mission.plan intent) | AI wiring |
| #25 | Mission resolver extraction | Refactor |
| #26 | Mission ID normalization (mission_ + msn_) | Fix |
| #27 | Mission Control status dashboard | UI |
| #28 | Mission Control operating manual | Docs |
| #29 | Mission Control completion snapshot | Docs |

### Phase 2: Agent Registry + Skills Catalog (PRs #30–#33)

| PR | Title | Type |
|---|---|---|
| #30 | Agent Registry Foundation — /hq/agents, 7 agents | UI + Data |
| #31 | Skills Catalog Foundation — /hq/skills, 15 skills, 8 categories | UI + Data |
| #32 | Agent ↔ Skill mapping with validation | Utility + UI |
| #33 | Oria Agent Operating Manual | Docs |

**14 PRs total. All squash-merged. All 4/4 validations passed.**

---

## Current System State

### Mission Control

| Component | Status |
|---|---|
| `/hq/missions` — pipeline view | ✅ operational |
| Joris `mission.plan` intent | ✅ operational (dry-run only) |
| POST `/api/missions/plan` — 10-gate sequence | ✅ operational (dry-run only) |
| Mission approval record contract | ✅ defined — persistence pending |
| Idempotency / rate limit | ✅ local in-memory — production pending |
| Mission persistence (Supabase) | 🟡 schema proposed, migration not applied |
| Live executor | 🔴 locked — Red Team pass required |

### Agent Registry

| Component | Status |
|---|---|
| `/hq/agents` — registry view | ✅ operational |
| Joris | ✅ active — dry-run orchestrator |
| Hermes Scout | 🟡 standby — no implementation yet |
| Hermes Builder | 🟡 standby — no implementation yet |
| Hermes Closer | ⬜ planned |
| Hermes Operator | ⬜ planned |
| Hermes Auditor | 🔴 locked — Red Team sign-off required |
| Hermes Money | ⬜ planned |
| Agent ↔ Skill mapping validation | ✅ coherent (0 mismatches) |

### Skills Catalog

| Component | Status |
|---|---|
| `/hq/skills` — catalog view | ✅ operational |
| Active skills | 2 (`mission.plan`, `calendar.book`) |
| Partial skills | 2 (`brief.generate`, `board.consult`) |
| Planned skills | 11 |
| Total | 15 across 8 categories |

---

## What Is Safe to Use Right Now

- Ask Joris to plan any mission in dry-run mode
- Book calendar events via Joris (external invites need level 4 confirmation)
- View `/hq/missions`, `/hq/agents`, `/hq/skills`
- Call any contract function in `src/server/missions/` — all pure or read-only
- Add new agents or skills to seed files (mapping validation will flag drift)

---

## What Is Locked

| Capability | Unlock path |
|---|---|
| Live mission execution | Persistence migration + Auditor Red Team pass + CEO mandate |
| `approvalConfirmed: true` | Server-side only via persisted + verified `MissionApprovalRecord` |
| Hermes Scout / Builder wiring | Implement skills in separate PRs |
| Hermes Auditor | Requires full Mission Control persistence first |
| Any agent VPS / runtime | No mandate — phase not started |
| External sends (email, SMS, publish) | CEO level 5 confirmation + explicit mandate |

---

## Immutable Constraints (Phase 3 and Beyond)

These apply to every PR in this repo, always:

- Never modify secrets, `.env`, API keys, or credentials
- Never modify `db/schema.sql` directly — migrations in separate files only
- Never modify existing API routes without explicit mandate
- `approvalConfirmed: true` is server-side only — enforced by `verifyMissionApprovalRecord()`
- All merges: squash and merge only
- Every PR: `npm run typecheck` + `npm run lint` + `npm run build` + `npm run smoke:joris`
- `validateAgentSkillMapping().valid` must remain `true` after any agent or skill PR
- `src/server/joris/conversation-repository.ts` remains stashed — do not re-apply
- No live executor without: persistence + idempotency on Supabase/Redis + Red Team pass

---

## Architecture Map (Current)

```
/hq                      (overview + nav links)
├── /hq/missions         (Mission Control pipeline)
│   └── MissionSystemStatus + MissionApprovalPanel + MissionKanbanBoard
├── /hq/agents           (Agent Registry)
│   └── AgentCard × 7 + AgentSkillPanel × 7 (mapping section)
└── /hq/skills           (Skills Catalog)
    └── SkillCard × 15, grouped by 8 categories

src/server/missions/
  ├── approval-record.ts      MissionApprovalRecord contract (7 checks)
  ├── approval-service.ts     read-only approval evaluation
  ├── executor-contract.ts    dry-run plan builder (mode live = unavailable)
  ├── execution-attempt-store.ts  local idempotency store
  ├── idempotency-contract.ts pure validation functions
  ├── mission-repository.ts   listMissionsForWorkspace
  ├── mission-resolver.ts     resolveMissionFromText
  ├── state-machine.ts        read-only transitions
  └── index.ts                public exports

src/features/agents/
  ├── types.ts                AgentProfile, AgentStatus, AgentRoleId
  ├── seed.ts                 7 agents with skillIds + constraints
  ├── skill-mapping.ts        getSkillsForAgent + validateAgentSkillMapping
  └── components/
      ├── agent-card.tsx
      └── agent-skill-panel.tsx

src/features/skills/
  ├── types.ts                SkillProfile, SkillStatus, SkillCategory
  ├── seed.ts                 15 skills + CATEGORY_LABELS
  └── components/
      └── skill-card.tsx
```

---

## CEO Decision: Phase 3 Direction

Three paths ranked by impact and risk:

### Option A — Runtime Contract + VPS Readiness (recommended)
**What:** Define the formal contract for what a Hermes agent runtime looks like — what APIs it exposes, what security boundaries it must enforce, how it registers with the HQ, what it's allowed to do without a CEO round-trip. No VPS provisioned yet — just the contract and readiness checklist.  
**Why now:** Before spinning up any VPS or wiring Hermes Scout, you need to know what "a deployed Hermes agent" means. This makes Phase 4 (actual deployment) controlled and reversible.  
**Scope:** 2 PRs, docs only. No infrastructure, no secrets, no DB.

### Option B — Mission Persistence Migration
**What:** Write and apply the Supabase migration for `missions`, `mission_approval_records`, `mission_execution_attempts`.  
**Why later:** High coordination cost. Requires staging environment and migration review before production. Best done after the Runtime Contract clarifies what the DB needs to support.

### Option C — Hermes Scout Activation (first live agent)
**What:** Implement `opportunity.scan` and `lead.triage`, wire them into a Joris intent or a new route, flip Scout from `standby` to `active`.  
**Why later:** Premature without a Runtime Contract. Scout needs a clear boundary before it touches any external data source.

---

**Recommended next PR:** PR #34 (this document) → PR #35 starts Runtime Contract.

---

## Reference Docs

- `docs/MISSION_CONTROL_OPERATING_MANUAL.md` — Mission Control in detail
- `docs/ORIA_AGENT_OPERATING_MANUAL.md` — Agent Registry + Skills in detail
- `docs/MISSION_PERSISTENCE_SCHEMA_PROPOSAL.md` — DB schema decisions
- `docs/MISSION_CONTROL_COMPLETION_SNAPSHOT.md` — Phase 1 checkpoint
