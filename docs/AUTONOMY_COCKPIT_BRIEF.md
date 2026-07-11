# Autonomy Cockpit Brief — Viktor · Hermes · Studio

> Status: research + foundation direction (2026-07-11).  
> Product spelling: **Oria**.  
> No secrets, no Phase 1 rewrite, no fake “fully autonomous” claims.

## 1. Mandate (Michael)

Build toward:
1. Agents usable with **personal subscriptions** (ChatGPT / Claude / Cursor) — not only metered API keys
2. **Easy Hermes Agent integration**
3. **Viktor-style** operational coworker (marketplace tools, review-first)
4. **Autonomous operational cockpit** + **Studio marketing agent** able to integrate a **Marketplace**

Constraint: bold, authentic, no hallucination, audit before ship.

## 2. Research — what “VICTOR” is

Verified product: **[Viktor](https://viktor.com/product)** (spelled Viktor) — Accel-backed “AI employee” that lives in Slack / Microsoft Teams.

Steal-able **patterns** (not a clone):

| Viktor pattern | Meaning | Oria analogue today |
|----------------|---------|---------------------|
| Chat where work happens | Coworker in Slack/Teams | Joris dock + Command Center in HQ |
| OAuth marketplace (3200+ tools) | One-click tool connect | Zapier MCP / n8n corridor = **planned**; no OAuth catalog live |
| Review-first for spend | Human approves money actions | Relay + Send Desk + Sentinelle (`requiresManualSend`) |
| Heartbeat / recurring ops | Proactive prep loops | Hermes prep worker = **architecture doc only** (`HERMES_ITERATIVE_PREP_AGENT.md`) |
| Real outputs (reports, campaigns) | Execute in sandbox | Studio prepares content; **no auto-publish** |

**NO-GO:** copying Viktor’s hosted credential vault into Oria cloud without a separate security mandate.

## 3. Two different “Hermes” — do not conflate

| Name | What it is | Oria status |
|------|------------|-------------|
| **Oria Relay** (technical id `hermes`) | Internal prep operator — outreach/cash packets → CEO Send Desk | Live governance surfaces; prep worker not fully shipped |
| **NousResearch Hermes Agent** | External open-source autonomous agent + [skill marketplace](https://hermes-agent.ai/features/skill-marketplace) + workspaces like [agent-cockpit](https://github.com/aerodeck-ai/agent-cockpit) | **Not vendored**. Integration = adapter corridor later |

Easy Hermes Agent integration for Oria means:
1. Document adapter boundary (this brief + contract)
2. Optional local probe / MCP bridge (Yellow)
3. Never replace Relay’s “prepare, never auto-send” invariant

## 4. Subscriptions (ChatGPT / Claude / Cursor)

Already decided in `docs/LOCAL_SUBSCRIPTION_RUNTIME_GATE.md` + probe v1:

| Path | Verdict |
|------|---------|
| Claude Code CLI / Codex CLI **detection** | GO (live probe → Command Tower) |
| CLI **dispatch into Joris** | Yellow — needs explicit CEO mandate |
| Cookie / scrape / OAuth interception | Permanent NO-GO |
| Cursor MCP as HQ brain | Editor-only; not product runtime |
| API keys Anthropic/OpenAI | Live path for Joris chat today |

## 5. Studio (marketing) + Marketplace

- Agent id `marketing`, display **Studio** (`docs/AGENT_NAMING.md`)
- Skills: content/campaign prep — still **prepare, never emit**
- Marketplace integration target: **tool corridor** (Zapier MCP / Hermes skills hub / n8n), same Sentinelle → Ledger pattern as outbound

Autonomous marketing **does not** mean auto-posting ads. It means:
1. Studio continuously prepares campaign packets
2. Marketplace connectors pull read-only metrics (Yellow OAuth later)
3. CEO approves publish/spend in Send Desk / review panels

## 6. Staged delivery (honest)

| Stage | Zone | Deliverable |
|-------|------|-------------|
| **A — this PR** | Green | Brief + capability registry entries + Autonomy Readiness panel + marketplace **contract** (types only) |
| **B** | Yellow | CLI subscription **dispatch** behind Sentinelle + Ledger (local only) |
| **C** | Yellow | First marketplace connector (Zapier MCP dry-run or Hermes skills browse read-only) |
| **D** | Mandate | Relay prep worker loop (`HERMES_ITERATIVE_PREP_AGENT.md` §9) |
| **E** | Mandate | Studio campaign heartbeat + review-first publish |

## 7. Orchestrate note

`/orchestrate` cloud fan-out requires `CURSOR_API_KEY` (user key). It was **unset** in this environment — work continues as a single audited PR instead of parallel cloud workers.

## 8. Audit checklist (before submit)

- [x] Viktor researched from primary product pages
- [x] Hermes Agent ≠ Oria Relay distinguished
- [x] No claim of live marketplace OAuth
- [x] No claim of subscription CLI dispatch
- [x] Autonomy panel shows capability registry truth only
- [x] Validation: typecheck, lint, build, smoke:joris
