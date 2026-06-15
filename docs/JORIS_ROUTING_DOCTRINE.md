# Joris Routing Doctrine

> **Status:** ratified doctrine · 2026-06-15
> **Type:** doctrine (docs-only — no runtime behavior change)
> **Source of truth (code):** `src/server/ai/model-router.ts` (`chooseModel`), `src/server/ai/cost-ladder.ts` (`decideLadder`, `getCostLadderSnapshot`), `src/server/ai/llm-json-provider.ts`, `src/server/joris/brain.ts` (shadow task-class tagging)
> **Scope:** this document ratifies existing behavior in writing. It changes no code, no provider call, and no Cost Ladder behavior.

---

## Purpose

This doctrine fixes, in writing, how Joris selects models and spends compute —
so that future work cannot silently make Joris expensive, provider-locked, or
fragmented across competing interfaces. It describes the system as it already
exists in code (shadow / `display_only`) and names exactly what stays locked
until an explicit later mandate.

It is **not** a change request. Nothing here enables live dispatch, a new
provider, or a UI surface. Those are gated (see "What stays locked").

---

## 1. Joris is the single visible orchestrator

- Michael talks to **Joris**. There is one conversational interface.
- Joris is the **visible CEO of the agents**: agents, modules, and personas
  operate **behind** Joris, not as parallel chat surfaces.
- Hermès / Relay and the other modules stay an **internal operator layer** —
  they do work on Joris's behalf; they are not a second competing conversation
  interface.
- Display names are presentation only; the underlying agent/module ids are
  frozen and resolved through the naming layer, never re-invented per surface.

---

## 2. Joris is not bound to OpenAI or Anthropic

- Joris is an **identity + orchestration + memory + skills + router** — not a
  model.
- The **provider and model are interchangeable** behind the router. Today the
  live JSON provider chain is **Anthropic → OpenAI** (`llm-json-provider.ts`,
  `LlmProvider = "anthropic" | "openai"`, ordered fallback). That chain is an
  implementation detail, not part of Joris's identity.
- **OpenRouter exists to enable the best capability/cost ratio per task** — it
  is the future path to route a task to the cheapest adequate model regardless
  of vendor. In this lot it is catalogued and observed only (see §4).

---

## 3. The Cost Ladder is the cost doctrine

The Cost Ladder (`cost-ladder.ts`, engaged via `model-router.ts`) is the
canonical policy for what a task is allowed to cost.

- **Rungs:** `free`, `economy`, `premium` (`CostRung`).
- **Default to the cheapest adequate model.** The least expensive rung that can
  do the task correctly must be preferred by default.
- **Premium is reserved for tasks that justify it.** It is an exception, not a
  baseline.
- **`client_audit` keeps a premium quality floor.** High-value judgment task
  classes carry a hard floor that is **never downgraded** — not in economy mode
  and not under budget pressure (`floorBound` events record when the floor held).
- **Per-agent daily budgets stay guard-rails.** The budget guard may pull a
  non-floored task down a rung (`budgetBound` events record this); it never
  pierces a hard floor.

---

## 4. OpenRouter is config-gated

In this lot, OpenRouter is **catalogue-only**:

- **No live OpenRouter client.** The only live clients are
  `anthropic-json-client.ts` and `openai-json-client.ts`.
- **No live dispatch.** The ladder's decision is observed, not executed (see §6).
- **No free-rung activation.** The free rung stays empty/config-gated; no free
  model is ever forced at runtime.
- Free / economy models **may be catalogued and observed** via
  `config/openrouter.free-models.json` (loaded read-only by the free-model
  catalog), **but never used in production without an explicit D2 mandate**.

---

## 5. Fusion / multi-model panel

- **Panel / fusion must not become the default.** The default for any task is a
  **single, cheapest-adequate model**.
- **Panel / fusion is reserved for high-value tasks only**, where the value of a
  better answer justifies the multiplied cost:
  - critical architecture decisions;
  - complex audits;
  - important business decisions;
  - genuine contradiction between models;
  - deep research.
- A judge / synthesis step over a panel **may** be added later. **Nothing of the
  kind is implemented in this lot** — this is doctrine, not a feature.

---

## 6. Observability

- **`getCostLadderSnapshot()` is the canonical read-only lens** today. It is a
  pure aggregate of the in-memory cost log — `byAgent`, `byTaskClass`, `byRung`,
  plus `floorBoundCount` and `budgetBoundCount` — and it mutates nothing, calls
  no provider, and persists nothing.
- **Basis: `estimated/in-memory only`** (`COST_LADDER_SNAPSHOT_BASIS`, stated
  verbatim on every snapshot). These are **estimated relative weights**, **not
  real billing**. No consumer may imply real spend from them.
- The **doctor already reads** this snapshot (`npm run doctor` → ROUTAGE →
  "cost ladder snapshot").
- **No UI panel in this lot.** Surfacing the snapshot inside the HQ interface is
  a separate mandate (D1c).

---

## 7. What stays locked

The following stay locked until an **explicit CEO mandate (D2 / D1c)**, and no
agent, PR, or refactor may enable them autonomously:

- Live OpenRouter client.
- Moving the Cost Ladder from `display_only` to live dispatch.
- Real activation of the `free` rung.
- Runtime panel / fusion.
- HQ observability UI.
- Supabase persistence (of cost events or routing decisions).
- Provider changes.
- Skill-dispatcher changes.
- Cost Ladder behavior changes.

---

## Relationship to other docs

- Operating model and agent posture: `AGENTS.md`, `SOUL.md`.
- Agent naming / persona layer: the naming module is the only display authority;
  ids are frozen.
- This doctrine is **read-only with respect to runtime**: it records the
  contract that `model-router.ts`, `cost-ladder.ts`, and `brain.ts` already
  implement in shadow mode.
