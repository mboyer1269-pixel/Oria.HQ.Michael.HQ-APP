---
name: Orya UI Verification
description: >
  UI testing and verification skill for the UI Verification Agent. Covers
  localhost visual inspection, responsive testing, accessibility checks,
  screenshot capture, and visual regression reporting. Green zone only.
---

# Orya UI Verification

## Purpose

This skill provides a structured workflow for verifying UI changes in the Orya HQ application. All verification happens on `localhost:3000` — no production access, no external deployments. The goal is to catch visual regressions, layout issues, responsive breakpoints, and accessibility problems before a PR is created.

## When to Use

- After UI component changes (new components, modified layouts, style updates).
- After page-level changes (new pages, route changes, navigation updates).
- Before creating a PR that includes UI changes.
- When investigating reported UI bugs or regressions.
- During periodic UI sweeps to verify consistency.

## When NOT to Use

- For backend-only changes with no UI impact.
- For production UI verification (Red zone — no production access).
- For auth flow testing that requires real credentials (Yellow zone).

## Agent Mapping

| Agent | Role |
|-------|------|
| UI Verification Agent | Primary — performs all UI verification |
| Builder Agent | Requestor — requests verification after implementing UI changes |
| QA / Security Agent | Collaborator — reviews UI changes with auth/security implications |

## Prerequisites

Before starting UI verification:

1. Dev server is running: `npm run dev` at `http://localhost:3000`.
2. All code changes are saved and the dev server has hot-reloaded.
3. The app is in local persistence mode (`NODE_ENV !== "production"`).

## Verification Workflow

### Step 1: Change Inventory

1. List all UI-related files that were modified:
   - `src/components/**`
   - `src/app/**/page.tsx`
   - `src/app/**/layout.tsx`
   - CSS/style files
   - Public assets (`public/`)
2. For each changed file, identify the affected pages/routes.
3. Create a verification matrix:

```markdown
| Page/Route | Changed Component | What to Check |
|-----------|------------------|---------------|
| /         | Header           | Layout, nav links, responsive |
| /hq       | Dashboard        | Card layout, data display |
```

### Step 2: Visual Inspection

For each affected page/route:

1. **Navigate** to the page on `localhost:3000`.
2. **Inspect** the changed components visually:
   - Does it look correct at desktop width (1440px)?
   - Does it look correct at tablet width (768px)?
   - Does it look correct at mobile width (375px)?
3. **Check** interactive elements:
   - Hover states
   - Click/tap targets
   - Focus states (keyboard navigation)
   - Loading states
   - Error states (if applicable)
4. **Capture screenshots** at each breakpoint.

### Step 3: Responsive Testing

Test at standard breakpoints:

| Breakpoint | Width | Check |
|-----------|-------|-------|
| Mobile S | 375px | Layout stacks correctly, no horizontal overflow |
| Mobile L | 425px | Touch targets ≥ 44px, text readable |
| Tablet | 768px | Grid adapts, navigation accessible |
| Laptop | 1024px | Sidebar/main layout correct |
| Desktop | 1440px | No excessive whitespace, max-width respected |

### Step 4: Accessibility Check

For each changed component:

1. **Color contrast** — Text meets WCAG AA (4.5:1 for normal text, 3:1 for large text).
2. **Keyboard navigation** — All interactive elements reachable via Tab, activatable via Enter/Space.
3. **Screen reader** — Semantic HTML used (headings, landmarks, ARIA labels where needed).
4. **Focus indicators** — Visible focus ring on all interactive elements.
5. **Alt text** — All images have descriptive alt text.

### Step 5: Dark Mode Verification

If the app supports dark mode:

1. Toggle to dark mode.
2. Re-check all affected pages for:
   - Text readability on dark backgrounds.
   - No invisible elements (same color as background).
   - Icon and image visibility.
   - Proper border/shadow treatment.

### Step 6: Screenshot and Recording Capture

For the verification report:

1. **Screenshots** — Capture each affected page at desktop and mobile breakpoints.
2. **Before/after** — If possible, capture the previous state for comparison.
3. **Recordings** — For interactive flows (forms, modals, navigation), capture short screen recordings.
4. Save all captures in the artifact directory for PR attachment.

## Output Format

```markdown
## UI Verification Report

### Environment
- URL: http://localhost:3000
- Branch: <branch-name>
- Date: <date>

### Change Inventory
| Page/Route | Component | Status |
|-----------|-----------|--------|
| ... | ... | ✅ Pass / ❌ Fail / ⚠️ Warning |

### Responsive Check
| Breakpoint | Width | Status | Notes |
|-----------|-------|--------|-------|
| Mobile S | 375px | ✅/❌ | ... |
| Mobile L | 425px | ✅/❌ | ... |
| Tablet | 768px | ✅/❌ | ... |
| Laptop | 1024px | ✅/❌ | ... |
| Desktop | 1440px | ✅/❌ | ... |

### Accessibility
| Check | Status | Notes |
|-------|--------|-------|
| Color contrast | ✅/❌ | ... |
| Keyboard nav | ✅/❌ | ... |
| Semantic HTML | ✅/❌ | ... |
| Focus indicators | ✅/❌ | ... |

### Dark Mode
- Status: ✅ Pass / ❌ Fail / N/A
- Issues: ...

### Screenshots
[Embedded screenshots at key breakpoints]

### Verdict
- [ ] APPROVED — All UI checks pass
- [ ] ISSUES FOUND — [list of issues to fix]
- [ ] BLOCKED — [critical visual regression or accessibility failure]
```

## Boundary Constraints

| Action | Zone | Rule |
|--------|------|------|
| Browse localhost:3000 | Green | Always permitted |
| Capture screenshots | Green | Localhost only |
| Capture recordings | Green | Localhost only |
| Run dev server (`npm run dev`) | Green | Local development |
| Modify UI code to fix issues | Green (small) / Yellow (significant) | Scope-dependent |
| Access production URLs | **Red** | Never |
| Deploy UI changes | **Red** | Never |

## Checklist

- [ ] Dev server running at localhost:3000
- [ ] Change inventory created
- [ ] All affected pages visually inspected
- [ ] Responsive breakpoints tested (375px, 425px, 768px, 1024px, 1440px)
- [ ] Accessibility checks completed
- [ ] Dark mode verified (if applicable)
- [ ] Screenshots captured
- [ ] Verification report generated with verdict
