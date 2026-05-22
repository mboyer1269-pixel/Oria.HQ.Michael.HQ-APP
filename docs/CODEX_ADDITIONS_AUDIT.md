# Codex Additions Audit

Status: **AUDIT** — inventory and classification only. Nothing landed yet.  
Date: 2026-05-22  
Source: `backup/codex-large-untracked-5d260c9` (96 files, +5 684 lines)  
Context: Codex work accumulated untracked in working tree during PRs #37–#39. Committed to backup branch to avoid loss. This document classifies each lot, surfaces risks, and recommends landing order.

---

## Summary

| Lot | Files | Description | Risk | Recommendation |
|-----|-------|-------------|------|----------------|
| A | 76 | Agent skill reference docs (`.agents/`, `.claude/skills/`, `skills-lock.json`) | 🟢 None | Land as-is — one PR |
| B | 2 | Dev tooling config (`vitest.config.ts`, `.mcp.json`) | 🟢 Low | Land as-is — one PR |
| C | 5 | Agent charter / policy / fleet (`agentPolicy`, `charters`, `fleet`, `agent-charter-panel`, `agent-registry-panel`) | 🟡 Broken — type errors | Needs types PR first |
| D | 2 | AI provider layer (`anthropic-client.ts`, `providers.ts`) | 🟡 Medium — reads API keys from env | Clean, well-gated — review env vars |
| E | 1 | Joris enhanced system prompt (`joris-prompt.ts`) | 🟢 Low | Additive — replaces static prompt |
| F | 2 | Tests (`intent-parser.test.ts`, `brain.test.ts`) | 🟡 Broken — references missing exports | Land after source files are fixed |
| G | 2 | Market scanner + briefing service (`scanner.ts`, `briefing-service.ts`) | 🔴 High — external network + Anthropic API calls | Dedicated PR with audit |
| H | 2 | Cron API routes (`/api/cron/ceo-brief`, `/api/cron/market-scout`) | 🔴 High — live server execution + CRON_SECRET | Dedicated PR — after G, after env review |
| I | 2 | DB persistence + migration (`agent-run-repository.ts`, `002_agent_runs_and_briefs.sql`) | 🔴 High — schema change + RLS policy | Dedicated PR — CEO sign-off required |
| J | 1 | Vercel cron config (`vercel.json`) | 🔴 Blocked — references cron routes | Land last, after H |

Total: 95 files (1 duplicate: `skills-lock.json` at root)

---

## Lot A — Agent Skill Reference Docs

**Files (76):**
- `.agents/skills/supabase-postgres-best-practices/` — 35 reference markdown files
- `.agents/skills/supabase/` — 3 files
- `.claude/skills/supabase-postgres-best-practices/` — 35 files (mirror of `.agents/`)
- `.claude/skills/supabase/` — 3 files

**What it is:** Read-only Supabase best-practice documentation for the AI agent tooling layer. No code, no execution, no secrets. Installed by `skills-lock.json` via the Claude Code skills registry.

**Risk:** None. Pure markdown reference material.

**Recommendation:** Land in a single PR. No review gate beyond "does `typecheck` still pass."

---

## Lot B — Dev Tooling Config

**Files (2):**
- `vitest.config.ts` — Vitest test runner configuration
- `.mcp.json` — MCP server config pointing to Supabase at `cpwerynafcszwagroeek` (no API key, URL only)

**What it is:** Test infrastructure config and local MCP integration config.

**Risk:** Low. `.mcp.json` contains only a project ref URL — no secret. `vitest.config.ts` is standard.

**Recommendation:** Land with Lot A or separately. No blocker.

---

## Lot C — Agent Charter / Policy / Fleet System

**Files (5):**
- `src/features/agents/agentPolicy.ts` — `getRule()`, `canAutoRun()`, `requiresApproval()`, `isForbidden()`
- `src/features/agents/charters.ts` — `agentCharters[]` with per-agent action rules (Joris: 8 rules; Scout/Builder/Hermes)
- `src/features/agents/fleet.ts` — `summarizeFleet()`, `needsHumanGate()`
- `src/features/agents/components/agent-charter-panel.tsx` — UI panel rendering charter rules
- `src/features/agents/components/agent-registry-panel.tsx` — Enhanced agent registry UI

**What it is:** A charter enforcement layer — defines per-agent, per-action approval modes (`auto`, `supervised`, `approval_required`, `forbidden`). Conceptually aligned with the runtime contract. Joris's charter includes 8 rules covering draft, read, write, send, and spend actions.

**Broken:** All 5 files import types from `@/features/hq/types` that do not exist:
- `CharterRule`, `CharterRuleMode`, `AgentOperatingCharter`, `AgentActionRisk`
- `HermesAgent`, `HermesFleetSummary`, `AgentApprovalMode`, `AgentVenture`

**Risk:** Broken typecheck. Nothing executes. Needs a types PR.

**Recommendation:**
1. **PR C-types** — Add the missing types to `src/features/agents/types.ts` (not `@/features/hq/types` — keep agent types co-located).
2. **PR C-impl** — Land the 5 files after types pass.

**Note:** The charter concept is valuable — it's the agent-level enforcement complement to the runtime contract. Worth landing, but not before types are clean.

---

## Lot D — AI Provider Layer

**Files (2):**
- `src/server/ai/anthropic-client.ts` — `getAnthropicClient()` (reads `ANTHROPIC_API_KEY`), `getAnthropicModelId()` (reads `ANTHROPIC_MODEL_ID` env var, defaults to `claude-sonnet-4-6`)
- `src/server/ai/providers.ts` — `getModelForRole(role)` routing: `strategy` → Claude Sonnet, `execution` → GPT-4o (if available), `economy`/`intent` → GPT-4o-mini. Fallback to Claude if no OpenAI key.

**What it is:** A dual-model router for the Hermès brain architecture. Clean implementation — reads API keys from env, never hardcodes them. `server-only` marker on both files.

**Risk:** Medium (reads API keys), but well-implemented. The `anthropic-client.ts` explicitly throws if `ANTHROPIC_API_KEY` is missing — good fail-fast behavior. The `providers.ts` file uses `@ai-sdk/anthropic` with an explicit `baseURL` to avoid non-standard default behavior.

**Note:** `providers.ts` uses the Vercel AI SDK (`ai` package + `@ai-sdk/anthropic`) rather than the Anthropic SDK directly. This is a different dependency from what's currently in the repo.

**Recommendation:** Land in a dedicated PR after confirming `ai` and `@ai-sdk/anthropic` are in `package.json`. Check that `ANTHROPIC_MODEL_ID` env var is documented.

---

## Lot E — Joris Enhanced System Prompt

**Files (1):**
- `src/server/joris/joris-prompt.ts` — `buildJorisSystemPrompt()` — Full Joris identity, ventures (Suivia / MCL Constructions / Hermès HQ), Board virtuel (8 figures), Autonomy Level 1–3 grid, output format rules.

**What it is:** Replaces any static/inline system prompt currently in `brain.ts` with a dedicated module. Encodes Joris's identity, the three ventures, the board of 8 (Hormozi, Brunson, Kennedy, Cardone, Belfort, Godin, Vaynerchuk, Robbins), and autonomy constraints.

**Risk:** Low. No external calls, no DB, pure string. Needs review to confirm it replaces (not duplicates) the existing prompt logic in `src/server/joris/brain.ts`.

**Recommendation:** Review `brain.ts` integration point, then land. High value — makes the prompt auditable.

---

## Lot F — Tests

**Files (2):**
- `src/server/calendar/intent-parser.test.ts` — Tests for calendar intent detection
- `src/server/joris/brain.test.ts` — Tests referencing `classifyIntentLLM` (not exported from `brain.ts`) and `brainRole` property (not on `ModelRouteDecision` type)

**What it is:** Unit/integration tests using Vitest (Lot B dependency).

**Broken:** `brain.test.ts` references exports and types that don't exist yet.

**Recommendation:** Land after the source files they test are fixed. Do not land broken tests.

---

## Lot G — Market Scanner + Briefing Service

**Files (2):**
- `src/server/market-scout/scanner.ts` — `runMarketScan()` — fetches 3 Google News RSS feeds (QC/ON aesthetic news), parses XML, deduplicates, returns `ScanResult`. Uses `server-only`. External network calls via `fetch` with 8s timeout.
- `src/server/briefing/briefing-service.ts` — `generateSignalBrief()` — calls Anthropic via Vercel AI SDK `generateObject()` with a structured Zod schema. Generates strategic market brief for aesthetic clinic operators (Suivia use case).

**What it is:** The core Suivia intelligence pipeline — market signal collection + AI brief generation. Real external network calls (RSS) + real AI API calls (Anthropic). Business logic is Suivia-specific (QC/ON aesthetic clinics).

**Risk:** High.
- **Network:** `scanner.ts` fetches external URLs. If those URLs are unreachable, the cron silently returns 0 signals.
- **AI cost:** Each cron invocation calls Claude Sonnet for `generateObject`. No cost guard in the code.
- **No rate limit:** The briefing route has no per-workspace rate limiting beyond cron schedule.
- **Missing dependency check:** Requires `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai` in `package.json`.

**Recommendation:** Dedicated PR with:
1. Confirm `ai` SDK dependencies are installed
2. Add cost cap / max-tokens guard to `generateSignalBrief`
3. Test the scanner in dry-run mode before wiring to cron
4. CEO explicit approval (new AI spend)

---

## Lot H — Cron API Routes

**Files (2):**
- `src/app/api/cron/ceo-brief/route.ts` — `GET /api/cron/ceo-brief` — CRON_SECRET gated. Calls `buildCeoBriefSnapshot()` (import from `@/server/brief/ceo-brief-service` — **this file does not exist yet**) + `listRecentBriefs()`.
- `src/app/api/cron/market-scout/route.ts` — `GET /api/cron/market-scout` — CRON_SECRET gated. Full pipeline: scan → brief → saveAgentRun. `maxDuration: 60`.

**What it is:** Vercel cron endpoints. Protected by `CRON_SECRET` env var. The market-scout route is the only one that's self-contained — the ceo-brief route references a service file that doesn't exist yet (`@/server/brief/ceo-brief-service`).

**Risk:** High.
- **Broken import:** `ceo-brief/route.ts` imports `buildCeoBriefSnapshot` from a path that doesn't exist — build will fail if this is landed without the service.
- **CRON_SECRET must be set:** Without it in production, the `verifyCronSecret` function returns `false` and all requests are 401. In development it allows unauthenticated access (by design).
- **`maxDuration: 60`:** Uses Vercel Pro cron duration budget.

**Recommendation:** Dedicated PR. Fix the missing import first, or remove the ceo-brief route until the service is built. The market-scout route is closer to ready.

---

## Lot I — DB Persistence + Migration

**Files (2):**
- `src/server/agents/agent-run-repository.ts` — `saveAgentRun()`, `listRecentRuns()`, `listRecentBriefs()`. Uses optional Supabase admin client with in-memory local fallback. References types `AgentRunInsert`, `AgentRunRow`, `SignalBriefInsert`, `SignalBriefRow` from `@/server/db/types` — **these don't exist yet**.
- `db/migrations/002_agent_runs_and_briefs.sql` — Creates `agent_runs` and `signal_briefs` tables. Enables RLS. Service role bypasses RLS; auth users read own workspace only.

**What it is:** Persistence layer for the market scout pipeline. The repository is well-structured — graceful Supabase fallback to in-memory, `server-only` marked, no direct SQL (uses Supabase client).

**Broken:** Types `AgentRunInsert`, `AgentRunRow`, etc. don't exist. Typecheck fails.

**Risk:** High.
- **Migration is destructive if applied twice** — uses `CREATE TABLE IF NOT EXISTS`, so idempotent, but still a schema change.
- **RLS policy is workspace-hardcoded** to `'michael-hq'` — acceptable for MVP, must be parameterized before multi-tenant.
- **Requires CEO sign-off** per sprint rules: any DB migration = dedicated PR.

**Recommendation:**
1. PR I-types — add `AgentRunInsert`, `AgentRunRow`, `SignalBriefInsert`, `SignalBriefRow` to `src/server/db/types.ts`
2. PR I-migration — apply `002` to Supabase, with CEO sign-off
3. PR I-repo — land `agent-run-repository.ts` after types + migration

---

## Lot J — Vercel Cron Config

**Files (1):**
- `vercel.json` — Registers two cron jobs: `market-scout` (Mondays 12:00 UTC) and `ceo-brief` (weekdays 11:00 UTC).

**What it is:** Activates the cron schedule on Vercel. Once merged, Vercel will begin triggering these routes on schedule.

**Risk:** High if landed before the cron routes are working — Vercel will call dead or broken endpoints.

**Recommendation:** Land last, after Lot H is stable and `CRON_SECRET` is set in Vercel env.

---

## Recommended Landing Order

```
PR A  — Docs + tooling config    (.agents/, .claude/skills/, skills-lock, vitest, .mcp.json)
PR B  — Agent types fix          (add missing types to src/features/agents/types.ts and src/server/db/types.ts)
PR C  — Agent charter system     (agentPolicy, charters, fleet, charter-panel, registry-panel)
PR D  — Joris system prompt      (joris-prompt.ts)
PR E  — AI provider layer        (anthropic-client.ts, providers.ts) + package.json dep check
PR F  — Market scanner           (scanner.ts — dry-run only, no briefing wired)
PR G  — Briefing service         (briefing-service.ts — after scanner verified)
PR H  — DB migration             (002_agent_runs_and_briefs.sql — CEO sign-off)
PR I  — DB repository            (agent-run-repository.ts — after migration applied)
PR J  — Cron routes              (ceo-brief route.ts — fix missing service; market-scout route.ts)
PR K  — Tests                    (brain.test.ts, intent-parser.test.ts — after source fixed)
PR L  — Vercel config            (vercel.json — last, after all cron routes stable)
```

Nothing from Lots G–L should be merged without explicit CEO mandate per action.

---

## What This Audit Does NOT Do

- Does not merge anything
- Does not apply any migration
- Does not change any agent or skill seed
- Does not activate any cron route
- Does not modify `.env` or any credential

---

## Reference

- `backup/codex-large-untracked-5d260c9` — the preserved backup branch (96 files)
- `docs/ORIA_RUNTIME_CONTRACT.md` — the contract framework these additions must respect
- `docs/ORIA_VPS_RUNTIME_READINESS.md` — 7-phase plan (live execution stays locked through Phase 5)
