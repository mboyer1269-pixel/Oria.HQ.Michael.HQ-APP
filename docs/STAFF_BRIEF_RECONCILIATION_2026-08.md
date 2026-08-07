# Staff Brief Reconciliation — Oria HQ / Michael HQ

**Date:** 2026-08-07  
**Status:** Analysis complete — implementation slices mandate-gated  
**Author posture:** Staff Engineer gap analysis against the production HITL brief  
**Canonical companions:** `ARCHITECTURE.md`, `docs/ORIA_HQ_CURRENT_STATE.md`, `docs/EXECUTION_PHASE_STATUS.md`, `docs/MASTER_BRIEF.md`, `AGENTS.md`

---

## Verdict

The brief’s **philosophy is already the product doctrine** (HITL, append-only ledger, sovereignty, workspace isolation). The brief’s **greenfield stack sketch is not**. Implementing it as written would fork the repo away from the locked Next.js operator platform and duplicate live rails under new names.

**Do not** create `backend-agents/`, a Python FastAPI service, a new `agent_ledger_events` table, or a mock-fed cockpit theater until Michael issues an explicit slice mandate that names the target files and acceptance criteria.

---

## Brief → reality map

| Brief principle | Existing foundation | Gap |
|---|---|---|
| No sensitive action without human approval | Execution intents (`pending` → CEO approve/reject) + Sentinelle (`ALLOW \| REQUIRE_APPROVAL \| BLOCK`) + prepared-actions manual-send queue | Rail is live-ready on table `agent_execution_intents` (0024 applied); **0 live dispatches** until n8n secrets + GO (`MOVE1_RAIL_GO_LIVE.md`) |
| Auditable event-sourced memory | `action_ledger` (append-only) + typed ledger events + hash-chain **shadow** | Hash-chain write path still mandate-gated; no silent rewrite of history |
| Sovereign / portable execution (Michael HQ) | Oria brain + n8n hands on customer-controlled webhook allowlist | Inference **cost ladder** is `display_only`; no predatory revenue skim model in core |
| Strict personal / work context separation | Workspace-scoped ledger, calendar, intents; RLS on production tables | Semantic memory / pgvector remains **locked** (`MEMORY_VAULT_CONTRACT.md`) |
| LLM-agnostic model router | `src/server/ai/model-router.ts` + cost ladder | Live persistence of routing decisions still gated |
| Cockpit “execution theater” + validation queue | `/hq` Ledger Activity, Command Tower, `/hq/agents` Execution Intent Review Panel, `/hq/cockpit` | No WebSocket/SSE theater yet; panels read real APIs / projections — **not mock fill** for the approval rail |
| Table `agent_ledger_events` (PENDING/APPROVED/REJECTED/EXECUTED + `estimated_cost`) | Split model: **`agent_execution_intents`** (lifecycle + payload) + **`action_ledger`** (immutable audit) | Do **not** invent a third write path; extend existing contracts if cost telemetry is mandated |

---

## Hard conflicts (do not paper over)

### 1. Monorepo shape

| Brief assumes | Repo truth |
|---|---|
| `web/` (Next.js) + `backend-agents/` (Python FastAPI + LangGraph/CrewAI) | Single Next.js 16 App Router app; domain logic in `src/server`; **no** Python agent runtime in-tree (`ARCHITECTURE.md`) |

Introducing a parallel Python orchestration plane without an ADR + CEO mandate would split auth, ledger writes, RLS, and HITL into two sources of truth. That violates the current chokepoint design (intent → approve → single n8n outbound).

**Recommendation:** keep TypeScript as the governance brain. If a Python graph runtime is ever wanted, it must be an **adapter behind the existing rail**, never a second approval authority.

### 2. Schema naming

The brief’s `agent_ledger_events` collapses two concerns the repo deliberately separates:

1. **Queue of proposable/dispatchable work** → `public.agent_execution_intents` (status: `pending | executing | executed | failed`, `requires_ceo_approval = true` enforced in SQL).
2. **Immutable audit trail** → `public.action_ledger` (+ typed events, hash-chain shadow).

A new ENUM table with `PENDING/APPROVED/REJECTED/EXECUTED` would either duplicate 0024 or weaken the append-only ledger. Reject as a greenfield migration; prefer additive columns on the existing tables when mandated (e.g. `estimated_cost` on intents or cost metadata on ledger events).

### 3. UI aesthetic mandate

“Terminal cybernétique / arcade institutionnel” is a **design-system change**, not a bugfix. Current HQ uses restrained institutional chrome. A visual overhaul must be its own PR with explicit design GO — not bundled with ledger/rail work.

### 4. Phase / zone locks still in force

From `AGENTS.md` and capability registry:

- Phase 1 (workspace adapters, permission execution, seed expansion) — **no start without mandate**
- Memory vault Supabase/pgvector — **locked**
- Hash-chain live write — **mandate-gated** (`LEDGER_HASH_CHAIN_WRITE` + migration GO)
- Live auto-dispatch worker beyond the approved n8n chokepoint — **not implemented by design**

---

## What is already production-shaped (do not rebuild)

```
Agent proposes
  → execution intent persisted (pending)
  → CEO reviews in HQ (explicit click)
  → approve fires n8n_webhook_trigger ONLY
  → result → action ledger
```

Proof points:

- Migration `db/migrations/0024_agent_execution_intents.sql` (+ verify/revert/smoke)
- `src/server/agents/execution-intent-repository.ts`
- `POST /api/agents/execution-intents/[intentId]/approve|reject`
- `src/features/agents/components/execution-intent-review-panel.tsx`
- `src/server/agents/tools/n8n-webhook-trigger.ts`
- Green-lane ledger-before-dispatch: `src/server/runtime/green-lane-execution-service.ts`

---

## Recommended delivery sequence (each slice needs an explicit Michael GO)

Ordered by leverage on the brief’s revenue + sovereignty goals, without violating locks:

| # | Slice | Zone | Why | Out of scope |
|---|---|---|---|---|
| **A** | Rail go-live config (Voie B) — n8n workflow + secrets per `MOVE1_RAIL_GO_LIVE.md` | Yellow (ops/secrets) | Turns HITL rail from 0 dispatches → first governed real action | No new tables, no Python, no UI redesign |
| **B** | Inference cost telemetry on intents/ledger metadata (`estimated_cost` or router ladder persist) | Yellow (schema/API) | Matches Michael HQ cost transparency without a skim model | No `agent_ledger_events` rewrite |
| **C** | SSE/WebSocket “execution theater” bound to **real** intent + ledger streams | Yellow | Brief’s cockpit theater; streams only — no mock data | No cyberpunk reskin in same PR |
| **D** | Hash-chain write promotion | Yellow/Red (integrity) | Completes immutable audit claim | Only after migration + `LEDGER_HMAC_KEY` GO |
| **E** | Design system pass (terminal / high-contrast HQ chrome) | Green/Yellow (UI) | Brief aesthetics | No behavior/schema changes |
| **F** | pgvector / personal-work semantic isolation | Red until mandate | Brief’s long-term memory line | Blocked by `MEMORY_VAULT_CONTRACT.md` |
| **∅** | Python FastAPI + LangGraph monorepo split | **Rejected unless ADR** | Conflicts with locked architecture | — |

---

## Execution rules for the next builder session

When a slice is mandated, follow this order (aligned with the brief and repo practice):

1. Confirm branch base is `origin/main`; read `git status --short`.
2. If persistence changes: write `db/migrations/NNNN_*.sql` + `_verify` + `_revert` + RLS **before** application logic.
3. Route all model calls through `model-router` / cost ladder — no provider hard-wiring in `core/` or `runtime/`.
4. Cockpit surfaces consume live repositories/projections or SSE; never static mock queues for approval or execution state.
5. Do not weaken existing RLS, webhook allowlists, or `requires_ceo_approval` invariants.
6. Validate with `npm run typecheck`, `npm run lint`, `npm run build`, `npm run smoke:joris` before claiming done.

---

## Decision requested from Michael

Reply with the next authorized slice letter (**A–E**, or an ADR mandate for **∅**), plus any hard constraints (staging only, no secret commits, design references). Until that reply, agents must treat this document as a **stop gate**, not a build order.
