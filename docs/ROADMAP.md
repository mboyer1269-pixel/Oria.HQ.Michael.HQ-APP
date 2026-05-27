# Oria Roadmap

Last updated: 2026-05-27 (operational truth: `docs/ORIA_HQ_CURRENT_STATE.md`)

This roadmap keeps Oria buildable by sequencing foundations before UI expansion. Each phase must pass validation before the next phase starts.

## Phase 0: Consolidation And Anti-Dispersion

**Objective:** Make `Oria.HQ.Michael.HQ-APP` the clear product source of truth and stop parallel cockpit drift.

**Deliverables:**
- `docs/PRODUCT_MAP.md`
- `docs/ROADMAP.md`
- `docs/REPO_CONSOLIDATION.md`
- `docs/MISSION_MODEL_PROPOSAL.md`
- pure Mission types in `src/core/types.ts`
- `smoke:joris` validation script

**Non-objectives:**
- no UI feature;
- no auth change;
- no schema change;
- no external repo merge;
- no behavior change.

**Risks:**
- existing branch already contains broad Claude-side changes;
- docs can become stale if product decisions happen outside this repo;
- too many cockpit ideas can dilute the next foundation.

**Definition of done:**
- consolidation docs exist and identify Oria as source of truth;
- Mission model is proposed without runtime wiring;
- `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run smoke:joris` are executed and reported.

**Shipped on `main` (post-consolidation, see `ORIA_HQ_CURRENT_STATE.md`):**
- PR #96 (`4af014c`): Joris `calendar.book` → Mission Draft proposal + explicit confirm before booking; local mission draft + `missionId` on ledger; no Supabase mission writes.
- PRs #94–#95: Ledger Activity panel and mission ↔ ledger traceability labels (**Liée** / **Orphelin**).

## Phase 1: Mission Domain Model

**Objective:** Make Mission the typed unit of work for agents, command center actions, approvals, and ledger entries.

**Deliverables:**
- Mission contract finalized from `docs/MISSION_MODEL_PROPOSAL.md`;
- status, risk, autonomy, result, and approval requirement types;
- service/repository design approved before implementation;
- tests for mission status transitions when implementation starts.

**Non-objectives:**
- no mission UI;
- no autonomous execution;
- no new DB table until migration is explicitly approved;
- no replacement of Joris **mission execution** behavior (calendar booking uses Mission Draft gate #96; still not live executor).

**Risks:**
- overbuilding the model before real agent runs demand it;
- duplicating existing `agent_runs` or `action_ledger`;
- mixing workspace isolation with Michael-specific assumptions.

**Definition of done:**
- Mission contract is stable;
- Mission relationship to action queue, permissions, and ledger is explicit;
- no runtime behavior changes without a follow-up approved implementation PR.

## Phase 2: Agent Command Center

**Objective:** Provide one operational surface for agent registry, missions, run logs, costs, autonomy, and approvals.

**Deliverables:**
- agent mission list;
- run log summary;
- approval queue view;
- cost and autonomy indicators;
- clear distinction between proposed, approved, running, completed, failed, and blocked work.

**Non-objectives:**
- no new agent runtime;
- no auto-send or auto-publish;
- no permission bypass;
- no broad HQ redesign.

**Risks:**
- turning the command center into another static dashboard;
- adding UI before Mission is stable;
- making autonomy look more mature than it is.

**Definition of done:**
- owner can see what each agent is doing and what needs approval;
- every action links back to Mission, PermissionPolicy, and ActionLedger concepts;
- unsafe actions remain approval-gated.

## Phase 3: Venture Lab

**Objective:** Give the owner a disciplined way to evaluate business ideas before committing agent time, money, or development effort.

**Deliverables:**
- venture idea model;
- scoring dimensions: market pain, monetization, autonomy fit, risk, speed to test;
- decision states: `Kill`, `Hold`, `Research`, `Build`, `Launch`;
- Joris scoring draft flow;
- lightweight list/detail surface after the model is approved.

**Non-objectives:**
- no CRM;
- no investor deck generator;
- no automatic launch decision;
- no scraping beyond already approved Market Scout scope.

**Risks:**
- subjective scoring without evidence;
- turning every idea into a build project;
- confusing venture decisions with active missions.

**Definition of done:**
- each venture has a scored decision and evidence notes;
- decisions are auditable;
- `Build` and `Launch` decisions require explicit owner approval.

## Phase 4: Memory Vault

**Objective:** Make documents, decisions, SOPs, notes, and workspace context usable without leaking across boundaries.

**Deliverables:**
- vault entry contract;
- document metadata cleanup;
- decision/SOP/note categorization;
- server-side search plan;
- Joris memory capture design.

**Non-objectives:**
- no vector database by default;
- no public sharing;
- no cross-workspace reads;
- no bulk document ingestion without review.

**Risks:**
- memory becomes untrusted clutter;
- private data leaks into prompts;
- storage cost grows without retention rules.

**Definition of done:**
- vault entries are typed and workspace-bound;
- Joris can reference only allowed workspace context;
- memory reads are source-labeled.

## Phase 5: Money Cockpit

**Objective:** Track runway, AI spend, goals, ROI, and costs per agent or mission.

**Deliverables:**
- manual financial snapshot model;
- AI cost tracking plan;
- mission cost budget and actual cost;
- ROI view by agent and mission;
- runway and target MRR surface.

**Non-objectives:**
- no bank integration;
- no billing automation;
- no tax logic;
- no accounting replacement.

**Risks:**
- inaccurate numbers if estimates are not labeled;
- scope creep into invoicing;
- cost tracking tied to provider-specific assumptions.

**Definition of done:**
- spend and ROI are visibly labeled as manual, estimated, or measured;
- each agent/mission can show cost impact;
- no financial action can execute without approval.

## Phase 6: Coding Coach

**Objective:** Convert the coding-cockpit ideas into an Oria module that helps audit repos, explain errors, prepare PRs, and validate changes.

**Deliverables:**
- repo audit draft model;
- error explanation flow;
- PR prep checklist;
- Claude Code / Codex prompt library;
- validation command capture.

**Non-objectives:**
- no auto-fix by default;
- no secret exposure;
- no CI/CD replacement;
- no import of `oria-coding-coach-cockpit` without audit.

**Risks:**
- scanning large repos becomes slow or expensive;
- generated advice may overreach;
- code tooling may leak file contents into unsafe contexts.

**Definition of done:**
- coding coach outputs are draft-only;
- validation evidence is captured;
- secrets and `.env` files are excluded.

## Phase 7: DuoSync Decision Gate

**Objective:** Decide whether DuoSync becomes an Oria module, remains external, or is archived.

**Deliverables:**
- DuoSync audit;
- overlap analysis with Mission, Venture Lab, and Agent Command Center;
- `docs/DUOSYNC_DECISION.md`;
- merge/module/archive recommendation.

**Non-objectives:**
- no DuoSync code import;
- no assumption that DuoSync belongs in Oria;
- no new synchronization layer before the decision.

**Risks:**
- duplicating mission/task/workflow models;
- importing static seed UI as product truth;
- adding maintenance burden without revenue or workflow benefit.

**Definition of done:**
- explicit decision recorded;
- maintenance cost estimated;
- validation plan defined if any import is approved.

## Phase 8: Hermes / Runtime Adapters

**Objective:** Allow optional external agent runtimes to report work into Oria without becoming Oria's source of truth.

**Deliverables:**
- runtime adapter contract;
- event payload for external agent run updates;
- read-only adapter proof first;
- permission and ledger mapping;
- failure isolation rules.

**Non-objectives:**
- no merge of `hermes-*` repos;
- no required desktop runtime;
- no external runtime bypassing Oria permissions;
- no publish/send automation.

**Risks:**
- adapter designed before real runtime needs are known;
- runtime state diverges from Oria state;
- external agents imply more autonomy than approvals allow.

**Definition of done:**
- Oria still works without adapters;
- all external run events are source-labeled;
- writes and publishes remain approval-gated.
