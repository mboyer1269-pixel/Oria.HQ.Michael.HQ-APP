# Orya PR Rules

These rules govern the pull request lifecycle for all Orya agent-generated branches. They apply to every agent that creates, prepares, or reviews PRs.

Cross-references: [orya-global-rules.md](orya-global-rules.md) · [orya-security-boundaries.md](orya-security-boundaries.md) · [AGENTS.md](../../AGENTS.md)

---

## 1. Branch Naming Convention

All agent-created branches must follow this pattern:

```
<agent-prefix>/<scope>-<short-description>
```

| Agent | Prefix |
|-------|--------|
| Architect Agent | `architect/` |
| Builder Agent | `builder/` |
| QA / Security Agent | `qa/` |
| UI Verification Agent | `ui/` |
| Docs / Current State Agent | `docs/` |
| Innovation Scout Agent | N/A — read-only, never creates branches |
| Generic / Antigravity | `agent/` |

Examples:
- `builder/mission-domain-model`
- `docs/update-roadmap-phase1`
- `qa/security-audit-api-routes`
- `architect/workspace-config-schema`

---

## 2. Pre-PR Checklist

Before creating a PR, the agent must verify **all** of the following:

### Branch Verification
- [ ] Branch is based on current `origin/main` (run `git log --oneline origin/main..HEAD` to confirm lineage)
- [ ] Branch name follows the naming convention above
- [ ] No untracked files that should be excluded (run `git status --short`)
- [ ] No stashed changes that belong in this PR

### Code Validation (4 mandatory checks)
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] `npm run smoke:joris` passes

### Diff Inspection
- [ ] `git diff --name-only origin/main..HEAD` shows only relevant files
- [ ] No secrets, `.env` values, API keys, or credentials in the diff
- [ ] No unintended changes to files outside the task scope
- [ ] No changes to protected files without explicit mandate

### Documentation-Only PRs
For PRs that modify only markdown files (`docs/`, `.agents/`):
- [ ] Confirm no product code (`src/`, `scripts/`, config files) was modified
- [ ] Cross-references are valid (all linked files exist)
- [ ] The 4 validation checks still pass (regression safety)

---

## 3. PR Description Template

Every agent-created PR must include this structure:

```markdown
## Summary
[One-paragraph description of what this PR does and why]

## Changes
- [File 1]: [What changed]
- [File 2]: [What changed]

## Zone Classification
[Green / Yellow — identify which zone the changes fall into]

## Validation Results
- typecheck: ✅ / ❌
- lint: ✅ / ❌
- build: ✅ / ❌
- smoke:joris: ✅ / ❌

## Risks & Assumptions
[Any risks, assumptions, or items requiring reviewer attention]

## Rollback
[How to revert this change if needed]
```

---

## 4. Review Requirements

- Every PR requires **human review** from Michael before merge.
- Agents may review each other's work and leave comments, but agent approval does not satisfy the merge requirement.
- The QA / Security Agent should review PRs that touch:
  - API routes
  - Auth or session handling
  - RLS policies
  - New dependencies
  - Permission policies
  - Action ledger operations

---

## 5. Merge Restrictions

- **Only Michael may merge to `main`.** This is a Red zone action for agents.
- Agents must never use `git merge`, `git rebase` onto `main`, or any other method to modify the `main` branch directly.
- After Michael merges, agents should pull the latest `main` before starting new work.
- Squash merging is preferred to keep `main` history clean.

---

## 6. Commit Hygiene

- **Atomic commits** — Each commit should represent one logical change.
- **Relevant files only** — Inspect `git status` and `git diff` before every commit.
- **Descriptive messages** — Use the imperative mood, be specific about what changed.
  - Good: `Add security boundaries rule for autonomy zones`
  - Bad: `Update files` or `WIP`
- **No secrets in commit messages** — Never reference credential values.
- **No generated files** — Do not commit `node_modules/`, `.next/`, `tsconfig.tsbuildinfo`, or other build artifacts.

---

## 7. Commit and PR Creation — Yellow Zone

Both `git commit` and PR creation are **Yellow zone** actions per [orya-security-boundaries.md](orya-security-boundaries.md).

Agents must:
1. Complete all pre-PR checklist items.
2. Present the planned commit/PR to Michael for approval.
3. Wait for explicit approval before executing `git commit` or creating the PR.
4. Report the commit SHA and branch status after execution.

---

## 8. Protected Files

The following files require explicit mandate to modify:

| File | Reason |
|------|--------|
| `SOUL.md` (identity sections) | Core agent identity |
| `AGENTS.md` | Canonical operating guide |
| `.env` / `.env.local` | Secret values |
| `package.json` (dependencies) | Supply chain risk |
| `next.config.ts` | Build configuration |
| `db/` (migration files) | Database schema |
| `src/core/` (contracts/types) | Core domain contracts |

Modifications to these files are Yellow zone at minimum and may require additional review from the QA / Security Agent.
