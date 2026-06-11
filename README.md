# Oria HQ — Workspace-First Agentic Operator Platform

> **Owner:** Michael Boyer (President / Capital Allocator)  
> **Operating Partner:** Joris (L2 assistant)  
> **Workspace:** Michael HQ  
> **Last synced:** 2026-06-11 · main · PR wave #289–#299 (send desk, loi96 pipeline, UI uplift, roadmap P1–P11)

Oria HQ is a **private operating platform** for running, validating, and governing ventures with AI agents.  
It is **not** a generic chatbot or a GPT wrapper.  
It is a **controlled agentic workspace** where agents propose, score, draft, and execute actions under strict human approval, audit trails, and safety guardrails.

---

## Vision & direction

> **Observer → Journaliser → Approuver → Persister → Auditer → Exécuter**

Oria must become a **CEO operating system augmented by agents** — not an autonomous execution engine.

The product evolves from the current single-owner foundation toward configurable workspaces, assistant profiles, permissioned actions, and runtime adapters — without baking any one person, assistant, or venture into core application contracts.

Every sprint must answer one question:

> Does this make Oria more controllable, more audited, more sellable, or more secure?

If not — it waits.

---

## Current state — what actually exists on `main`

This README reflects the codebase as of the **2026-06-11 PR wave (#289–#299)**. It separates:

- **Live** — exists, wired, validated.
- **Partial / prototype** — exists, not production-ready.
- **Locked** — deliberately not built yet.

### HQ surfaces

| Surface | Status | Notes |
|---------|--------|-------|
| `/hq` | Live | Cockpit overview — Operator Snapshot + Ledger Activity panels |
| `/hq/missions` | Live | Mission pipeline UI; dry-run planning + draft gate |
| `/hq/agents` | Live | Agent registry (7 agents, seed) |
| `/hq/skills` | Live | Skills catalog (15 skills, seed) |
| `/hq/ventures` | Live | Venture Command Center; venture engine view + progressive asset registry |
| `/hq/ventures/loi96` | Live | Loi 96 pipeline board — targets, statuses, Préparer → Send Desk bridge (PR #296) |
| `/hq/outbound` | Live | Send Desk — prepared sends queue, CEO click = only send trigger (PR #293) |
| `/hq/notes` | Live | CEO Notes workspace — two-pane editor, debounced autosave (PR #298) |
| `/hq/runtime` | Live | Runtime status + live agent flow map (agents → governance → execution → ledger) |
| `/hq/memory` | Partial | Shell / placeholder |
| `/dashboard/documents` | Live | Owner documents |
| `/contact` | Live | Public contact form |
| `/login` | Live | Supabase auth (optional in dev) |

### Joris — orchestrator & controlled executor

Joris is the **operating partner**, not a free agent runner. All sensitive actions require human confirmation.

- **Two-step Mission Draft gate** — `calendar.book` intents produce a structured preview first; confirmed only on explicit reply (`confirme`, `oui`, `go`). Pending drafts have a 10-minute TTL.
- **Workspace context** — every Joris action injects `workspaceId`, `modeId`, `assistantProfileId` into the ledger.
- **Joris Brain** (`src/server/joris/brain.ts`) routes intents: `mission.draft`, `mission.plan`, `calendar.book`, governance checks.
- **Smoke test**: `npm run smoke:joris` — full two-step flow + `missionId` tracing on ledger.

### Action ledger & governance

- **Ledger write path**: every `calendar.book` records a `decision` event _before_ the calendar write, then an `action` event _after_. Compensating delete on ledger failure.
- **Ledger Activity panel** on `/hq` — read-only; classifies each row as **Liée** (known missionId), **Orphelin** (no missionId), or **Réf. inconnue**.
- **Mission ↔ Ledger traceability** — `missionId` flows from Mission Draft confirmation through calendar write into ledger metadata.
- **Workspace-scoped** — all ledger rows, calendar events, and decisions carry `workspaceId`.

### Outbound Send Desk (`ceo_single_send`)

Under `src/server/outbound` and `/hq/outbound` (PR wave #289–#293, doctrine in `docs/`):

- **Channel abstraction** — typed email/SMS descriptors with structural guardrails: `requiresManualSend` forced `true`, cold SMS structurally Red, fail-safe validation.
- **Owner-gated send API** — `POST /api/outbound/send`, workspace-scoped store, ledger entry before dispatch.
- **Live bridge** — Resend email adapter; exactly one send per explicit CEO action. No batch, no auto-send.
- **Send Desk UI** — `/hq/outbound` queue of prepared sends; the CEO click is the only send trigger.
- **Loi 96 bridge (P1 « Le Pont »)** — target store over `ventures/loi96/pipeline.json`, audit email builder, pipeline board at `/hq/ventures/loi96` (PR #295–#296).

### Venture engine

Under `src/features/ventures` and `src/server/ventures`:

- **EvidenceRef** — typed, trust-classified revenue evidence (`stripe_charge`, `signed_loi`, `email_reply`, `screenshot`, `manual_note`, etc.). Only verified financial kinds back realized cash. Anti-gaming foundation.
- **AgentRevenueOutcome** — structured venture work outcomes: six signals (customerProof, paymentSignal, painClarity, buyerIdentifiability, offerTestability, cashProximity), `cashGenerated`, `nextCashAction`.
- **VentureCashScore** — scores ventures on cash readiness: `totalCashScore`, `cashScoreBand` (`blocked` → `cash_ready`), `survivalStatus` (`kill_candidate` → `cash_ready`).
- **AgentOperatorScore** — scores agents as economic operators: revenueImpact, economicInitiative, executionEfficiency, credibility, skillGrowth. Bands from `underperforming` to `elite_operator`.
- **ExecutiveSelectionIndex** — combines both scores into allocation decisions (proposals only, no execution).
- **Hermes Prep Agent** (`hermesPrepTick`) — pure planner for outreach prep cycles; produces `OutreachPlan` proposals stored in the `prepared_actions` durable store. No live execution.
- **Prepared Actions store** (`prepared_actions`) — durable store for agent-prepared actions pending CEO review.
- **Agent economics loop** — score history persisted; loop closed from evidence → outcome → score → selection.
- **ROI Arena** (`src/server/arena/roi-arena.ts`) — evaluates mission/idea/action candidates with ROI multiples, sanity ceilings, and dry-run execution plans.

### Live Execution Layer (bounded, guarded)

Under `src/server/runtime` and `src/features/agents`:

- **Bounded Live Execution Layer** (PR #218) — foundation for controlled live execution. No unguarded dispatch.
- **Sentinelle Policy Engine** (PR #219) — zone-based execution policies. Each action zone has explicit allowed operations, approval thresholds, and hard blocks.
- **Green Lane Execute** (PR #220) — pre-approved, low-risk actions can flow through a fast-path with lightweight confirmation. ROI meter validates value-to-cost ratio before dispatch.
- **Webhook Bridge** (PR #220) — n8n webhook integration for external action triggers. All inbound webhooks pass through the Sentinelle policy check.
- **Smoke test**: `npm run smoke:agent-execute` — validates guard, policy check, and execution attempt logging.

All live execution remains behind:
- `humanOnTheLoop: true` contract invariant.
- Sentinelle policy zone check.
- Ledger entry before and after any execution attempt.
- `POST /api/missions/execute` **does not exist** by design.

---

## Architecture map

| Path | Role |
|------|------|
| `src/app/` | Next.js App Router surfaces (`/hq`, `/hq/missions`, `/hq/agents`, `/hq/ventures`, etc.). |
| `src/features/ventures/` | Venture models, EvidenceRef, AgentRevenueOutcome, scoring, Hermes plans, workbench, profitability panels. |
| `src/features/agents/` | Agent registry, autonomy cockpit, knowledge packs, quality evaluation, approval packets, bounded execution layer. |
| `src/features/cockpit/` | HQ cockpit shell, Operator Snapshot, Ledger Activity, control chain, Joris dock, morning readiness. |
| `src/features/hq/` | HQ page-level components (operator-snapshot, ledger-activity read model). |
| `src/server/agents/` | Agent contracts: work orders, autonomy envelopes, Next Action Mandate, governance helpers, Sentinelle policy engine. |
| `src/server/arena/` | ROI Arena — value/ROI evaluation, verdicts, batch ranking, candidate generator. |
| `src/server/joris/` | Joris brain, intent detection, governance bundles, mission router, work-order review, mission-draft gate. |
| `src/server/missions/` | Mission draft builder, confirmation, pending-draft session (TTL), plan endpoint. |
| `src/server/runtime/` | Execution guard, runtime safety, Green Lane, webhook bridge, local prototype. |
| `src/server/ventures/` | Venture repository, lifecycle service, prepared_actions store, Hermes orchestration, venture assets, loi96 target store. |
| `src/server/outbound/` | Send Desk core: channel abstraction, send service/store, queue intake, live executor, Resend adapter, outbound ledger. |
| `src/features/notes/` + `src/server/notes/` | CEO Notes workspace and note repository. |
| `ventures/loi96/` | Loi 96 venture working data: sales plan, pipeline.json, simulation results. |
| `src/server/actions/` | Action ledger repository — local and Supabase paths, workspace metadata helpers. |
| `src/server/calendar/` | Calendar service — workspace-scoped, ledger-wrapped, mission-draft–gated. |
| `src/core/workspaces/` | Workspace config registry, workspace context types. |
| `src/config/workspaces/` | Workspace seed definitions. |
| `src/scripts/smoke/` | Smoke tests (joris two-step, agent-execute, runtime health, revenue operational-value). |
| `db/` | Migrations and verification SQL for ventures, governance, and workspace tables. |
| `docs/` | Doctrine, governance specs, approval schemas, operating model, current state canonical. |

---

## Safety model — what agents can and cannot do

### Agents may:

- **research** — collect information, scan options.
- **analyze** — compare options, critique, highlight risks.
- **score** — produce VentureCashScore / AgentOperatorScore / ROI Arena scores.
- **draft** — internal plans, briefs, outreach prep, offers.
- **compare** — ventures, agents, options, outcomes.
- **estimate ROI** — via ROI Arena and profitability engines.
- **prepare** — Hermes outreach plans, prepared actions for CEO review.
- **propose next work** — Next Action Mandate, `nextCashAction`, routing suggestions.
- **execute (Green Lane)** — pre-approved, low-risk actions with Sentinelle policy clearance and ledger trace.

### Agents may **not** do without explicit approval and logged guardrails:

- **contact customers** — send emails, messages, or book meetings without Mission Draft confirmation.
- **spend money** — payments, transfers, purchases.
- **publish** — public content, posts, docs.
- **deploy** — infrastructure, code, config to production.
- **modify database** — schema or data writes outside venture services and migrations.
- **connect external tools** — new integrations without explicit scope.
- **bypass approvals** — no silent auto-approval flows.
- **execute outside policy zones** — any action not cleared by Sentinelle is blocked.

These constraints are enforced by:

- Contract-level invariants (`humanOnTheLoop: true`, `approvalRequired: true`, `noExecutionAuthorized: true`).
- Central runtime guard (`execution-guard`) for any candidate execution.
- Sentinelle Policy Engine — zone-based hard blocks and approval thresholds.
- Governance / ledger layers — every decision and action is recorded and traced.

---

## Venture profitability loop

> **Evidence → Outcome → Score → ROI → Selection → Mandate → Prepared Action → CEO Review**

- **Evidence** (`EvidenceRef`) — typed, trust-classified. Only `stripe_charge` / `signed_loi` backs real cash.
- **Outcome** (`AgentRevenueOutcome`) — structured venture work result; positive cash requires verified financial evidence.
- **Score** (`VentureCashScore`, `AgentOperatorScore`) — survival status and operator quality.
- **ROI** (ROI Arena) — net value and ROI multiples with sanity ceilings.
- **Selection** (`ExecutiveSelectionIndex`) — allocation decisions (proposals only).
- **Mandate** (`NextActionMandate`) — next cash-oriented move; agent accepts, refutes, or counter-proposes.
- **Prepared Action** (Hermes + `prepared_actions` store) — durable store; CEO reviews before any outreach or external contact.
- **CEO Review** — explicit approval gate; no action leaves the system without it.

---

## Validation

From the repo root using Windows PowerShell:

```powershell
npm run typecheck     # TypeScript strict
npm run lint          # ESLint
npm run build         # Next.js build
npm run smoke:joris   # Joris two-step mission draft + ledger trace
```

Full validation suite:

```powershell
npm run smoke:agent-execute         # Bounded execution layer smoke
npm run test:mission-draft          # Mission draft gate + TTL
npm run test:calendar-ledger-atomicity
npm run test:ledger-events
npm run test:ledger-activity-read
npm run smoke:revenue               # Venture operational-value check
```

All checks must pass before merge.

---

## Development rules

- **Small PRs** — one branch = one mandate = one PR = one validation.
- **Diagnosis first** — every session starts read-only (`git status`, `git log`, `git diff`).
- **Pure/local models first** — contracts and pure helpers before wiring runtime or DB.
- **No DB/API/runtime changes** without an explicit mandate and clear scope.
- **No duplicate concepts** — one canonical owner per domain type.
- **No hardcoded secrets** — configuration via environment / tooling only.
- **No approval bypass** — all sensitive actions flow through governance and guardrails.
- **No unguarded live execution** — runtime dispatch must always go through the execution guard, Sentinelle policy check, and ledger.

---

## Roadmap

**Canonical roadmap:** [`docs/roadmap/HQ_COMPLETION_ROADMAP_2026-06.md`](docs/roadmap/HQ_COMPLETION_ROADMAP_2026-06.md) — ratified by the CEO (session 2026-06-11). Eleven pieces to close the revenue loop in-app:

| Piece | Objective | Status |
|-------|-----------|--------|
| P1 **Le Pont** | Loi 96 target → preparation → send, 100% in-app | Delivered — PR #296 |
| P2 **Durabilité** | Supabase migrations for send desk, notes, assets, targets (CEO GO required) | Pending |
| P3 **Decision Spine** | Deterministic, auditable next-best-action engine | Pending |
| P4 **Cost Ladder + Market Watch** | Token-smart model routing, free-tier first, zero lock-in | Pending |
| P5 **Mémoire RAG** | pgvector retrieval — golden examples feed audit quality | Pending |
| P6/P6+ **Boucle fermée + Canal CEO** | Resend webhooks, J+4/J+9 relances, Twilio SMS command channel | Pending |
| P7 **Réveil des proactifs** | Daily-direction, ceo-brief, market-watch crons | Pending |
| P8 **Venture Launch Kit** | Auto-prepared launch assets on venture approval | Pending |
| P9 **Réorg dashboard** | Typographic voices IA refonte (after P3) | Pending |
| P10 **Argus** | AI-watch agent — weekly intelligence report | Pending |
| P11 **Graphe d'orchestration** | Governance-native executable orchestration graph | Pending |

Critical path: **P1 → P2 → P3 → P6/P6+**, with P4/P5/P7 interleaved, then P8/P9.

Rule: no new phase starts without an explicit mandate from Michael.

### Open PR wave (2026-06-11)

Merge order: #289 → #290 → #291 → #292 → #293 → #294 → #295 → #296, then #297/#298 (parallel), #299 + this PR (docs) anytime.

| PR | Branch | Content |
|----|--------|---------|
| #289 | `docs/send-desk-doctrine` | Send desk doctrine — `ceo_single_send` |
| #290 | `feat/outbound-channel-abstraction` | Channel abstraction + structural guardrails |
| #291 | `feat/outbound-live-bridge-email` | Live single-send bridge, Resend adapter |
| #292 | `feat/outbound-send-api` | Owner-gated send API, workspace-scoped store |
| #293 | `feat/outbound-send-desk-ui` | Send Desk UI + queue intake (`/hq/outbound`) |
| #294 | `feat/venture-asset-registry` | Progressive asset registry, stage readiness |
| #295 | `chore/loi96-data-restore` | Loi 96 venture data restore |
| #296 | `feat/loi96-pipeline-bridge` | P1 Le Pont — pipeline, audit email, bridge |
| #297 | `feat/agent-pantheon` | Mythological agent pantheon |
| #298 | `feat/hq-ui-uplift` | CEO notes, widgets v2, agent flow map, landing |
| #299 | `docs/hq-roadmap-p11-clean` | HQ completion roadmap P1–P11 |

---

## Contact

Private, owner-operated workspace.  
Collaborators start from:

- `docs/ORIA_HQ_CURRENT_STATE.md` — canonical current state.
- `docs/AGENTS.md` → `AGENTS.md` at repo root — operating rules for agents.
- `docs/AGENT_GOVERNANCE_REVIEW_LOOP.md` — governance and review loop.
- `docs/VENTURE_ENGINE_RECALIBRATION.md` — venture engine direction.
- `SOUL.md` — agent posture and values.
