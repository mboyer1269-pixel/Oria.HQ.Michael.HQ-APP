---
name: Orya Security Review
description: >
  Security audit skill for the QA / Security Agent. Performs zone classification,
  secrets scanning, auth/RLS review, dependency vetting, and escalation for
  changes that touch sensitive boundaries in the Orya HQ codebase.
---

# Orya Security Review

## Purpose

This skill provides a structured security audit workflow for reviewing code changes, PRs, and architectural proposals. It ensures that all changes respect the autonomy zones defined in [orya-security-boundaries.md](../../rules/orya-security-boundaries.md) and that no sensitive boundaries are crossed without proper authorization.

## When to Use

- When reviewing PRs that touch API routes, auth, RLS, or permissions.
- When new dependencies are proposed.
- When changes involve server actions or runtime configuration.
- When verifying that a set of changes stays within Green zone.
- When auditing existing code for security concerns.
- When a Yellow zone action is proposed and needs risk assessment.
- Periodically, as a proactive security sweep.

## When NOT to Use

- For documentation-only changes that do not affect security boundaries.
- For cosmetic UI changes with no auth/data implications.
- For research or planning activities (use planning skills instead).

## Agent Mapping

| Agent | Role |
|-------|------|
| QA / Security Agent | Primary — performs the review |
| Architect Agent | Requestor — requests reviews for architectural changes |
| Builder Agent | Requestor — requests reviews for implementation changes |

## Review Workflow

### Step 1: Zone Classification

For each changed file, classify the change:

1. List all modified files with `git diff --name-only`.
2. For each file, determine the zone impact:

| File Pattern | Default Zone | Escalation Trigger |
|-------------|-------------|-------------------|
| `docs/**`, `.agents/**` | Green | None |
| `src/components/**`, `src/app/**/page.tsx` | Green | Unless touches auth context |
| `src/features/**` | Yellow | Server actions, data mutations |
| `src/server/**`, `src/app/api/**` | Yellow | API routes, middleware |
| `src/core/**` | Yellow | Core contracts, type changes |
| `db/**` | Yellow → Red | Migrations |
| `.env*` | Red | Secret values |
| `package.json` (deps) | Yellow | New dependencies |
| `next.config.ts` | Yellow | Build/runtime config |

3. If any file triggers Red zone → **stop and report immediately**.

### Step 2: Secrets Scan

Check the diff for exposed secrets:

1. Scan for patterns that indicate secret leakage:
   - API keys (patterns: `sk-`, `pk_`, `key_`, long alphanumeric strings)
   - Tokens (JWT patterns, bearer tokens)
   - URLs with embedded credentials
   - `.env` value references (actual values, not variable names)
   - Passwords or connection strings
2. Check that `.env.example` only contains placeholder values.
3. Verify `.gitignore` includes `.env`, `.env.local`, `.env.production`.

### Step 3: Auth and RLS Review

If changes touch authentication or authorization:

1. **Session handling** — Verify `getSession()` / `getUser()` calls follow Supabase best practices.
2. **RLS policies** — Check that row-level security is not bypassed (no `service_role` key usage without explicit mandate).
3. **API route protection** — Verify all API routes check authentication where required.
4. **Permission policy** — Confirm changes respect the existing `permissionPolicy` contracts.
5. **Token handling** — Verify JWT tokens are not logged, stored insecurely, or transmitted to unauthorized parties.

### Step 4: Dependency Vetting

If new dependencies are proposed:

1. **Package name** — Verify it matches the intended package (typosquatting check).
2. **Maintainership** — Check if actively maintained (last publish date, open issues).
3. **Bundle impact** — Estimate the size impact.
4. **License** — Confirm compatibility with project licensing.
5. **Security advisories** — Check for known vulnerabilities.
6. **Necessity** — Confirm the dependency is genuinely needed vs. implementing the feature directly.

### Step 5: Findings Report

Generate a structured findings report:

```markdown
## Security Review — [PR/Change Description]

### Zone Classification
| File | Zone | Concern |
|------|------|---------|
| ... | Green/Yellow/Red | ... |

### Overall Zone: Green / Yellow / BLOCKED (Red)

### Findings

| # | Severity | Category | Finding | Recommendation |
|---|----------|----------|---------|----------------|
| 1 | Critical/High/Medium/Low/Info | Secrets/Auth/RLS/Deps/Config | ... | ... |

### Secrets Scan
- Result: CLEAN / ALERT
- Details: ...

### Auth/RLS Impact
- Impact: None / Low / Medium / High
- Details: ...

### Dependency Impact
- New deps: None / [list]
- Risk: None / Low / Medium / High

### Verdict
- [ ] APPROVED — Safe to proceed
- [ ] APPROVED WITH CONDITIONS — [conditions]
- [ ] BLOCKED — [reason, required remediation]
```

## Severity Definitions

| Level | Definition | Action |
|-------|-----------|--------|
| **Critical** | Secret exposure, RLS bypass, auth vulnerability | Block PR. Immediate remediation required. |
| **High** | Unprotected API route, excessive permissions, unsafe dependency | Block PR. Fix before merge. |
| **Medium** | Missing input validation, suboptimal auth pattern, large unnecessary dependency | Flag for reviewer. Should fix before merge. |
| **Low** | Minor code hygiene, logging concerns, non-ideal patterns | Note for improvement. Non-blocking. |
| **Info** | Observation, suggestion, best practice note | For awareness only. |

## Proactive Security Sweep

When performing a periodic security sweep (not tied to a specific PR):

1. Scan all API routes in `src/app/api/` for auth protection.
2. Review all server actions in `src/features/` for authorization checks.
3. Verify RLS policies are applied to all Supabase table access.
4. Check for hardcoded values that should be environment variables.
5. Verify `.gitignore` coverage for sensitive files.
6. Report findings using the same format as Step 5.

## Checklist

- [ ] All changed files zone-classified
- [ ] No Red zone actions without explicit authorization
- [ ] Secrets scan completed — no credentials in diff
- [ ] Auth/RLS impact assessed (if applicable)
- [ ] Dependencies vetted (if applicable)
- [ ] Findings report generated
- [ ] Verdict issued (APPROVED / APPROVED WITH CONDITIONS / BLOCKED)
