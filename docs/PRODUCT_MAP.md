# Oria Product Map

Last updated: 2026-05-27 (see `docs/ORIA_HQ_CURRENT_STATE.md` for live inventory)

## Purpose

Oria is a workspace-first operator platform. Its mission is to give a founder or small team a single, auditable surface to manage AI assistants, approve agent actions, track costs, and make decisions — without surrendering control to autonomous systems.

## Product Layers

```
┌──────────────────────────────────────────────────────────┐
│                    Workspace Shell (HQ)                   │
│       Nav, workspace selector, mode indicator            │
├──────────────────────────────────────────────────────────┤
│  Joris Chat  │  Agent Command  │  Venture Lab │  Vault   │
│  (live)      │  Center (Ph 2)  │  (Phase 3)   │  (Ph 4)  │
├──────────────────────────────────────────────────────────┤
│    Mission Domain Model  │  Permission Engine  │  Ledger  │
│    (Phase 1 — stable)    │  (foundation live)  │  (live)  │
├──────────────────────────────────────────────────────────┤
│         Core Contracts: WorkspaceContext, Registry        │
│         AssistantProfile, PermissionPolicy, types.ts      │
├──────────────────────────────────────────────────────────┤
│    Supabase (auth + storage)  │  AI Providers  │  Local   │
│    + local in-memory fallback │  (multi-model) │  fallback│
└──────────────────────────────────────────────────────────┘
```

## Modules

| Module | Status | Phase | Notes |
| --- | --- | --- | --- |
| Workspace Context Foundation | Live | Phase 0 | `ActiveWorkspaceContext`, registry, seed |
| Joris Chat | Live | Phase 0 | Booking intent, calendar, decision+action ledger (#88–#90) |
| HQ Operator Snapshot | Live | Phase 0 | Read-only `/hq` panel — runtime, ledger, guardrails (#92) |
| Permission Policy Types | Live | Phase 0 | `PermissionPolicy`, `PermissionRule` |
| Action Queue Types | Live | Phase 0 | `ActionQueueItem`, `ActionApproval` |
| Calendar (workspace-scoped) | Live | Phase 0 | `calendar_events.workspace_id` (#89); local + Supabase |
| Mission Control UI | Live | Phase 1 | `/hq/missions`, dry-run plan API; live executor locked |
| Mission persistence (Supabase) | Partial | Phase 1 | Schema proposed; migrations in repo, not fully wired |
| Agent Registry + Skills Catalog | Live | Phase 2 | `/hq/agents`, `/hq/skills` |
| Agent Command Center (full) | Partial | Phase 2 | Missions/agents live; costs/autonomy depth planned |
| Venture Lab | Planned | Phase 3 | Idea scoring, decision states |
| Memory Vault | Planned | Phase 4 | Typed docs, workspace-bound context |
| Money Cockpit | Planned | Phase 5 | Spend, ROI, runway tracking |
| Coding Coach | Planned | Phase 6 | Audit, explain, PR prep |
| DuoSync Decision Gate | Future | Phase 7 | Audit before any import |
| Hermes / Runtime Adapters | Future | Phase 8 | External agent reporting, read-only first |

## What Belongs In Core

Core (`src/core/types.ts`, `src/core/`) must stay **generic and workspace-first**:

- Domain type shapes: `Workspace`, `AssistantProfile`, `Mission`, `PermissionPolicy`, `ActionQueueItem`
- Primitive ID types: `WorkspaceId`, `AssistantProfileId`, `MissionStatus`, etc.
- No workspace-specific proper nouns (no "michael", no "Joris", no "Oria HQ")
- No external service imports, no database calls

## What Belongs In Features

Feature modules (`src/features/`, `src/server/`) own workspace-specific logic, AI calls, and persistence:

- Workspace registry and seed files (`src/core/workspaces/registry.ts`)
- Joris persona and brain (`src/server/joris/`)
- Calendar, contacts, documents integrations
- Supabase repositories and local fallbacks

## Anti-Dispersion Rule

Before any external concept, repo, or module is added to this codebase, record in `docs/REPO_CONSOLIDATION.md`:

1. Problem it solves
2. Owner
3. Link to Oria Core
4. Maintenance cost
5. Decision: `merge`, `feature-module`, `archive`, or `external-reference`
6. Validation plan
