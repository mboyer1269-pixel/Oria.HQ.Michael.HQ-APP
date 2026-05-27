---
name: Orya Doc Updater
description: >
  Documentation maintenance skill for the Docs / Current State Agent. Handles
  doc inventory scanning, staleness detection, cross-reference validation,
  update workflows, and documentation consistency across the Orya HQ repository.
---

# Orya Doc Updater

## Purpose

This skill keeps Orya HQ documentation accurate, consistent, and current. It detects stale content, validates cross-references, identifies gaps, and produces targeted documentation updates. The goal is to ensure that the repository's documentation always reflects the actual state of the codebase.

## When to Use

- After code changes are merged that affect documented behavior.
- After a PR merge to verify docs remain consistent.
- Periodically (e.g., end of sprint) as a documentation health check.
- When a new feature or component is added without corresponding docs.
- When cross-references between docs may have been invalidated.
- When onboarding context needs to be updated.

## When NOT to Use

- For product code changes (use Builder Agent skills).
- For security audits (use [orya-security-review](../orya-security-review/SKILL.md)).
- For creating entirely new strategic documents (that is a planning task, not a doc update).

## Agent Mapping

| Agent | Role |
|-------|------|
| Docs / Current State Agent | Primary — performs all documentation maintenance |
| Architect Agent | Collaborator — provides architectural context for doc updates |
| Builder Agent | Trigger — notifies Docs agent after code changes |

## Documentation Inventory

### Core Documents (Always Monitor)

| File | Owner | Update Trigger |
|------|-------|---------------|
| [AGENTS.md](../../AGENTS.md) | Canonical | Agent model changes, validation rule changes |
| [SOUL.md](../../SOUL.md) | Protected | Identity or values changes (rare, requires mandate) |
| [README.md](../../README.md) | General | Setup changes, major feature changes |
| [docs/ROADMAP.md](../../docs/ROADMAP.md) | Strategic | Phase completions, priority changes |
| [docs/PRODUCT_MAP.md](../../docs/PRODUCT_MAP.md) | Architectural | Module status changes, architecture changes |
| [docs/07_ANTIGRAVITY_OPERATING_MODEL.md](../../docs/07_ANTIGRAVITY_OPERATING_MODEL.md) | Operational | Agent model or zone changes |

### Agent Configuration (Monitor on Agent Changes)

| File | Update Trigger |
|------|---------------|
| `.agents/rules/orya-global-rules.md` | Agent operating rule changes |
| `.agents/rules/orya-security-boundaries.md` | Zone definition changes |
| `.agents/rules/orya-pr-rules.md` | PR process changes |
| `.agents/skills/*/SKILL.md` | Skill workflow changes |

### Strategic Documents (Monitor for Staleness)

| File | Staleness Indicator |
|------|-------------------|
| `docs/AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md` | Venture strategy changes |
| `docs/OPERATIONAL_SAFEGUARDS_V1.md` | Safeguard policy changes |
| `docs/STRATEGIC_ANALYSIS_CTO_2026Q2.md` | Market/tech shifts |
| `docs/MISSION_CONTROL_OPERATING_MANUAL.md` | Mission system changes |

## Update Workflow

### Step 1: Doc Inventory Scan

1. List all documentation files in the repository:
   - `docs/**/*.md`
   - `.agents/**/*.md`
   - Root-level `.md` files (AGENTS.md, SOUL.md, README.md, CLAUDE.md)
2. For each file, note:
   - Last modified date (from git log).
   - Size and line count.
   - Whether it is a placeholder (`# TODO`).

### Step 2: Staleness Detection

Compare documentation state against codebase state:

1. **Recent code changes** — Run `git log --oneline -20` to see recent commits. For each commit that changed `src/` or `scripts/`, check if corresponding docs exist and are up to date.
2. **Cross-reference check** — For each internal link in docs (e.g., `[ROADMAP](../ROADMAP.md)`), verify the target file exists and the referenced section exists.
3. **Status table check** — Find tables with status columns (✅, 🟡, 🔴, Live, Proposed, Planned) and verify statuses match current reality.
4. **Date references** — Flag any hardcoded dates that are in the past and may indicate outdated content.

### Step 3: Gap Analysis

Identify documentation gaps:

1. **Undocumented features** — Check `src/features/` for directories without corresponding documentation.
2. **Undocumented API routes** — Check `src/app/api/` for routes not documented in any doc file.
3. **Missing changelogs** — Check if significant recent changes lack documentation.
4. **Placeholder files** — List any files that are still `# TODO`.

### Step 4: Update Drafting

For each identified issue:

1. **Draft the update** — Write the corrected or new content.
2. **Preserve existing content** — Do not delete comments, context, or sections unrelated to the change.
3. **Maintain conventions** — Follow the formatting and structure of the existing document.
4. **Cross-reference** — Add or update links to related documents.
5. **Protected files** — For SOUL.md identity sections, flag the need for update but do not modify without explicit mandate.

### Step 5: Review and Commit

1. Present the proposed changes to Michael.
2. List each file and the sections modified.
3. Explain why each change is needed (staleness, gap, broken reference).
4. Request approval per [orya-pr-rules.md](../../rules/orya-pr-rules.md).

## Output Format

```markdown
## Documentation Update Report

### Scan Summary
- Files scanned: [count]
- Stale files found: [count]
- Broken cross-references: [count]
- Documentation gaps: [count]
- Placeholder files remaining: [count]

### Staleness Report
| File | Last Modified | Issue | Recommended Action |
|------|--------------|-------|-------------------|
| ... | ... | ... | Update / Rewrite / Flag for review |

### Cross-Reference Check
| Source File | Link | Target | Status |
|-----------|------|--------|--------|
| ... | ... | ... | ✅ Valid / ❌ Broken / ⚠️ Stale |

### Gaps
| Area | Missing Documentation | Priority |
|------|---------------------|----------|
| ... | ... | High / Medium / Low |

### Proposed Updates
| File | Section | Change Type | Summary |
|------|---------|-------------|---------|
| ... | ... | Update / Add / Remove | ... |

### Verdict
- [ ] ALL CURRENT — No updates needed
- [ ] UPDATES PROPOSED — [count] files need attention
- [ ] CRITICAL GAPS — [list of missing or severely outdated docs]
```

## Protected Files

The following files have restricted modification rules:

| File | Restriction |
|------|------------|
| `SOUL.md` | Identity and values sections are read-only unless Michael mandates a change. Operational sections may be updated with approval. |
| `AGENTS.md` | Canonical operating guide. Changes require careful review — must not conflict with established patterns. |
| `.env*` | Never read or modify secret values. `.env.example` may be updated for placeholder documentation. |

## Boundary Constraints

| Action | Zone | Rule |
|--------|------|------|
| Read all documentation files | Green | Always permitted |
| Analyze staleness and cross-references | Green | Read-only analysis |
| Draft documentation updates | Green | Drafting is permitted |
| Commit documentation updates | **Yellow** | Requires Michael's approval |
| Modify SOUL.md identity sections | **Yellow** | Requires explicit mandate |
| Modify product code to match docs | **Yellow** | This skill is docs-only; code changes go through Builder Agent |

## Checklist

- [ ] Doc inventory scan completed
- [ ] Staleness detection run against recent commits
- [ ] Cross-references validated
- [ ] Gaps identified
- [ ] Updates drafted (if needed)
- [ ] Protected file restrictions respected
- [ ] Report generated
- [ ] Approval requested for any commits
