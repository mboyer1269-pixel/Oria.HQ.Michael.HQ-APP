# Staff Assessment — HITL / Sovereignty Mandate (2026-08-07)

**Author posture:** Staff Engineer (session Cloud Agent)  
**Status:** Gap analysis + Yellow Zone escalation — **no application code changed**  
**Trigger:** Founder brief describing production HITL, auditable ledger, Michael HQ
portability, personal/work isolation, and a proposed FastAPI / LangGraph stack.

This document is the gate between the brief and any implementation. It maps the
brief onto repository truth. It does **not** start Phase 1, dispatch workers, or
a Python backend.

---

## 1. Verdict (read this first)

| Principle in the brief | Verdict against `main` |
| --- | --- |
| No sensitive execution without human approval | **Already the product spine** — intents, prepared actions, governance decisions, Send Desk `ceo_single_send` |
| Append-only auditable memory (event sourcing) | **Exists** as `action_ledger` (+ hash-chain shadow/phase migrations) — **do not invent a parallel `agent_ledger_events` table** |
| Portable / sovereign deploy (user cloud) | **Partially aligned** — n8n as hands, cost ladder / model router; full “Michael HQ code generator” remains future scope |
| Strict personal vs work isolation | **Partially present** — workspace-scoped rows + RLS patterns; hermetic semantic memory (pgvector RAG) is roadmap P5, not live |
| Next.js + TS + Tailwind + shadcn | **Canonical** — `ARCHITECTURE.md` |
| Python FastAPI + LangGraph / CrewAI monorepo split | **Rejected** — conflicts with canonical architecture; no `backend-agents/` tree exists |
| Cyber terminal / neon arcade redesign | **Not started** — requires explicit UI mandate; existing HQ/cockpit visual language must not be replaced opportunistically |
| SSE / WebSocket “execution theatre” + live validation queue | **Partial** — review/approval surfaces exist; superseded cockpit queue is unwired; realtime theatre is not the live path |
| Create `agent_ledger_events` + RLS first | **Yellow Zone** — would duplicate live contracts; escalate before any migration |

**Bottom line:** The brief’s *governance philosophy* matches what Oria HQ already
enforces. The brief’s *greenfield stack rewrite* does not. Shipping revenue-ready
HITL means finishing the existing rail and roadmap pieces — not forking into a
second runtime.

---

## 2. Repository truth (what is already built)

Canonical sources: `ARCHITECTURE.md`, `docs/EXECUTION_PHASE_STATUS.md`,
`docs/ORIA_HQ_CURRENT_STATE.md`, `docs/roadmap/HQ_COMPLETION_ROADMAP_2026-06.md`.

### 2.1 Execution / HITL rail

```
Agent proposes → PENDING intent / prepared action
      → CEO reviews in HQ
      → Approve / reject (never auto)
      → Optional: n8n webhook (ONLY outbound chokepoint) after approval
      → Ledger records decision / action / result
```

| Capability | Location | Status |
| --- | --- | --- |
| Durable execution intents (`pending` → …) | `db/migrations/0024_agent_execution_intents.sql`, `src/server/agents/execution-intent-repository.ts` | Applied / verified; 0 live dispatches until n8n secrets |
| Prepared actions (manual-send, never auto) | `0013_prepared_actions.sql` | Live governance queue |
| Governance decisions (`human_on_the_loop`) | `0008_governance_decisions.sql` | Live |
| Execution guard (green / yellow / red) | `src/server/runtime/execution-guard.ts` | Live |
| Green-lane journal-then-act | `green-lane-execution-service.ts` | Live for ALLOW path |
| External dispatch worker | Planned `dispatch-worker.ts` | **Not implemented — mandate-gated** |
| Auto-send | — | **Forbidden by design** |

### 2.2 Ledger vs proposed `agent_ledger_events`

Existing `action_ledger` (typed in `0002_typed_ledger_events.sql`) already carries:

- `workspace_id`, `agent_id`, `skill_id`, `mission_id`
- `event_type` ∈ `decision | action | result | cost | learning`
- `payload` JSONB
- later workspace-scope + hash-chain phases (`0020`, `0022`, `0023`)

Lifecycle **status** for queued work lives on **`agent_execution_intents`** /
**`prepared_actions`**, not as a second event table ENUM of
`PENDING|APPROVED|REJECTED|EXECUTED`.

| Brief column | Map to existing model |
| --- | --- |
| `id` | `action_ledger.id` / intent id |
| `workspace_id` | `action_ledger.workspace_id` |
| `agent_id` | `action_ledger.agent_id` |
| `prompt_context` JSONB | Fold into `payload` / decision metadata — **do not fork a new table** without CEO GO |
| `proposed_payload` JSONB | Intent `payload` / prepared action payload |
| `status` ENUM | Intent / prepared-action status machines |
| `estimated_cost` | Cost ladder + optional `event_type = cost` rows — extend carefully |
| `created_at` | Present |

**Decision:** Reject a parallel `agent_ledger_events` table unless Michael explicitly
mandates a migration that justifies dual-write and backfill. Prefer extending
contracts on `action_ledger` + intents.

### 2.3 LLM-agnostic routing

Already present under `src/server/ai/`:

- `llm-json-provider.ts` — Anthropic / OpenAI preference + fallback
- `model-router.ts` + `cost-ladder.ts` — token-smart routing (roadmap P4)
- Free-model catalog / budget guards

Any new agent feature must call this layer — **not** hard-code a single provider.

### 2.4 Cockpit / “théâtre d’exécution”

- Live HQ surfaces: `/hq`, `/hq/cockpit`, missions, agents, outbound, runtime.
- `cockpit-review-queue.tsx` is **explicitly superseded / unwired** — do not revive
  without a reality check against current review sources.
- Realtime SSE/WebSocket execution theatre is **not** the current production path;
  prefer wiring durable queues and ledger reads before inventing a theatre.

### 2.5 Monorepo shape

```
/workspace          ← single Next.js 16 app (App Router + Turbopack)
  src/app|features|server|core|lib|config
  db/migrations
  docs/
```

**There is no `backend-agents/` Python package.** Introducing FastAPI + LangGraph
as a sibling service would violate `ARCHITECTURE.md` (“no microservices”) and
`AGENTS.md` (no new phase without mandate). LangGraph remains a **pattern
reference** (HITL interrupts), not an import target inside this app.

---

## 3. Yellow Zone escalation (required before coding)

Per `.agents/skills/orya-builder-green-zone/SKILL.md`, the following from the
brief are **out of Green Zone** without explicit Michael approval:

1. **Any new or altered Supabase migration** (including a new ledger table).
2. **Any RLS policy change**.
3. **Auth / permission execution expansion**.
4. **Dependency adds** (`package.json`) for WS frameworks, Python runtimes, etc.
5. **Dispatch worker / auto-execution** (`docs/EXECUTION_PHASE_STATUS.md`).
6. **Architectural split** to FastAPI / CrewAI / LangGraph as a second process.

### Escalation statement

> Executing the brief as written requires Yellow Zone actions: database
> migrations/RLS and/or a backend architecture change that contradicts
> `ARCHITECTURE.md`. Please approve a **scoped slice** from §4 before any
> Builder session writes product code or SQL.

---

## 4. Recommended mandate slices (smallest useful next steps)

Ordered for revenue reliability without rewriting the stack. Aligns with
`HQ_COMPLETION_ROADMAP_2026-06.md` and `ARCHITECTURE.md` “#1 lever”.

| ID | Slice | Zone | Outcome |
| --- | --- | --- | --- |
| **S0** | Ratify this assessment (reject FastAPI split + duplicate ledger) | Docs | Single source of truth for agents |
| **S1** | Finish execution rail config (n8n workflow + secrets) — Voie B | Ops / Red if secrets | First governed live dispatch |
| **S2** | Wire a **single** CEO validation queue UI to **live** `agent_execution_intents` + prepared actions (no mock data; poll or SSE later) | Green → Yellow if new API | Visible HITL friction |
| **S3** | Cost telemetry: ensure sensitive proposals write `estimated_cost` / `event_type=cost` through model-router + ledger | Green / Yellow if schema | Anti-lock-in cost transparency |
| **S4** | pgvector memory retrieval (roadmap P5) with workspace filters | Yellow (DB) | Hermetic context isolation |
| **S5** | Optional UI direction: “command terminal” treatment of **existing** cockpit — no full redesign unless mandated | Green | Aesthetic without product rewrite |
| **S6** | Dispatch worker — only after S1 + security audit + explicit GO in `EXECUTION_PHASE_STATUS.md` | Yellow / Red | Controlled execution |

**Do not start:** Phase 1 product expansion, VPS provisioning, or Python agent
runtime until Michael names the slice ID and zone.

---

## 5. Explicit non-goals for the next PR from this assessment

- No `backend-agents/` scaffold.
- No `agent_ledger_events` migration.
- No cyberpunk theme swap across HQ.
- No mock-filled cockpit theatre.
- No relaxation of `requires_ceo_approval` / `no_execution_authorized` invariants.

---

## 6. Validation note

This change set is **documentation only**. Mandatory app validation
(`typecheck` / `lint` / `build` / `smoke:joris`) is unchanged by this PR; run the
suite before any subsequent code slice.

---

## 7. Ask for Michael

Reply with one of:

1. **Approve S0 only** — merge this assessment; no code.
2. **Approve S2** (and/or S3) — Builder may implement the named Green/Yellow slice.
3. **Override** — mandate FastAPI / new ledger table despite §1–§2 (requires written
   justification against `ARCHITECTURE.md`).
