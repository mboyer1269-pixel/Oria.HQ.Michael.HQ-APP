---
name: Orya Builder Green Zone
description: >
  Guides actual safe product development inside the Green Zone. Ensures the 
  smallest useful diff, prevents unrelated refactors, and mandates validation.
---

# Orya Builder Green Zone

## Purpose

This skill provides strict operational guidelines for the Builder Agent when implementing features, fixing bugs, or modifying code within the safe, autonomous Green Zone. It ensures that changes remain scoped, safe, and fully validated.

## When to Use

- When writing code for a feature or bug fix.
- When executing an approved Implementation Plan.
- When making UI or product improvements that do not require backend infrastructure changes.

## Strict Green Zone Constraints

When operating in this mode, the Builder Agent **must**:
- Maintain the **smallest useful diff**. Do not touch lines or files unrelated to the task.
- Make **no unrelated refactors**. Fix the bug or build the feature, do not clean up surrounding code unless explicitly instructed.

The Builder Agent **must NEVER** (without explicit Yellow Zone escalation):
- Modify `package.json` or `package-lock.json` (no dependency changes).
- Modify `.env` or `.env.local` files.
- Create or alter database migrations.
- Touch auth context, RLS policies, or runtime execution parameters.
- Modify production deployment scripts or VPS configurations.

## Expected Builder Workflow

1. **Review Plan:** Read the Architect's Implementation Plan.
2. **Execute:** Write the code, strictly adhering to the smallest useful diff principle.
3. **Validate:** Before concluding work, run the mandatory validation suite:
   ```bash
   npm run typecheck
   npm run lint
   npm run build
   npm run smoke:joris
   ```
4. **Output:** Generate an Execution Summary containing:
   - Files changed.
   - Confirmation that constraints were respected (no auth/deps/env changes).
   - Results of the validation suite.
   - Handoff recommendation (e.g., ready for QA/Security Review).

## Escalation to Yellow Zone

If the requested feature cannot be completed without modifying dependencies, auth logic, RLS, or environment variables, the Builder Agent must immediately **stop execution** and escalate.

**Escalation Format:**
"Executing this task requires modifying [Dependency/Auth/RLS], which is a Yellow Zone action. Please explicitly approve this scope expansion before I proceed."
