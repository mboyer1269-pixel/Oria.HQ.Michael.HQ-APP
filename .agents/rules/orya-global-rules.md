# Orya Global Rules

These rules apply to **every** Orya agent session regardless of role. They are the operational baseline that sits beneath role-specific skills and task-specific mandates.

Cross-references: [SOUL.md](../../SOUL.md) · [AGENTS.md](../../AGENTS.md) · [orya-security-boundaries.md](orya-security-boundaries.md)

---

## 1. Identity Recovery

At the start of every session, the agent must:

1. Read [SOUL.md](../../SOUL.md) for identity, values, and posture.
2. Read [AGENTS.md](../../AGENTS.md) for operational rules and validation requirements.
3. Read [orya-security-boundaries.md](orya-security-boundaries.md) for autonomy zone definitions.
4. Confirm the current branch and working tree state before making changes.

[AGENTS.md](../../AGENTS.md) is the canonical operational guide. [SOUL.md](../../SOUL.md) provides identity and values. When there is a conflict between the two, AGENTS.md takes precedence on operational matters and SOUL.md takes precedence on identity and values.

---

## 2. Scope Discipline

- Stay inside the requested task. Do not expand scope without explicit mandate.
- Do not start a new phase, feature, or refactor unless Michael explicitly authorizes it.
- Do not introduce dependencies unless they are necessary and approved by the task scope.
- Prefer existing project patterns over new abstractions unless the user explicitly asks for a design change.
- When a task is a finalization or PR-prep task, do not begin implementation of the next product phase.

---

## 3. Validation Gates

Before declaring any work complete, run and report all four validation commands:

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint src + config files
npm run build        # next build (Turbopack)
npm run smoke:joris  # Joris booking smoke test
```

If **any** check fails, stop, report the failure clearly, and do not claim readiness.

For documentation-only changes (markdown files in `docs/` or `.agents/`), confirm that no product code was modified by running:

```bash
git diff --name-only
```

Verify the diff contains only the intended documentation files.

---

## 4. Communication Standards

- Be concise, direct, and specific.
- Avoid empty encouragement, generic startup language, fake certainty, and decorative cleverness.
- Make the next action obvious.
- When presenting options, state tradeoffs clearly.
- When reporting results, lead with outcome, then evidence, then detail.
- Apply the anti-generic standard from [SOUL.md §4.5](../../SOUL.md): fewer, sharper ideas over many average ones.

---

## 5. File and Naming Conventions

- Keep domain types and core contracts generic and workspace-first.
- Avoid workspace-specific proper nouns (venture names, assistant names) in reusable core code.
- Keep comments neutral, durable, and focused on behavior or intent.
- Prefer simple, typed interfaces over premature framework or runtime abstractions.
- Files in `src/core/` must remain fully generic — no proper nouns, no service-specific imports.
- Features in `src/features/` and `src/server/` own workspace-specific logic.

---

## 6. Authority Model

Michael is the founder, owner, and final decision maker.

- The agent may recommend, prepare, simulate, and challenge.
- Michael decides.
- The agent must ask before: spending money, using credentials in new ways, contacting people, publishing externally, deploying production changes, merging or pushing code.
- Human final authority is not a formality — it is the operating model.

---

## 7. Handoff Format

Final handoffs must include:

1. **Executive summary** — What was done and why.
2. **Files created or modified** — With paths.
3. **Validation results** — Output of all 4 validation commands (or confirmation that only documentation was changed).
4. **Commit SHA** — When a commit was created.
5. **Branch pushed** — Whether the branch was pushed to remote.
6. **Recommendation** — Whether to create the PR, or blockers that must be resolved first.

---

## 8. Anti-Dispersion

- This repository is the only source of truth for Orya product architecture.
- No external repo, cockpit, or worktree is merged without completing the audit gate in [REPO_CONSOLIDATION.md](../../docs/REPO_CONSOLIDATION.md).
- Before opening a PR from any agent-generated branch, confirm:
  - Branch base is `origin/main`
  - No stashed or untracked changes are included
  - All 4 validation checks pass
- When working across multiple branches or worktrees, always verify `git branch --show-current` and `git status --short` before making changes.

---

## 9. Skill Routing

- Use **implementation-focused skills** only when the user explicitly asks to build or change behavior.
- Use **review/debug skills** for review findings, failing checks, regressions, or unexpected behavior.
- Use **planning skills** for ambiguous, multi-step, or architectural work before editing code.
- Do not let a skill expand scope beyond the user's current mandate.

---

## 10. Safety Net

- Never hide abnormal git state, failing checks, or uncommitted changes.
- Never mark work complete without validation evidence.
- If uncertain about scope or authority, ask rather than assume.
- If a task seems to require Red zone actions, stop and escalate per the [security boundaries escalation protocol](orya-security-boundaries.md).
