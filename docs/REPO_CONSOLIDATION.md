# Oria Repo Consolidation

Last updated: 2026-05-21

## Official Repository

### HQ constructor publication — 30 September 2026

The current constructor plan is [PLAN-HQ-CONSTRUCTEUR.md](PLAN-HQ-CONSTRUCTEUR.md)
and its tracked acceptance checklist is [HQ_TASKS.md](HQ_TASKS.md).
The plan is a publication snapshot of the companion integration workspace;
future changes to the product plan must keep these references consistent.

Companion repository decision:

1. **Problem:** preserve the host runner, deployment qualification scripts and
   integration evidence that previously existed only outside GitHub.
2. **Owner:** the ORIA HQ development team under the repository owner's authority.
3. **Core link:** the runner consumes HQ mission contracts and project-scoped Memex
   context. HQ remains the authority for application identity and mission state.
4. **Maintenance cost:** pinned container dependencies, host Python scripts,
   qualification fixtures and documented runtime configuration.
5. **Decision:** `external-reference` — keep these files in the private
   [oria-hq-orchestrator](https://github.com/mboyer1269-pixel/oria-hq-orchestrator)
   repository. No foreign application, auth implementation or UI shell is imported.
6. **Validation:** host tests passed separately; HQ publication checks are recorded
   in [HQ_PUBLICATION_2026-09-30.md](HQ_PUBLICATION_2026-09-30.md).

This publication is not a deployment or an approval of account access. OpenHands
qualification has priority over historical Paperclip-first assumptions.

`mboyer1269-pixel/Oria.HQ.Michael.HQ-APP` is the official Oria repository and the only source of truth for product architecture, core contracts, authentication, permissions, action ledger, workspace boundaries, model routing, and future mission orchestration.

## Secondary Repositories And Projects

| Repo / Project | Current Status | Decision | Rationale |
| --- | --- | --- | --- |
| `mboyer1269-pixel/oria-coding-coach-cockpit` | Reference repo | Future Coding Coach module candidate | Useful concepts for repo audit, PR prep, validation, and agent coaching. Not source of truth. |
| `mboyer1269-pixel/oria-hq` | Superseded | Archive/reference only | Replaced by `Oria.HQ.Michael.HQ-APP`. No direct merge. |
| `C:\Users\micha\Projects\duosync` | Local MVP/reference | Phase 7 decision gate | Useful work sync model, but overlaps with Mission and Agent Command Center. Audit required before import. |
| `hermes-workspace` | External/runtime reference | Concepts only | May inform runtime adapters. No code import. |
| `hermes-hudui` | UI reference | Concepts only | May inspire HUD patterns. No code import. |
| `hermes-desktop` | Desktop/runtime reference | Future adapter candidate | Separate product decision. Oria must remain usable without it. |

## What Is Archived

- Superseded Oria prototypes are archived by decision unless a future audit proves a specific module should be extracted.
- Static cockpit demos are reference material, not platform contracts.
- Any repo without a clear owner, product problem, and validation path remains external.

## What Becomes A Future Module

- `oria-coding-coach-cockpit` can become **Coding Coach** after audit.
- `duosync` can become a **Work Sync / Operations module** only after Phase 7.
- Hermes runtime projects can become **runtime adapters** only after Mission and Agent Command Center are stable.

## What Must Not Be Merged

- No external repo is merged wholesale.
- No auth, Supabase, permission, or workspace code is copied from another repo.
- No UI shell becomes source of truth.
- No runtime adapter becomes mandatory infrastructure.
- No external agent can write, publish, send, bill, or modify client data without Oria permission gates.

## Anti-Dispersion Protocol

Before any module, repo, cockpit, agent runtime, or external concept becomes part of Oria, record:

1. **Problem:** the specific pain it solves.
2. **Owner:** who maintains it.
3. **Core link:** how it connects to Oria Core.
4. **Maintenance cost:** code, dependencies, runtime cost, support burden.
5. **Decision:** `merge`, `feature-module`, `archive`, or `external-reference`.
6. **Validation:** typecheck, lint, build, and relevant smoke tests.

## Future Audit Checklist

- Read README, package scripts, dependencies, and tests.
- Identify secrets, env files, and credential references without exposing values.
- Map overlapping concepts against Oria Core, Mission, Agent Command Center, and Venture Lab.
- Estimate migration size and ongoing maintenance cost.
- Decide whether to extract a typed concept, a UI pattern, a workflow, or nothing.
- Validate in an isolated branch before any merge.
