# Repo Scout Brief — Oria HQ

> Produced by `.cursor/agents/oria-repo-scout.md` on 2026-07-11.  
> Research only — no Phase 1, no new dependencies, no auth changes.
> Product spelling: **Oria** (not “Orya”).

## Question

Which open-source repos / patterns can make Oria HQ **simpler, more efficient, and more deployable** for agent connection (Hermes), owner chat, and operator web UI — without rewriting the foundation?

## Oria baseline (verified in-repo)

- Operator shell: `CockpitShell` + Command Palette (`src/features/cockpit/components/`).
- Owner chat: `CommandCenter` on `/hq` + `JorisDock` (multi-turn → `POST /api/joris/chat`). Dock mounting landed on branch `cursor/hq-chat-calendar-usability-7b7c` / PR #339.
- Calendar path: chat → mission draft → confirm → calendar + ledger (`smoke:joris`).
- Hermes: `ExecutionIntentReviewPanel` on `/hq/agents` via approve/reject APIs — **not** wired into the chat thread.
- Deploy posture: Next.js 16 monolith; local persistence when `NODE_ENV !== "production"`; owner session required for HQ APIs; validation = typecheck / lint / build / smoke:joris. No `render.yaml` / `Dockerfile` in tree today.

## Candidates

| Repo | Why relevant | Score /25 | Steal-able pattern | Risk |
|------|--------------|-----------|--------------------|------|
| [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | Real “Hermes” approval queue: block dangerous tool → `/approve` → **resume agent with tool result** | 22 | FIFO pending approvals; inject result back into the active turn | Do **not** vendor the Python runtime; steal UX/contract only |
| [antonio-mello-ai/crewdock](https://github.com/antonio-mello-ai/crewdock) | Self-hosted agent control plane: chat + tasks + approvals + activity + costs | 20 | One operational surface composition | Heavy FastAPI/Postgres stack — do not port wholesale |
| [PSR94/ORION](https://github.com/PSR94/ORION) | AgentOps HITL gates + Next.js control plane | 17 | Pause-on-sensitive-tool → human gate | Enterprise multi-service; overkill |
| [SattyamJJain/FerrumDeck](https://github.com/SattyamJJain/FerrumDeck) | Deny-by-default + approvals + audit | 16 | Approvals page as first-class nav | Rust/Python dual-plane — Yellow/Red if adopted |
| [racecraft-lab/Paddock](https://github.com/racecraft-lab/Paddock) | Next.js 16 factory console; mentions Hermes harness adapters | 18 | Health / costs / review gates IA | Different product model (GitHub issues factory) |
| [BankNatchapol/Loop-Control-Plane](https://github.com/BankNatchapol/Loop-Control-Plane) | Local-first Next.js operator board between plan and agents | 17 | Explicit “automation may act” gates | Kanban-centric; overlaps `/hq/missions` |
| [CopilotKit/CopilotKit](https://github.com/CopilotKit/CopilotKit) | Floating `CopilotPopup` / sidebar chat for Next.js | 14 | Popup dock UX (Oria already has JorisDock) | **Yellow**: new deps + runtime route |
| [assistant-ui/assistant-ui](https://github.com/assistant-ui/assistant-ui) | Composable chat + **inline human approvals** for tool calls | 15 | Inline approve UI in thread | **Yellow**: dependency; overlaps custom dock |

## Winner (ONE)

**Pattern:** Hermes-style **approval resume into chat** (from NousResearch/hermes-agent), applied to Oria’s existing surfaces — not a new framework.

**Why it beats the others:** Oria already has chat (Joris) and Hermes intent approve/reject. The biggest efficiency gap is **split attention**: CEO approves on `/hq/agents` or mission banner, but the chat thread does not resume with the outcome. CrewDock/ORION/FerrumDeck would tempt a rewrite. CopilotKit/assistant-ui add dependencies for UX Oria mostly has.

**Proposed green-zone PR (next mandate):**

1. After mission-draft confirm/cancel **or** Hermes intent approve/reject, dispatch a shared browser event (e.g. `michael-hq:approval-resolved`).
2. `JorisDock` listens and appends a short system/joris turn: “Approuvé — RDV booké …” / “Intent Hermes rejeté …”.
3. Optional: badge on dock when `GET /api/agents/hermes/execution-intents` has pending rows (read-only poll; existing API).
4. No new packages, no auth changes, no Phase 1.

**Out of scope:** Vendoring Hermes Agent runtime, CopilotKit, Docker control planes, local auth bypass (Yellow).

**Validation:** `npm run typecheck && npm run lint && npm run build && npm run smoke:joris`

## Deployability notes

- Prefer **documenting** required env (`MICHAEL_HQ_OWNER_*`, Supabase, optional AI keys) via existing `npm run doctor` rather than inventing infra.
- Adding Render/Vercel config is a **separate explicit mandate** (deploy scripts can be Yellow/Red depending on target).
- App is already a single Next.js service — closest OSS deploy lesson from CrewDock/Paddock is “one composeable operator UI + health”, not microservices.

## NO-GO / WATCH

- **NO-GO now:** Adopting CopilotKit / assistant-ui / FerrumDeck / ORION stacks (deps or architecture rewrite).
- **WATCH:** Paddock’s Hermes harness adapters if Oria later mandates external runtime adapters (future phase).
- **WATCH:** Nous Hermes `approvals.mode` (manual/smart/off) as vocabulary for Oria permission modes — naming only until mandated.

## Model / subscription coherence (verified 2026-07-11)

OpenAI and Anthropic are **not blocked** in code. Live chat uses `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` via `llm-json-provider.ts`. Missing keys → deterministic fallback (looks “dumb”, not banned).

Connecting ChatGPT / Claude **subscriptions** (not API keys) is documented in `docs/LOCAL_SUBSCRIPTION_RUNTIME_GATE.md`: official CLIs only; cookie/OAuth interception = permanent NO-GO; CLI **dispatch** into Joris is still `future_pr` (Yellow mandate). Cursor MCP is editor-side, not the HQ model runtime.

## Self-check

- [x] Repo URLs from live search (Bright Data SERP 401 → WebSearch fallback)
- [x] No invented Oria APIs
- [x] Yellow/Red called out for deps and rewrites
- [x] Winner is green-zone UI glue
- [x] Accounts for JorisDock / agenda work already in flight (PR #339)
- [x] Product name corrected to **Oria**
