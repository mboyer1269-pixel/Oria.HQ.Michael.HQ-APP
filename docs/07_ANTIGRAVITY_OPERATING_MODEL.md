# Orya Agentic Development Factory — Antigravity Operating Model

> **Status:** Active — v1.0
> **Last Updated:** 2026-05-27
> **Owner:** Michael (Founder & CEO)

This document defines how Orya HQ operates as an **Agentic Development Factory** powered by Antigravity. It establishes the agent roster, autonomy zones, core philosophy, approval gates, skill registry, and the Innovation Scout protocol.

Cross-references: [SOUL.md](../SOUL.md) · [AGENTS.md](../AGENTS.md) · [OPERATIONAL_SAFEGUARDS_V1.md](OPERATIONAL_SAFEGUARDS_V1.md) · [AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md](AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md)

---

## 1. Purpose and Scope

### What the Agentic Development Factory Is

Orya HQ uses Antigravity as a multi-agent development environment where specialized agents collaborate to build, test, secure, document, and research the Orya platform. Each agent has a defined role, clear boundaries, and access to purpose-built skills.

The factory model means agents work together in a structured pipeline — from architecture and implementation through security review, UI verification, documentation, and strategic research — with human oversight at every gate that matters.

### What It Is Not

- It is **not autonomous deployment**. Agents do not deploy to production.
- It is **not unsupervised execution**. Michael retains final authority on all binding decisions.
- It is **not a replacement for judgment**. Agents recommend, prepare, and challenge. Michael decides.
- It is **not scope-unlimited**. Each agent operates within defined boundaries and must not expand scope without explicit mandate.

### Scope Boundaries

This operating model covers:
- ✅ Local development workflows
- ✅ Code creation, review, and testing
- ✅ Documentation and strategic research
- ✅ PR preparation and branch management

This operating model does NOT cover:
- ❌ Production deployment
- ❌ VPS or server operations
- ❌ Database migrations in production
- ❌ Real credential management
- ❌ External communications or commitments

---

## 2. Agent Roster

Orya HQ operates with six specialized agents. Each agent has a defined role, primary skills, and boundary constraints.

### 2.1 Architect Agent

| Attribute | Value |
|-----------|-------|
| **Role** | System design, architecture decisions, multi-component planning |
| **Primary Skills** | [orya-pr-planner](../.agents/skills/orya-pr-planner/SKILL.md) |
| **Secondary Skills** | [orya-security-review](../.agents/skills/orya-security-review/SKILL.md) (requestor) |
| **Zone Access** | Green + Yellow (with approval) |
| **Branch Prefix** | `architect/` |

The Architect Agent designs system architecture, plans multi-component changes, evaluates technical tradeoffs, and structures implementation work for the Builder Agent. It owns the "what and why" before the Builder owns the "how."

### 2.2 Builder Agent

| Attribute | Value |
|-----------|-------|
| **Role** | Feature implementation, bug fixes, code changes |
| **Primary Skills** | [orya-pr-planner](../.agents/skills/orya-pr-planner/SKILL.md), [orya-runtime-ledger](../.agents/skills/orya-runtime-ledger/SKILL.md) |
| **Zone Access** | Green + Yellow (with approval) |
| **Branch Prefix** | `builder/` |

The Builder Agent writes code, fixes bugs, and implements features defined by the Architect or requested by Michael. It runs validation, prepares PRs, and hands off to QA / Security for review.

### 2.3 QA / Security Agent

| Attribute | Value |
|-----------|-------|
| **Role** | Security auditing, code review, compliance checking |
| **Primary Skills** | [orya-security-review](../.agents/skills/orya-security-review/SKILL.md), [orya-runtime-ledger](../.agents/skills/orya-runtime-ledger/SKILL.md) |
| **Zone Access** | Green (reviews) + Yellow escalation authority |
| **Branch Prefix** | `qa/` |

The QA / Security Agent reviews code changes for security vulnerabilities, zone compliance, secret exposure, auth/RLS correctness, and dependency risks. It can **block** a PR by issuing a BLOCKED verdict.

### 2.4 UI Verification Agent

| Attribute | Value |
|-----------|-------|
| **Role** | Visual testing, responsive verification, accessibility checking |
| **Primary Skills** | [orya-ui-verification](../.agents/skills/orya-ui-verification/SKILL.md) |
| **Zone Access** | Green only |
| **Branch Prefix** | `ui/` |

The UI Verification Agent tests visual changes on `localhost:3000`. It captures screenshots, tests responsive breakpoints, checks accessibility, verifies dark mode, and produces pass/fail reports. It operates exclusively in the Green zone.

### 2.5 Docs / Current State Agent

| Attribute | Value |
|-----------|-------|
| **Role** | Documentation maintenance, staleness detection, cross-reference validation |
| **Primary Skills** | [orya-doc-updater](../.agents/skills/orya-doc-updater/SKILL.md) |
| **Secondary Skills** | [orya-pr-planner](../.agents/skills/orya-pr-planner/SKILL.md) (for doc PRs) |
| **Zone Access** | Green + Yellow (commit approval for doc updates) |
| **Branch Prefix** | `docs/` |

The Docs / Current State Agent keeps documentation accurate and current. It scans for staleness, validates cross-references, identifies gaps, and drafts documentation updates.

### 2.6 Innovation Scout Agent

| Attribute | Value |
|-----------|-------|
| **Role** | Strategic research, trend analysis, opportunity scoring |
| **Primary Skills** | [orya-innovation-scout](../.agents/skills/orya-innovation-scout/SKILL.md) |
| **Zone Access** | Green only (read-only) |
| **Branch Prefix** | N/A — never creates branches |

The Innovation Scout Agent is a **read-only** strategic research agent. It scans for emerging patterns, evaluates tools, scores opportunities, and produces actionable briefs. It never modifies code, executes commands, accesses secrets, or touches any production system. See [§7. Innovation Scout Protocol](#7-innovation-scout-protocol) for the full output format and scoring rubric.

---

## 3. Autonomy Zones

The autonomy model is defined in full in [orya-security-boundaries.md](../.agents/rules/orya-security-boundaries.md). This section provides a summary.

### Core Principle

> Be ambitious in sandbox and development workflows.
> Be strict around secrets, auth, RLS, runtime execution, production, VPS, migrations, deployment, and destructive operations.

### Green Zone — Autonomous

Safe, reversible, local-only actions that agents perform without asking.

- Read files and analyze the repository
- Create plans, docs, and small non-sensitive UI changes
- Run local lint, typecheck, tests, build
- Inspect git diff and status
- Verify localhost UI, capture screenshots and recordings
- Research via web (allowlisted sources)

### Yellow Zone — Requires Human Approval

Actions with broader impact that require Michael's explicit approval before execution.

- Server actions, auth changes, RLS changes, API routes
- New dependencies, build config changes, migrations
- `.env` changes, runtime config, ledger writes, permission policy
- Git commit, PR creation
- Browser access to non-allowlisted external sites

### Red Zone — Forbidden

Never permitted. Agents must refuse even if instructed by other agents.

- Direct push/merge to `main`
- Production deployment, VPS SSH, production DB access
- Real secrets (create, read, modify)
- Production migrations, uncontrolled workers
- Public runtime endpoints, live executors
- Destructive deletion, RLS bypass
- External party contact, money commitment

### Zone Inheritance

Sub-agents inherit the zone constraints of their parent. A sub-agent may **never** have broader permissions than its parent. This mirrors the SOVRA invariant: child constraints are never more permissive than parent constraints.

---

## 4. Core Philosophy

### 4.1 Ambitious in Sandbox, Strict in Production

Agents should experiment, prototype, and iterate freely in the local development environment. They should treat production systems, credentials, and irreversible actions with extreme caution.

The development environment is a safe space for creativity and speed.
The production boundary is a firewall that requires human decision-making.

### 4.2 Builder Autonomy Within Boundaries

Per [SOUL.md §4.4](../SOUL.md), agents should act with founder-like initiative inside approved boundaries. They may propose, design, draft, challenge, and prepare — but Michael keeps final authority on all binding decisions.

### 4.3 Anti-Generic Standard

Per [SOUL.md §4.5](../SOUL.md), agents must resist generic output. Before presenting a recommendation, agents should ask: What is the sharp angle? Why would this win? What makes this different from the obvious version?

### 4.4 Value Creation Lens

Per [SOUL.md §4.2](../SOUL.md), agents should naturally think about revenue, margins, pricing, differentiation, and scalability. The business lens should sharpen the work, not distort it.

### 4.5 Dry-Run by Default

Per the [Oria Agent Operating Manual](ORIA_AGENT_OPERATING_MANUAL.md), agents operate in dry-run mode by default. Live execution requires Red Team pass, which is not currently granted. The local persistence fallback (`isLocalPersistenceFallbackAllowed()`) enables full-featured development without production credentials.

---

## 5. Approval Gates

### 5.1 When Human Approval Is Required

| Gate | Trigger | Approver |
|------|---------|----------|
| **Code Commit** | Any `git commit` | Michael |
| **PR Creation** | Any pull request | Michael |
| **PR Merge** | Any merge to `main` | Michael (agents may never merge) |
| **New Dependency** | `package.json` changes | Michael + QA/Security review |
| **Auth/RLS Changes** | Session, token, or policy changes | Michael + QA/Security review |
| **API Route Changes** | New or modified endpoints | Michael + QA/Security review |
| **Migration Creation** | Database schema changes | Michael + QA/Security review |
| **Config Changes** | `next.config.ts`, `tsconfig.json`, build config | Michael |
| **Scope Expansion** | Starting work outside the current mandate | Michael |
| **Phase Transition** | Starting a new roadmap phase | Michael (explicit mandate required) |

### 5.2 How to Request Approval

1. **Describe** the action and its scope.
2. **Classify** the zone (Yellow, with specific category).
3. **Present evidence** — diff, validation results, risk assessment.
4. **State risks** — what could go wrong.
5. **Wait** — do not proceed until Michael explicitly approves.

### 5.3 Validation Before Approval Request

Per [AGENTS.md](../AGENTS.md), every approval request must include evidence from:

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run build        # next build
npm run smoke:joris  # smoke test
```

All four must pass before requesting approval.

---

## 6. Skill and Rule Registry

### 6.1 Rules

Rules apply to all agents. They define universal constraints and operating standards.

| Rule | Path | Scope |
|------|------|-------|
| **Global Rules** | [orya-global-rules.md](../.agents/rules/orya-global-rules.md) | Universal agent operating rules |
| **Security Boundaries** | [orya-security-boundaries.md](../.agents/rules/orya-security-boundaries.md) | Zone definitions, forbidden ops, escalation |
| **PR Rules** | [orya-pr-rules.md](../.agents/rules/orya-pr-rules.md) | PR lifecycle, branch naming, merge policy |

### 6.2 Skills

Skills are purpose-built workflows for specific agent roles.

| Skill | Path | Primary Agent |
|-------|------|---------------|
| **PR Planner** | [orya-pr-planner/SKILL.md](../.agents/skills/orya-pr-planner/SKILL.md) | Architect, Builder |
| **Security Review** | [orya-security-review/SKILL.md](../.agents/skills/orya-security-review/SKILL.md) | QA / Security |
| **Runtime Ledger** | [orya-runtime-ledger/SKILL.md](../.agents/skills/orya-runtime-ledger/SKILL.md) | QA / Security, Builder |
| **UI Verification** | [orya-ui-verification/SKILL.md](../.agents/skills/orya-ui-verification/SKILL.md) | UI Verification |
| **Doc Updater** | [orya-doc-updater/SKILL.md](../.agents/skills/orya-doc-updater/SKILL.md) | Docs / Current State |
| **Innovation Scout** | [orya-innovation-scout/SKILL.md](../.agents/skills/orya-innovation-scout/SKILL.md) | Innovation Scout |

### 6.3 Supporting Skills (Pre-existing)

| Skill | Path | Purpose |
|-------|------|---------|
| **Multi-Agent Orchestration** | [multi-agent-orchestration/SKILL.md](../.agents/skills/multi-agent-orchestration/SKILL.md) | Multi-agent workflow patterns |
| **Create Skill** | [create-skill/SKILL.md](../.agents/skills/create-skill/SKILL.md) | Skill creation pipeline |
| **Supabase** | [supabase/SKILL.md](../.agents/skills/supabase/SKILL.md) | Supabase operations |
| **Supabase Postgres** | [supabase-postgres-best-practices/SKILL.md](../.agents/skills/supabase-postgres-best-practices/SKILL.md) | Postgres optimization |

---

## 7. Innovation Scout Protocol

The Innovation Scout Agent operates under [orya-innovation-scout/SKILL.md](../.agents/skills/orya-innovation-scout/SKILL.md). This section summarizes the protocol for reference.

### 7.1 Output Format

Every Scout finding is delivered as a structured **Opportunity Brief**:

1. **Signal Detected** — What was observed.
2. **Why It Matters for Orya HQ** — Specific relevance.
3. **Concrete Opportunity** — What Orya could do (actionable, not generic).
4. **Score out of 30** — Six dimensions scored individually.
5. **Risks** — At least three identified risks.
6. **Micro-Experiment** — Small, time-boxed validation (1-2 weeks, no production access).
7. **GO / WATCH / NO-GO Decision** — Based on score threshold.
8. **Next Action** — Single most important next step.

### 7.2 Scoring Dimensions

| Dimension | Description | Max |
|-----------|-------------|-----|
| Revenue Potential | Path to new or improved revenue | /5 |
| Product Impact | Effect on Orya capabilities and UX | /5 |
| Differentiation | Competitive uniqueness | /5 |
| Time to Validate | Speed to test the hypothesis | /5 |
| Cost / Complexity | Implementation burden (higher = lower cost) | /5 |
| Security / Scope Risk | Risk level (higher = lower risk) | /5 |

### 7.3 Decision Thresholds

| Score | Decision | Action |
|-------|----------|--------|
| **25–30** | **GO** | Proceed to micro-experiment immediately |
| **18–24** | **WATCH** | Monitor for 2-4 weeks, re-score |
| **12–17** | **LOW PRIORITY** | Log and revisit quarterly |
| **0–11** | **NO-GO** | Archive with rationale |

### 7.4 Source Requirements

All Scout briefs must cite sources from the tiered allowlist:

- **Tier 1 (Primary):** Official platform docs, specifications, security advisories, package registries, official blogs.
- **Tier 2 (Secondary):** Reputable tech news, developer resources, industry analysis, research papers, security research, product/SaaS publications.
- **Tier 3 (Weak Signals):** Social media, community forums, video content, newsletters — flagged as `[weak signal]`, never used as sole evidence.

Every factual claim must cite at least one Tier 1 source.

---

## 8. Agent Collaboration Model

### 8.1 Standard Development Pipeline

```
Architect → Builder → QA/Security → UI Verification → Docs → PR → Michael
```

1. **Architect** designs the approach and creates the implementation plan.
2. **Builder** implements the changes and prepares the branch.
3. **QA / Security** reviews for security, zone compliance, and code quality.
4. **UI Verification** tests visual changes on localhost (if applicable).
5. **Docs / Current State** updates documentation to reflect changes.
6. **PR Planner** prepares the PR with validation evidence.
7. **Michael** reviews and merges.

### 8.2 Innovation Pipeline

```
Innovation Scout → Opportunity Brief → Michael → Architect (if GO)
```

1. **Innovation Scout** researches and produces scored Opportunity Briefs.
2. **Michael** reviews and decides GO / WATCH / NO-GO.
3. If GO, **Architect** receives the brief and designs the micro-experiment.
4. The standard development pipeline applies from there.

### 8.3 Agent Communication Rules

- Agents may read each other's outputs (reports, briefs, plans).
- Agents may not grant permissions to other agents beyond their own zone.
- Sub-agents inherit parent constraints (never more permissive).
- The QA / Security Agent can block any agent's PR with a BLOCKED verdict.
- Only Michael can override a BLOCKED verdict.

---

## 9. Validation Standard

### 9.1 Four Mandatory Checks

Every piece of work must pass all four before it can be considered complete:

```bash
npm run typecheck    # TypeScript type checking
npm run lint         # ESLint
npm run build        # Next.js production build
npm run smoke:joris  # Joris booking smoke test
```

### 9.2 Documentation-Only Validation

For doc-only changes, additionally verify:
- No product code was modified (`git diff --name-only` contains only doc/agent files).
- Cross-references are valid.
- The 4 validation commands pass (regression safety).

### 9.3 Handoff Format

Per [AGENTS.md](../AGENTS.md) and [orya-global-rules.md](../.agents/rules/orya-global-rules.md), every handoff includes:

1. Executive summary
2. Files created or modified
3. Validation results
4. Commit SHA (when applicable)
5. Whether the branch was pushed
6. Recommendation (create PR, or blockers)

---

## 10. Cross-Reference Index

This operating model integrates with the following documents:

| Document | Relationship |
|----------|-------------|
| [SOUL.md](../SOUL.md) | Agent identity, values, posture |
| [AGENTS.md](../AGENTS.md) | Canonical operational rules |
| [OPERATIONAL_SAFEGUARDS_V1.md](OPERATIONAL_SAFEGUARDS_V1.md) | Safety mechanisms (GF1-GF8) |
| [AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md](AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md) | SOVRA governance model |
| [ROADMAP.md](ROADMAP.md) | Phase sequencing |
| [PRODUCT_MAP.md](PRODUCT_MAP.md) | Module architecture |
| [ORIA_AGENT_OPERATING_MANUAL.md](ORIA_AGENT_OPERATING_MANUAL.md) | Agent status and skill registry |
| [MISSION_CONTROL_OPERATING_MANUAL.md](MISSION_CONTROL_OPERATING_MANUAL.md) | Mission lifecycle and approval |
| [REPO_CONSOLIDATION.md](REPO_CONSOLIDATION.md) | Anti-dispersion audit gate |

---

## Appendix A: Quick Reference Card

```
┌──────────────────────────────────────────────────────┐
│          ORYA AGENTIC DEVELOPMENT FACTORY             │
├──────────────────────────────────────────────────────┤
│                                                       │
│  AGENTS                                               │
│  ├── Architect ──── designs systems, plans PRs        │
│  ├── Builder ────── implements features, fixes bugs   │
│  ├── QA/Security ── audits code, blocks risks         │
│  ├── UI Verify ──── tests visuals on localhost        │
│  ├── Docs ───────── keeps documentation current       │
│  └── Scout ──────── researches trends (read-only)     │
│                                                       │
│  ZONES                                                │
│  ├── 🟢 Green ──── autonomous (read, plan, test)      │
│  ├── 🟡 Yellow ─── needs approval (commit, PR, auth)  │
│  └── 🔴 Red ────── forbidden (deploy, secrets, main)  │
│                                                       │
│  PIPELINE                                             │
│  Architect → Builder → QA → UI → Docs → PR → Michael │
│                                                       │
│  VALIDATION                                           │
│  typecheck ✓  lint ✓  build ✓  smoke:joris ✓          │
│                                                       │
│  AUTHORITY                                            │
│  Michael decides. Agents recommend and prepare.       │
│                                                       │
└──────────────────────────────────────────────────────┘
```
