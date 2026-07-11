---
name: Multi-Agent Orchestration
description: >
  Template and operating guide for multi-agent workflows in Cursor (lead,
  researcher, designer, writer, reviewer). Use when converting a multi-step
  process into a reproducible SKILL.md, or when running an explicit handoff
  pipeline. Complements orya-multi-agent-delivery-loop for product delivery.
---

# Multi-Agent Orchestration

## Purpose

Provide a reusable role/handoff template for multi-agent work in this repository.
Use it to design and publish project skills, or to run a short research → design →
write → review loop with explicit artifacts at each step.

This skill is the **meta-pipeline** for skill authoring and ad-hoc multi-role work.
For Orya product delivery (Scout → Architect → Builder → QA → UI → Docs → PR), use
[orya-multi-agent-delivery-loop](../../../.agents/skills/orya-multi-agent-delivery-loop/SKILL.md) instead.

## When to Use

- Converting a multi-step workflow into an automatable `SKILL.md`.
- Creating or rewriting a skill that needs research, design, drafting, and review.
- Running an explicit handoff pipeline from Cursor Agent Mode with named roles.
- Aligning a new skill with Orya conventions before registering it in the operating model.

## When NOT to Use

- Implementing product features or Phase 1+ work (requires an explicit Michael mandate).
- Coordinating the Orya delivery fleet end-to-end — use `orya-multi-agent-delivery-loop`.
- Changing application code, auth, secrets, dependencies, or migrations under the guise of "orchestration."
- Starting Ruflo/MCP server implementation work unless Michael explicitly mandates it.

## Quick Start

1. **Lead** states objective, scope, success criteria, and one example of the expected result.
2. Run the pipeline: `researcher` → `designer` → `writer` → `reviewer`.
3. Save the skill at `.agents/skills/<name>/SKILL.md` (canonical). Optionally mirror under `.claude/skills/<name>/`.
4. Stage with `git add -f .agents/skills/<name>/SKILL.md` (`.agents/` is gitignored) and verify `git ls-files --error-unmatch` succeeds.
5. Confirm the skill passes the Checklist below before publishing.
6. For product delivery after a skill exists, hand off to the matching `orya-*` skill or the delivery loop.

## Agent Mapping

| Role | Responsibility | Required artifact |
|------|----------------|-------------------|
| `lead` / `orchestrator` | Objective, scope, success criteria, final publish | Kickoff brief; published skill or handoff |
| `researcher` | Repo conventions, paths, examples, gaps | Structured research summary |
| `designer` | Section outline, prompts per role, checklist | Skill outline |
| `writer` | Full `SKILL.md` draft from the outline | Draft `SKILL.md` |
| `reviewer` | Conformity, formatting, Cursor compatibility | Approve or correction list |

## Workflow

1. **Lead** — Provide objective, in-scope / out-of-scope, and one concrete example of the expected result.
2. **Researcher** — Return a structured summary: frontmatter conventions, canonical paths, example skills, gaps, and constraints from `AGENTS.md`.
3. **Designer** — Produce an outline with section list, role prompts, and a draft checklist.
4. **Writer** — Write the complete `SKILL.md` from the outline (English for Orya operational skills).
5. **Reviewer** — Validate against the Checklist; return corrections or approve.
6. **Lead** — Publish the final file(s), update indexes/links if needed, and record validation evidence.

## Output Format

### Lead kickoff (copy/paste)

```markdown
## Orchestration Kickoff
- **Objective:**
- **In scope:**
- **Out of scope:**
- **Success criteria:**
- **Example expected result:**
- **Canonical path:** `.agents/skills/<name>/SKILL.md`
```

### Researcher summary (minimum)

```markdown
## Research Summary
- Conventions (frontmatter, sections, language)
- Canonical paths and any doc/filesystem drift
- Example skills to emulate
- Gaps to fix
- Constraints (AGENTS.md / zones)
- Out of scope for this run
```

### Designer outline (minimum)

```markdown
## Skill Outline
- Frontmatter name + description
- Sections: Purpose, When to Use, When NOT to Use, Quick Start,
  Agent Mapping, Workflow (orchestration steps), Output Format,
  Boundary Constraints, Checklist, Examples
- Role prompts (one each)
- Open questions (if any)
```

## Boundary Constraints

- Do not modify secrets, `.env`, API keys, or credentials.
- Do not start Phase 1 or later product work without an explicit mandate.
- Prefer English for skills registered in the Orya operating model.
- Canonical skill home for operating-model entries: `.agents/skills/<name>/SKILL.md`.
- `.agents/` is listed in `.gitignore`; new canonical skills must be force-added (`git add -f`) and confirmed tracked before commit.
- Mirror under `.claude/skills/` only when following the existing dual-home pattern (e.g. Supabase).
- Do not implement or invent `bin/cli.js` / Ruflo runtime unless explicitly mandated.
- Keep diffs to skills/docs for orchestration-only tasks; no opportunistic `src/` edits.

## Cursor / MCP Integration

### Config present in this repo

- **Cursor Ruflo entry:** `.cursor/mcp.json` references `node ./bin/cli.js mcp start` with `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` env placeholders.
- **Supabase MCP:** root `.mcp.json` points at the HTTP Supabase MCP endpoint (separate from Ruflo).

### Current limitation

The Ruflo entrypoint `./bin/cli.js` is **not present** in this repository. Agents must not treat MCP orchestration as runnable until that entrypoint exists or the config is updated under an explicit mandate. Skill authoring and role handoffs still work without Ruflo — use Cursor Agent Mode and Task/subagents.

### When Ruflo becomes available

1. Confirm `.cursor/mcp.json` still matches the real CLI path.
2. Ensure required API keys are available in the Cursor environment (never commit them).
3. Start the MCP server and verify Cursor lists the `ruflo` server before running a workflow.

## Examples

### Example A — Create a deployment skill

**Lead:** Create a `SKILL.md` for the project's local validation and release-prep checklist (docs only).

**Researcher:** Summarize existing validation commands from `AGENTS.md` and patterns from `orya-pr-planner`.

**Designer:** Outline Purpose → When to Use → Workflow (typecheck/lint/build/smoke) → Checklist.

**Writer:** Draft `.agents/skills/release-prep/SKILL.md`.

**Reviewer:** Confirm frontmatter, Quick Start, Examples, Checklist, and no secrets.

### Example B — Rewrite this orchestration skill

**Lead:** Bring `multi-agent-orchestration` up to Orya skill standards and fix path drift vs `docs/07_ANTIGRAVITY_OPERATING_MODEL.md` §6.3.

**Pipeline:** researcher → designer → writer → reviewer → lead publish under `.agents/skills/multi-agent-orchestration/` with optional `.claude/skills/` mirror.

### Example C — Ad-hoc research handoff (no new skill)

**Lead:** Need a structured summary of calendar persistence fallbacks before planning.

**Researcher only:** Return Research Summary; stop. Do not invent a skill or change code.

## Relationship to Orya Delivery Loop

| Concern | Use this skill | Use `orya-multi-agent-delivery-loop` |
|---------|----------------|--------------------------------------|
| Authoring / rewriting skills | Yes | No |
| Named researcher→writer roles | Yes | Indirectly via specialized agents |
| Product feature from Scout to PR | No | Yes |
| Green-zone build + security gates | No | Yes (+ `orya-builder-green-zone`, `orya-security-review`, …) |

## Checklist

- [ ] Frontmatter `name` and `description` present
- [ ] Sections include Purpose, When to Use, When NOT to Use, Quick Start, Examples, Checklist
- [ ] Agent Mapping or equivalent role table present
- [ ] Boundary Constraints section present
- [ ] Output Format / handoff template present when the skill produces artifacts
- [ ] Canonical path is `.agents/skills/<name>/SKILL.md` if listed in the operating model
- [ ] New `.agents/skills/` files force-added (`git add -f`) and verified tracked (`git ls-files --error-unmatch`)
- [ ] Cursor/MCP notes accurate (including Ruflo/`bin/cli.js` status if referenced)
- [ ] No secrets, credentials, or `.env` values in the skill
- [ ] Language matches Orya operational skills (English) unless Michael requests otherwise
- [ ] Cross-links to related `orya-*` skills or `AGENTS.md` where useful
- [ ] Doc-only change: no unintended `src/` edits

## Related Skills

- [create-skill](../create-skill/SKILL.md) — Short helper to kick a new skill through this pipeline
- [orya-multi-agent-delivery-loop](../../../.agents/skills/orya-multi-agent-delivery-loop/SKILL.md) — Product delivery gates
- [orya-pr-planner](../../../.agents/skills/orya-pr-planner/SKILL.md) — PR scope, validation, description template
- [orya-doc-updater](../../../.agents/skills/orya-doc-updater/SKILL.md) — Documentation updates after delivery
