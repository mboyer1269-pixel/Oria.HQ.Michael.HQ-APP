# Branch Inventory

> Snapshot to make the branch space legible. **Nothing here has been deleted.**
> Regenerate the classification with the recipe at the bottom.
>
> Why `git branch --no-merged` overcounts: this repo merges PRs by **squash**.
> A squash-merged branch keeps its old commit SHAs, so Git still reports it as
> "not merged" even though every line of its work is already in `main`. The
> classification below uses `git cherry` (patch-id comparison), which sees
> through squash merges and tells the truth.

## Class A — already in `main` (squash-landed): redundant, safe to retire

These 36 branches contain **no work that is not already in `main`**. Their
commit SHAs differ (squash), but their content has landed. They are pure
clutter. Retiring them loses nothing.

```
audit/action-ledger-rls
backup/hq-command-center-primary-cta-dirty-20260527215332
builder/joris-governance-audit-csv-export
chore/clean-001-sanitize-paths
chore/clean-002-safe-mono-user-fallback
chore/clean-003-joris-real-llm-contract
chore/clean-005-harden-contact-admin-boundaries
chore/clean-006-freeze-json-documents
chore/clean-007-normalize-workspace-mode-permissions
chore/clean-010-naming-cleanup
ci/clean-008-github-validation
claude/codex-additions-audit
code/venture-candidate-suggestion-inbox
code/venture-ceo-scoring
code/venture-cockpit-decision-queue
code/venture-edit-archive-kill-actions
code/venture-promote-advance-actions
code/venture-save-through-repository
codex/agent-autonomy-cockpit
codex/agent-autonomy-policy-matrix
codex/agent-knowledge-pack-blueprints
codex/agent-quality-evaluation-scorecards
codex/hide-placeholder-surfaces
codex/hq-cockpit-agent-review-wiring
cursor/venture-persistence-foundation
docs/clean-009-align-current-state
docs/hq-roadmap-p11-clean
feat/governance-decision-continuity-note
feat/governance-decisions-supabase-schema
feat/hq-ui-uplift
feat/ventures-cash-action-packet-generator
feat/ventures-cash-action-review-screen
feat/ventures-merge-codex-panels
feat/ventures-persist-cash-signal-intake
test/clean-004-critical-path-coverage
```

## Class B — has unique unlanded commits: KEEP

These branches still hold work that is **not** in `main`. Review each, then
either open a PR or consciously retire it. Do **not** bulk-prune these.

```
backup/codex-large-untracked-5d260c9        (1 unique)
chore/joris-intent-hardening                (1 unique)
ci/joris-smoke-test                         (1 unique)
claude/runtime-status-ui                    (2 unique)
claude/security-ledger-pre-dispatch         (2 unique)
code/venture-agent-build-plans              (2 unique)
code/venture-save-suggestion-as-candidate   (2 unique)
codex/customer-discovery-target-list        (1 unique)
codex/revenue-offer-builder                 (1 unique)
codex/revenue-validation-sprint-planner     (1 unique)
cursor/venture-command-center-readonly      (1 unique)
docs/hq-sync-readme-roadmap                 (1 unique)
docs/live-apply-runbook-0024                (6 unique)   ← live-apply 0024 runbook
feat/n8n-execution-rail-mcp                 (3 unique)   ← current working branch
feat/ventures-vertical-cash-loop            (3 unique)
refine-antigravity-autonomy-policy          (1 unique)
wip/main-uncommitted-20260604               (2 unique)
```

## Safe retire recipe (opt-in — run only when you choose)

This **archives every Class-A branch as a tag first** (so it is permanently
recoverable via `git checkout archive/<name>`), then deletes only the local
branch ref. It never touches Class B and never force-deletes unmerged work.

```bash
# 1. Archive each Class-A branch as a recoverable tag
for b in <paste Class A list>; do
  git tag "archive/$b" "$b"
done

# 2. Only after archiving, remove the redundant local branch refs
for b in <paste Class A list>; do
  git branch -D "$b"   # safe: content is in main + archive/<name> tag
done

# Recover any time:
#   git checkout -b restored archive/<name>
```

Going forward, the rule that prevents this from recurring: **one agent branch →
PR within 48h or it is archived.** A branch that has not moved in two weeks and
whose work is already in `main` is clutter, not history.
