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

## What Remains To Build

- Phase 1 must not start until Michael explicitly mandates it.
- Workspace-specific runtime adapters remain future work.
- Permission execution behavior remains future work beyond the current foundation.
- Workspace configuration and seed-file expansion remain future work.
- Any additional assistant runtime integration remains future work until explicitly scoped.
