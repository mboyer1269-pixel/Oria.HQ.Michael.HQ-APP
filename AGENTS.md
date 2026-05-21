# AGENTS.md

## Project Mission

Oria is a workspace-first operator platform. The product should evolve from the current single-owner foundation toward configurable workspaces, assistant profiles, permissioned actions, and runtime adapters without baking any one person, assistant, or venture into core application contracts.

## Critical Rules

1. Never modify secrets, `.env`, API keys, or credentials.
2. Never start a new phase, feature, or refactor without an explicit mandate.
3. Always validate with typecheck, lint, build, and smoke checks before declaring work complete.

## Agent Operating Model

- Treat this file as the canonical operating guide for agents working in this repository.
- Confirm the current branch, working tree state, and user mandate before making changes.
- Keep changes scoped to the requested task and avoid opportunistic refactors.
- Prefer existing project patterns over new abstractions unless the user explicitly asks for a design change.
- When a task is a finalization or PR-prep task, do not begin implementation of the next product phase.

## Skill Routing

- Use implementation-focused skills only when the user explicitly asks to build or change behavior.
- Use review/debug skills for review findings, failing checks, regressions, or unexpected behavior.
- Use planning skills for ambiguous, multi-step, or architectural work before editing code.
- Do not let a skill expand scope beyond the user's current mandate.

## Safety & Git Guardrails

- Never modify secrets, `.env`, API keys, credentials, or generated secret material.
- Never run destructive Git commands such as hard resets, force pushes, or checkout-based reverts unless Michael explicitly approves them.
- Do not revert user changes unless explicitly instructed.
- Before committing, inspect status and diff so only relevant files are included.
- Push only when the user has requested it and validation has passed.

## Coding Standards

- Keep domain types and core contracts generic and workspace-first.
- Avoid workspace-specific proper nouns in reusable core code.
- Keep comments neutral, durable, and focused on behavior or intent.
- Prefer simple, typed interfaces over premature framework or runtime abstractions.
- Do not introduce dependencies unless they are necessary and approved by the task scope.

## Validation Before Completion

Before declaring work complete, run and report:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run smoke:joris`

If any check fails, stop, report the failure clearly, and do not claim readiness.

## Handoff Format

Final handoffs should include:

- Executive summary.
- Files created or modified.
- Validation results.
- Commit SHA, when a commit was created.
- Whether the branch was pushed.
- Recommendation to create the PR or block.

## Never Do

- Never modify secrets, `.env`, API keys, credentials, or credential references outside the requested scope.
- Never start Phase 1 or any later phase without explicit instruction.
- Never change application code during documentation-only or finalization tasks.
- Never mark work complete without validation evidence.
- Never hide abnormal Git state, failing checks, or uncommitted changes.

## Anti-Dispersion / Worktree Safety

- This repository is the only source of truth for Oria product architecture, core contracts, auth, permissions, action ledger, and workspace boundaries.
- No external repo, cockpit, or worktree is merged without completing the audit gate in `docs/REPO_CONSOLIDATION.md`.
- The worktree at `C:\Users\micha\Projects\michael-hq-oria-review` must not be used as a source of changes for this repository.
- The branch `claude/oria-refactor-foundation` was based on an older state and must not be merged.
- Before opening a PR from any agent-generated branch, confirm: branch base is `origin/main`, no stashed or untracked changes are included, and all 4 validation checks pass.
- When working across multiple branches or worktrees, always verify `git branch --show-current` and `git status --short` before making changes.

## What Remains To Build

- Phase 1 must not start until Michael explicitly mandates it.
- Workspace-specific runtime adapters remain future work.
- Permission execution behavior remains future work beyond the current foundation.
- Workspace configuration and seed-file expansion remain future work.
- Any additional assistant runtime integration remains future work until explicitly scoped.

## Cursor Cloud specific instructions

### Service overview

This is a monolithic Next.js 16 app (App Router + Turbopack). There are no Docker services or databases to run locally — all external services (Supabase, AI providers) are optional in dev thanks to local-persistence fallback.

### Starting the dev server

```
npm run dev          # http://localhost:3000
```

### Validation commands (see "Validation Before Completion" above)

```
npm run typecheck    # tsc --noEmit
npm run lint         # eslint src + config files
npm run build        # next build (Turbopack)
npm run smoke:joris  # Joris booking smoke test (runs locally, no API keys needed)
```

### Key gotchas

- The app runs fully without Supabase or AI API keys in development. `isLocalPersistenceFallbackAllowed()` activates when `NODE_ENV !== "production"`, so calendar events, contacts, and the action ledger all work locally in-memory.
- `npm run smoke:joris` exercises the Joris booking intent parser, calendar writer, and action ledger in local mode — it does **not** require any API keys or a running dev server.
- The `/api/joris/chat` endpoint requires authentication (Supabase session). Without Supabase credentials the endpoint returns `401`. The contact API (`/api/contact`) is public and works without auth.
- Node.js 22+ and npm 10+ are required. The project uses `package-lock.json` (npm), not pnpm or yarn.
