# Oria Agent Operating Manual

Last updated: 2026-05-21  
Branch at time of writing: `main` (post-PR #32)

---

## Overview

Oria HQ runs on a multi-agent architecture. Joris is the orchestrator — every request goes through him first. The Hermes agents are specialists activated per domain. No agent acts without an explicit mandate from the CEO.

**Every agent, every skill, every mission: dry-run by default. Live execution requires a Red Team pass that has not been granted yet.**

---

## Who Does What

| Agent | Role | Status | What they do |
|---|---|---|---|
| **Joris** | Orchestrator | ✅ active | Receives intent, routes to skills, plans missions, consults the Board. Chef d'orchestre. |
| **Hermes Scout** | Scout | 🟡 standby | Scans market signals, triages leads. Read-only — no external contact. |
| **Hermes Builder** | Builder | 🟡 standby | Drafts MVP plans and tech specs. Internal only — no deployment. |
| **Hermes Closer** | Closer | ⬜ planned | Call scripts, follow-up sequences. All external sends require CEO level 5. |
| **Hermes Operator** | Operator | ⬜ planned | SOPs, workflow maps. No prod credentials, no schema changes without CEO. |
| **Hermes Auditor** | Auditor | 🔴 locked | Red Team review, risk assessment. Blocking role — sign-off required before live executor unlock. |
| **Hermes Money** | Money | ⬜ planned | Cash snapshot, runway calc. Read-only — no transactions. |

---

## Active Skills Today

These skills are wired and callable right now:

| Skill | Agent | How to invoke | Output |
|---|---|---|---|
| **Mission Dry-Run Plan** (`mission.plan`) | Joris | Ask Joris: "planifie mission_…" | Plan with `requiresConfirmation: true`. Never executes. |
| **Calendar Book** (`calendar.book`) | Joris | Ask Joris: "réserve un RDV lundi à 10h" | Event created. External invite needs level 4 confirmation. |

---

## Partial Skills (Contract Defined, Not Fully Wired)

| Skill | Agent | What's missing |
|---|---|---|
| **CEO Brief** (`brief.generate`) | Joris | Live data sources not connected — format ready, pipeline partial |
| **Board Consult** (`board.consult`) | Joris | Billionaire Board seed exists, structured routing not yet wired |

---

## Planned Skills (Not Yet Built)

| Category | Skills | Assigned to |
|---|---|---|
| Money | Cash Snapshot, Runway Calculator | Hermes Money |
| Sales | Lead Triage, Call Script, Follow-up Sequence | Hermes Scout / Closer |
| Marketing | Opportunity Scan | Hermes Scout |
| Legal/Admin | SOP Draft | Hermes Operator |
| Dev/Code | Spec Draft, MVP Plan | Hermes Builder |
| Automation | Workflow Map, Risk Review, Red Team Pass | Hermes Operator / Auditor |

None of these fire in the current runtime. They are declared in `src/features/skills/seed.ts` as reference for future wiring.

---

## How to Ask Joris for a Plan

Joris detects `mission.plan` intent when your message contains:
- a mission ID (`mission_…` or `msn_…`) **or** a known mission title
- plus a signal word: `plan`, `planifie`, `prépare`, `schedule`, `dry-run`, `exécute`, `lance`, `run`

**Examples:**

```
planifie mission_ceo_brief_2026_05_21
plan msn_abc123 pour aujourd'hui
prépare le CEO Brief du jour
```

**What Joris returns:**
- A dry-run execution plan
- `requiresConfirmation: true` — always
- `approvalConfirmed: false` — always, non-negotiable

Joris cannot set `approvalConfirmed: true`. That is server-side only, enforced by `verifyMissionApprovalRecord()`.

---

## What Is Strictly Forbidden

These actions are blocked at the contract level and will not be unlocked without explicit CEO mandate + Red Team pass:

| Forbidden action | Where blocked |
|---|---|
| Live mission execution | `buildDryRunMissionExecutionPlan()` — mode `live` not available |
| `approvalConfirmed: true` from any client | Hardcoded `false` in Joris + POST /api/missions/plan |
| Sending external messages / publishing | Requires autonomy level 5 + CEO confirmation |
| Spending, transferring money | Requires level 5 + explicit mandate |
| Modifying DB schema directly | `db/schema.sql` immutable — migrations only |
| Accessing production credentials | No agent has access |
| Hermes Auditor self-validation | Auditor cannot sign off its own Red Team pass |

---

## How to Unlock an Agent

**Standby → Active** (Hermes Scout, Hermes Builder):

1. Write the skill implementation (separate PR)
2. Wire the skill into Joris brain or a new route
3. Add the skill to `src/features/skills/seed.ts` with `status: "active"`
4. 4/4 validations pass
5. CEO mandate in PR body
6. Squash merge

**Locked → Active** (Hermes Auditor):

1. All Mission Control guardrails must be in place (persistence migration applied, idempotency on Supabase/Redis)
2. Hermes Auditor runs the Red Team review (`redteam.pass` skill)
3. CEO signs off on the review
4. Live executor unlock is a separate PR, not part of the Auditor activation

**Planned → Standby / Active:**

Same path as Standby → Active. "Planned" means the seed entry exists but no implementation PR has been started.

---

## Coherence Rule

`src/features/agents/seed.ts` `skillIds[]` and `src/features/skills/seed.ts` must stay in sync.

`validateAgentSkillMapping(agentRegistry, skillsCatalog)` (in `src/features/agents/skill-mapping.ts`) checks:
- Every `skillId` declared by an agent resolves to a catalog entry
- Every catalog skill is claimed by at least one agent

The result is displayed live on `/hq/agents` as a "Cohérent" / "Mismatches détectés" badge. If you add a skill or agent and forget to update the other side, the badge flips amber.

**Rule:** any PR that adds a new agent or skill must keep the mapping valid. If `validateAgentSkillMapping().valid === false` after your change, the PR is not mergeable.

---

## Next Phase: Toward Runtime

The path from current state to live agents:

1. **Persistence migration** — apply Supabase schema for missions, approval records, execution attempts (CEO sign-off done 2026-05-21; migration PR not yet written)
2. **Idempotency on Supabase/Redis** — replace local in-memory store with atomic insert
3. **Wire approval record persistence** — `createMissionApprovalRecordDraft()` → Supabase insert
4. **Hermes Scout activation** — implement `opportunity.scan` and `lead.triage`, wire into a route
5. **Red Team pass** — Hermes Auditor runs `redteam.pass` before live executor unlock
6. **VPS / runtime** — Hermes agents need a runtime environment (separate phase, no mandate yet)
7. **Live executor unlock** — final gate, requires all above + explicit CEO mandate

No agent gets a VPS or runtime until steps 1–5 are complete.

---

## Reference Docs

- `docs/MISSION_CONTROL_OPERATING_MANUAL.md` — Joris + Mission Control in detail
- `docs/MISSION_PERSISTENCE_SCHEMA_PROPOSAL.md` — DB schema decisions
- `docs/MISSION_CONTROL_COMPLETION_SNAPSHOT.md` — Phase 1 checkpoint (PRs #20–#28)
- `src/features/agents/seed.ts` — agent registry
- `src/features/skills/seed.ts` — skills catalog
- `src/features/agents/skill-mapping.ts` — mapping validation
