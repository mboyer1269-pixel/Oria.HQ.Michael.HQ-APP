---
name: Orya PR Planner
description: >
  Plans and prepares pull requests for Orya HQ. Handles scope analysis,
  diff review, PR description generation, and pre-flight validation.
  Used by the Architect and Builder agents before committing changes.
---

> **Rules:** R-BRANCH-HYGIENE, R-COMMIT-HYGIENE, R-PR-TEMPLATE, R-PR-REVIEW, R-NO-MERGE, R-PROTECTED-FILES, R-VALIDATION-GATES, R-GREEN-NEEDS-RUN-LINK — full text in [core.md](../../rules/core.md) (single source; do not restate here).

# Orya PR Planner

## Purpose

This skill guides agents through the complete PR preparation workflow — from scoping changes to generating a reviewable PR description with validation evidence. It ensures every PR meets the standards defined in [orya-pr-rules.md](../../rules/orya-pr-rules.md).

## When to Use

- Before committing multi-file changes.
- When preparing a branch for PR creation.
- When scoping a set of changes to determine if they should be one PR or multiple.
- When generating a PR description from completed work.
- During pre-flight validation before requesting commit/PR approval. <!-- R-PRESENT-THEN-WAIT -->

## When NOT to Use

- For single-line fixes or typo corrections (just follow [orya-pr-rules.md](../../rules/orya-pr-rules.md) directly).
- For research or planning that does not result in code/doc changes.
- For production deployment (Red zone — never). <!-- R-NO-DEPLOY -->

## Agent Mapping

| Agent | Role |
|-------|------|
| Architect Agent | Primary — architectural changes, multi-component PRs |
| Builder Agent | Primary — feature implementation, bug fixes |
| QA / Security Agent | Reviewer — security-sensitive PRs |
| Docs / Current State Agent | Secondary — documentation-only PRs |

## Workflow

### Step 1: Scope Analysis & PR Gatekeeper

The PR Gatekeeper logic ensures that only small, scoped, validated, and reversible PRs are proposed. <!-- R-SCOPE-DISCIPLINE -->

1. **Gatekeeper Enforcement:**
   - **Block broad refactors:** Reject PRs that include unrelated cleanups or wide-reaching formatting changes.
   - **Block unauthorized scope:** Reject PRs touching runtime execution, auth, RLS, secrets, `.env`, dependencies (`package.json`), or migrations unless explicitly approved by Michael. <!-- R-ZONE-YELLOW -->
   - **Enforce Reversibility:** Ensure the PR can be cleanly rolled back.
   - **Require Out-of-Scope Definitions:** Explicitly document what was intentionally left out of scope to prevent creep.
2. Identify all files that have been modified, created, or deleted. <!-- R-NO-STRAY-CHANGES -->
3. Classify each file into a component (core, features, docs, config, tests).
4. Determine zone classification per R-ZONE-GREEN / R-ZONE-YELLOW / R-ZONE-RED ([core.md](../../rules/core.md)):
   - Are all changes Green zone?
   - Do any changes fall in Yellow zone?
   - Are any Red zone actions involved? → **Stop immediately.**
5. Decide if changes should be one PR or split into multiple PRs:
   - **One PR** if changes are logically cohesive and affect one feature/component.
   - **Multiple PRs** if changes span unrelated components or mix doc-only with code changes.

### Step 2: Diff Review

1. Run `git diff --name-only` to list all changed files.
2. Run `git diff` to inspect the full diff.
3. Verify:
   - No secrets, credentials, or `.env` values in the diff. <!-- R-NO-SECRETS -->
   - No unintended file changes.
   - No changes to protected files without mandate (R-PROTECTED-FILES).
   - No `node_modules/`, `.next/`, or other generated artifacts.

### Step 3: Pre-Flight Validation

Run the mandatory checks per R-VALIDATION-GATES; a failing check stops the PR.

For documentation-only PRs, also confirm:
```bash
git diff --name-only | grep -v "^docs/" | grep -v "^\.agents/"
# Should return empty — no product code changed
```

### Step 4: Branch Preparation

1. Verify branch name follows convention from [orya-pr-rules.md §1](../../rules/orya-pr-rules.md).
2. Verify branch is based on current `origin/main`.
3. Run `git status --short` to confirm no untracked/unstaged files that should be included.

### Step 5: PR Description Generation

Generate a PR description using the template from [orya-pr-rules.md §3](../../rules/orya-pr-rules.md):

```markdown
## Summary
[One-paragraph description of what this PR does and why]

## Changes
- [File 1]: [What changed]
- [File 2]: [What changed]

## Zone Classification
[Green / Yellow — identify which zone the changes fall into]

## Out of Scope
[Explicitly state what was left out of scope to prevent creep]

## Validation Plan & Results
[How the implementation was validated locally]
- typecheck: ✅ / ❌
- lint: ✅ / ❌
- build: ✅ / ❌
- smoke:joris: ✅ / ❌

## Risks & Assumptions
[Any risks, assumptions, or items requiring reviewer attention]

## Rollback Plan
[How to cleanly revert this change if needed]
```

### Step 6: Approval Request

Present the following to Michael for approval: <!-- R-PRESENT-THEN-WAIT -->

1. PR description (from Step 5).
2. Full file list with diff summary.
3. Validation results.
4. Zone classification.
5. Explicit request: "May I commit and create this PR?"

**Do not commit or create the PR until Michael explicitly approves.** <!-- R-PRESENT-THEN-WAIT -->

## Output Format

```
PR PLAN
───────
Branch:       <branch-name>
Base:         origin/main
Zone:         Green / Yellow
Files:        <count> changed (<additions> additions, <deletions> deletions)

CHANGES
───────
- <file>: <summary>
- <file>: <summary>

VALIDATION
──────────
typecheck:    ✅ PASS
lint:         ✅ PASS
build:        ✅ PASS
smoke:joris:  ✅ PASS

RISKS
─────
- <risk or "None identified">

STATUS
──────
Ready for commit/PR approval: YES / NO (reason)
```

## Checklist

- [ ] Scope analysis complete — all changes classified
- [ ] Zone classification confirmed — no Red zone actions
- [ ] Diff reviewed — no secrets, no unintended changes <!-- R-NO-SECRETS -->
- [ ] All 4 validation checks pass
- [ ] Branch name follows convention
- [ ] Branch based on current `origin/main`
- [ ] PR description generated
- [ ] Approval requested from Michael <!-- R-PRESENT-THEN-WAIT -->
