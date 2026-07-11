---
name: Create Skill
description: >
  Creates a project SKILL.md under .agents/skills/ from a workflow using the
  multi-agent orchestration pipeline (researcher → designer → writer → reviewer).
---

# Create Skill

## Purpose

Generate a reusable project `SKILL.md` from a stated workflow, following Orya
skill conventions and the multi-agent orchestration pipeline.

## When to Use

- You have a clear workflow and want it captured as a discoverable skill.
- You are converting tribal process into a version-controlled skill file.

## When NOT to Use

- Product feature implementation (use the delivery loop / builder skills).
- Broad refactors of the agent fleet without an explicit mandate.

## Quick Start

1. Provide the objective and one example of the expected result.
2. Follow [multi-agent-orchestration](../multi-agent-orchestration/SKILL.md):
   researcher → designer → writer → reviewer.
3. Save the file at `.agents/skills/<name>/SKILL.md` (canonical).
4. Optionally mirror under `.claude/skills/<name>/SKILL.md` when dual-home is desired.
5. Pass the orchestration Checklist before publishing.

## Examples

**Prompt:**
> Create a `SKILL.md` that describes the local validation procedure for this project
> (`typecheck`, `lint`, `build`, `smoke:joris`) and when to run it before a PR.

**Expected result:**
`.agents/skills/<name>/SKILL.md` with Purpose, When to Use, Quick Start, Examples, and Checklist.

## Checklist

- [ ] Frontmatter `name` and `description` present
- [ ] Quick Start, Examples, and Checklist sections included
- [ ] Canonical path under `.agents/skills/`
- [ ] No secrets or credential material
- [ ] Cross-link to multi-agent-orchestration when the pipeline is used
