---
name: Orya Multi-Agent Delivery Loop
description: >
  Coordinates the full 6-agent delivery pipeline for Orya HQ. Defines handoffs,
  artifacts, approval gates, and expected outputs. Prevents scope creep and
  ensures small, safe PRs.
---

# Orya Multi-Agent Delivery Loop

## Purpose

This skill orchestrates the end-to-end delivery pipeline across all specialized agents. It ensures that work flows predictably from discovery to deployment-ready PRs, preventing scope creep and ensuring that every handoff is accompanied by validated artifacts.

## When to Use

- When coordinating a multi-step feature implementation.
- When an opportunity from the Innovation Scout is approved for development.
- When guiding a feature from architecture through to PR creation.
- When a handoff between agents occurs.

## Pipeline Sequence

```text
Scout → Architect → Builder → QA/Security → UI Verification → Docs → Human Approval
```

## Gate 1: Discovery & Planning
**Actor:** Innovation Scout
**Action:** Researches opportunities. Recommends exactly ONE winning idea.
**Output Artifact:** `Opportunity Brief` (scored out of 30).
**Gate:** Human decides GO / WATCH / NO-GO.

## Gate 2: Architecture
**Actor:** Architect Agent (only if GO)
**Action:** Designs the implementation. Prevents broad refactors.
**Output Artifact:** `Implementation Plan`
**Gate:** Human approves the plan.

## Gate 3: Implementation
**Actor:** Builder Agent
**Action:** Writes the code in the Green Zone. Maintains smallest useful diff.
**Output Artifact:** Functional code, passing tests (`npm run build`, `npm run typecheck`).
**Gate:** Handoff to QA/Security.

## Gate 4: Security & Quality Review
**Actor:** QA / Security Agent
**Action:** Reviews the diff for secrets, auth changes, dependencies, and zone compliance.
**Output Artifact:** `Security Review Report`
**Decision:** APPROVED, APPROVED WITH CONDITIONS, or BLOCKED.

## Gate 5: UI Verification
**Actor:** UI Verification Agent
**Action:** Tests visual changes on localhost across breakpoints.
**Output Artifact:** `UI Verification Report` (Screenshots, pass/fail).

## Gate 6: Documentation
**Actor:** Docs / Current State Agent
**Action:** Updates relevant documentation to reflect changes.
**Output Artifact:** Markdown updates.

## Gate 7: PR Preparation & Final Approval
**Actor:** PR Planner (Architect or Builder)
**Action:** Prepares the PR description, rollback plan, and out-of-scope definitions.
**Output Artifact:** PR Description, Validation Results.
**Gate:** Human (Michael) approves commit and PR creation.

## Scope Creep Prevention

To maintain velocity and safety, agents must:
- Reject any instruction to implement "while you're at it" features.
- Output a clear `Out of Scope` section in every Implementation Plan and PR Description.
- Block the pipeline if a Green Zone task suddenly requires Yellow/Red Zone permissions (e.g., modifying `.env`, auth, or adding dependencies).
