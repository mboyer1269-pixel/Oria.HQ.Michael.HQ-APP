# Oria HQ — Multi-Agent Venture Operating System

> **Owner:** Michael Boyer (President / Capital Allocator)  
> **Operating Partner:** Joris (L2)  
> **Workspace:** Michael HQ

Orya HQ is a **private operating system** for building, validating, and operating ventures with AI agents.  
It is **not** a generic chatbot or a GPT wrapper.  
It is a **controlled agentic workspace** where agents propose, score, route, and prepare actions under strict human approval and safety guardrails.

---

## Current state — what actually exists today

This README reflects the current codebase on `main`. It deliberately separates:

- **Current implemented state** — features that exist and are wired.
- **Active development track** — work in progress on this repo.
- **Roadmap / doctrine** — where the system is heading next.

### Michael HQ workspace

- **Owner-only workspace** for Michael HQ (authenticated HQ surfaces under `/hq`).
- **Joris** acts as **operating partner / orchestrator**, not as a free agent runner.
- HQ surfaces include:
  - `/hq` — cockpit entry point.
  - `/hq/agents` — agent review and autonomy cockpit.
  - `/hq/cockpit` — control chain and agent review queue.
  - `/hq/ventures` — read-only Venture Command Center.

### Governance & runtime guardrails

- **Runtime execution guard** under `src/server/runtime`:
  - `canPrepareExecution` and `buildDryRunExecutionPlan` enforce dry-run / guarded modes.
  - No direct live execution path without going through the guard.
- **Action ledger & approvals** (governance wave) exist in the codebase:
  - Governance decisions are persisted and traced.
  - Sensitive actions are designed to be approval-gated and auditable.
- **Control loop stays planning-first**:
  - Work orders, mandates, arenas, and scoring engines operate in planning / evaluation space.
  - Execution remains behind explicit guardrails and is not auto-triggered by scores.

### Ventures workbench & profitability tooling

Under `src/features/ventures` the current venture engine includes:

- **Venture models & workbench**
  - `agent-venture-workstream.ts` and related files for agent venture workstreams.
  - Venture draft, suggestions, and cockpit helpers.
- **Revenue validation queues**
  - `agent-venture-prioritization.ts` — prioritisation of venture work.
  - `agent-revenue-validation-work-queue.ts` — queue of revenue validation work items.
  - `agent-venture-profitability.ts` — profitability-oriented aggregation.
- **EvidenceRef proof layer**
  - `evidence-ref.ts` defines **typed, trust-classified revenue evidence**:
    - Evidence kinds such as `stripe_charge`, `signed_loi`, `email_reply`, `analytics_event`, `screenshot`, `manual_note`, `self_reported`.
    - Only verified financial kinds (`stripe_charge`, `signed_loi`) can back realized cash.
    - `validateEvidenceRef`, `classifyEvidenceTrust`, `validateCashEvidence`, and `fromLegacyStringEvidence` harden “what counts as proof”.
  - This is the **anti-gaming foundation**: fake cash is blocked at the evidence layer.
- **AgentRevenueOutcome — venture work outcomes**
  - `agent-revenue-outcome.ts` captures the **cash-oriented outcome** of a single venture task:
    - Six signals: `customerProof`, `paymentSignal`, `painClarity`, `buyerIdentifiability`, `offerTestability`, `cashProximity`.
    - `cashGenerated` with `amountCents`, `verified`, `evidence`.
    - `nextCashAction` proposal (never execution).
    - Governance locks: `humanOnTheLoop: true`, `approvalRequired: true`, `noExecutionAuthorized: true`.
- **VentureCashScore — venture cash scoring**
  - `venture-cash-score.ts` scores **ventures**, not agents:
    - Weights cash and payment signals most heavily.
    - Produces `VentureCashScore` with:
      - `totalCashScore`, `cashScoreBand` (`blocked` → `cash_ready`).
      - `survivalStatus` (`insufficient_evidence`, `kill_candidate`, `pivot_candidate`, `continue_candidate`, `cash_ready`).
      - `shouldContinue`, `shouldPivot`, `isKillCandidate`, `shouldRequestCeoDecision`.
      - Governance locks: human-on-the-loop, approval-required, no-execution-authorized.
- **AgentOperatorScore — agent operator scoring**
  - `auto-agent-operator-score.ts` scores **agents as economic operators**:
    - Dimensions: `revenueImpact`, `economicInitiative`, `executionEfficiency`, `productionQuality`, `credibility`, `usefulInnovation`, `skillGrowth`.
    - Produces `AgentOperatorScore` with operator bands (`underperforming` → `elite_operator`) and flags:
      - `shouldAssignMoreWork`, `shouldRequireStrongerEvidence`, `shouldPairWithAgent`, `shouldFlagForReview`.
      - Governance locks: human-on-the-loop, approval-required, no-execution-authorized.
- **ExecutiveSelectionIndex — routing, not execution**
  - `executive-selection-index.ts` combines `VentureCashScore` and `AgentOperatorScore` into **allocation decisions**:
    - Ventures: `deserves_more_compute`, `maintain_allocation`, `should_be_paused`, `needs_ceo_review`, `kill_candidate`.
    - Agents: `deserves_more_work`, `maintain_allocation`, `needs_stronger_evidence`, `should_be_paired`, `flag_for_review`.
    - Always **proposals**, never direct execution; governance locks are pinned to true.

### ROI Arena — value & ROI evaluation

Under `src/server/arena/roi-arena.ts`:

- Defines `ArenaCandidate` and `ArenaVerdict` for **mission / idea / agent-action** candidates.
- `estimateCandidateValue` and `REVENUE_SANITY_CEILING_CENTS` implement:
  - Deterministic net value and ROI multiple based on caller-supplied revenue and cost.
  - A hard sanity ceiling to catch obviously invalid revenue inputs.
- The arena:
  - Classifies candidates as `promising`, `marginal`, `reject`, or `not-evaluable`.
  - Produces dry-run execution plans guarded by the runtime execution guard.
  - Never executes or persists anything directly.

### Next Action Mandate / thermostat track (in progress)

A new **Next Action Mandate** contract (PR193 wave) is being added under `src/server/agents`:

- `next-action-mandate-contract.ts` defines:
  - `NextActionMandateStatus`: `PENDING`, `ACCEPTED_FOR_NEXT_WORK`, `REFUTED`, `COUNTER_PROPOSED`, `IGNORED`, `NEEDS_CEO_DECISION`.
  - Mandate type, cash hypothesis, required evidence, expected cash impact, expected cost, expected ROI multiple.
  - Governance fields: `humanOnTheLoop: true`, `noExecutionAuthorized: true`.
- The mandate is a **planning / control-loop object**:
  - It captures the **next cash-oriented move**, not its execution.
  - It encodes whether the agent accepts, refutes, or counter-proposes the next action.
  - It is designed to be adapted into work-order planning, not into live runtime dispatch.

---

## Architecture map

High-level code structure for the current system:

| Path | Role |
|------|------|
| `src/app/` | Next.js App Router surfaces (`/hq`, `/hq/agents`, `/hq/cockpit`, `/hq/ventures`, etc.). |
| `src/features/ventures/` | Venture models, evidence (`EvidenceRef`), outcomes (`AgentRevenueOutcome`), scoring (`VentureCashScore`, `AgentOperatorScore`), workbench, profitability panels, queues. |
| `src/features/agents/` | Agent review queue, autonomy cockpit, knowledge packs, quality evaluation, observed agent outcomes, approval packets. |
| `src/features/cockpit/` | HQ cockpit shell, control chain, Joris dock, venture suggestions, morning readiness panel. |
| `src/server/agents/` | Agent server-side contracts (work orders, autonomy envelopes, next-action mandate), governance helpers, and planning-only invariants. |
| `src/server/arena/` | ROI Arena (`roi-arena.ts`) for value / ROI evaluation of mission / idea / agent-action candidates. |
| `src/server/runtime/` | Execution guard and runtime safety primitives (dry-run planning, not live execution). |
| `src/server/ventures/` | Venture repository, lifecycle service, row mapping, and save service for the venture domain. |
| `src/scripts/smoke/` | Smoke tests (`joris-booking.mjs`, runtime health checks) to validate critical flows. |
| `db/` | Migrations and verification SQL for ventures and governance tables. |
| `docs/` | Doctrine, governance specs, approval packet schemas, and operating model documents. |

---

## Safety model — what agents can and cannot do

### Agents may:

- **research** (collect information, scan options).
- **analyze** (compare options, critique, highlight risks).
- **score** (produce VentureCashScore / AgentOperatorScore / ROI Arena scores).
- **draft** (internal plans, briefs, scripts, offers).
- **compare** (ventures, agents, options, outcomes).
- **estimate ROI** (via ROI Arena and profitability engines).
- **prepare internal plans** (dry-run execution plans, validation paths).
- **propose next work** (Next Action Mandate, `nextCashAction`, routing suggestions).

### Agents may **not** do without explicit approval and guardrails:

- **contact customers** (send emails, messages, or book meetings).
- **spend money** (payments, transfers, purchases).
- **publish** (public content, posts, docs).
- **deploy** (infrastructure, code, config to production).
- **modify database** (schema or data writes outside the venture services).
- **connect external tools** (new external integrations).
- **bypass approvals** (no silent auto-approval flows).
- **perform live execution** (runtime dispatch without human-on-the-loop and logging).

These constraints are enforced by:

- Contract-level invariants (`humanOnTheLoop`, `approvalRequired`, `noExecutionAuthorized`).
- Central runtime guard (`execution-guard`) for any candidate that might be executed.
- Governance / ledger layers which record decisions and approvals.

---

## Venture profitability loop

The core profitability loop can be summarised as:

> **Evidence → Outcome → Score → ROI → Selection → Mandate → Next Work**

In more detail:

- **Evidence (`EvidenceRef`)**
  - Typed evidence with trust levels.
  - Weak signals (manual notes, self-reports) are allowed but always low trust.
  - Verified financial evidence (`stripe_charge`, `signed_loi`) is required to back real cash.
- **Outcome (`AgentRevenueOutcome`)**
  - Agent submits structured venture work outcomes with scores, basis, and evidence.
  - Positive `cashGenerated.amountCents` must be backed by evidence and a non-zero payment signal.
- **Score (`VentureCashScore`, `AgentOperatorScore`)**
  - Ventures are scored on cash readiness and survival status.
  - Agents are scored on operator quality and evidence discipline.
- **ROI (ROI Arena)**
  - Missions / ideas / agent-actions are evaluated with ROI arena.
  - Hard sanity ceilings guarantee financial inputs remain in a valid range.
- **Selection (ExecutiveSelectionIndex)**
  - Combines venture and agent scores into allocation decisions:
    - Which ventures deserve more compute or should be paused.
    - Which agents should receive more missions or be flagged for review.
- **Mandate (Next Action Mandate)**
  - Encodes the next cash-oriented move, plus required evidence and risk.
  - Agent can accept, refute, or counter-propose — preserving initiative.
- **Next Work**
  - Mandate is intended to be adapted into work-order planning, **not** into live execution.

**Exploration remains flexible**:

- Weak signals and low-trust evidence are allowed and preserved as such.
- Agents can propose next work even when evidence is early or incomplete.

**Accounting is strict**:

- Fake cash is blocked:
  - Positive cash requires verified financial evidence and non-zero payment signal.
  - ROI Arena enforces non-negative and ceiling-bounded financial inputs.
- High-confidence signals require evidence:
  - Claims scored ≥ thresholds must carry evidence arrays.

---

## Validation

From the repo root (`C:\Users\micha\Oria.HQ.Michael.HQ-APP`) using Windows PowerShell:

```powershell
npm run typecheck   # TypeScript strict
npm run lint        # ESLint
npm run build       # Next.js build
npm run smoke:joris # Joris smoke test
```

These four commands should pass before considering a merge.

---

## Development rules

Repository-wide working rules:

- **Small PRs** — small, well-scoped changes are easier to validate and review.
- **Pure/local models first** — add contracts and pure helpers before wiring runtime or DB.
- **No DB/API/runtime changes** without an explicit mandate and clear scope.
- **No duplicate concepts** — one canonical owner for each domain type
  (`EvidenceRef`, `AgentRevenueOutcome`, `VentureCashScore`, `AgentOperatorScore`, `NextActionMandate`, etc.).
- **No hardcoded secrets** — configuration via environment / tooling only.
- **No approval bypass** — all sensitive actions must flow through governance and guardrails.
- **No unguarded live execution** — runtime dispatch must always go through the execution guard and ledger.

---

## Roadmap (short)

Near-term direction for Orya HQ:

- **EvidenceRef integrated end-to-end** into `AgentRevenueOutcome`.
  - Typed, trust-aware evidence instead of raw string arrays.
- **Typed evidence-aware scoring** across VentureCashScore and AgentOperatorScore.
  - Higher-trust evidence yields higher confidence; low-trust evidence is down-weighted.
- **ROI Arena denominator & deeper integration**
  - Use net value and ROI multiple more systematically when routing ventures and missions.
- **Next Action Mandate → Work Order planning**
  - Adapter from mandates into work-order / mission planning, staying strictly planning-only.
- **Closed-loop work-order planning**
  - Evidence → outcome → scoring → selection → mandate → planned work → new evidence.
- **Later: persistence / runtime wiring after audit**
  - Only once the planning and governance layers are proven; execution remains gated.

This README is intentionally conservative: it describes the system as it exists and the immediate, already-coded directions, without over-claiming future capabilities.

---

## Contact

This is a private, owner-operated workspace.
If you are collaborating on Orya HQ and need additional context, start from:

- `docs/AGENT_GOVERNANCE_REVIEW_LOOP.md`
- `docs/AGENT_APPROVAL_PERSISTENCE_SCHEMA.md`
- `docs/AGENT_APPROVAL_PACKET_LEDGER_MAPPING.md`

and then reach out to Michael HQ via the internal channels agreed for this repository.
