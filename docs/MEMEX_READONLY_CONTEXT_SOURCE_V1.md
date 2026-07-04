# Memex Read-Only Context Source v1

**Status:** v1 · Oria HQ only · no memex-core changes  
**Doctrine:** Oria = GOVERN · Memex = ORIENT · Evidence = preuve  
**Related:** `docs/MEMEX_BRIDGE_REALITY_GATE.md` · `docs/AGENT_EVIDENCE_PACKS_V1.md` · PR #331 (Evidence Packs canon)

## Purpose

Branch Memex Core as an **optional read-only** context source for Joris. Memex may **orient** the CEO with provenance-cited advisory context after a successful handshake gate. Memex never governs, never writes, never proposes, never consolidates, never replaces Memory Vault, and never overrides Oria model policy.

## Why handshake is in this PR

The handshake gate (`runMemexHandshake`) must be proven green **before** any Joris injection path is wired. Shipping handshake + optional Joris enrichment in one PR keeps the corridor closed: no code path can call Memex tools or merge context without passing tool discovery validation first. Tests pin all 16 failure modes.

## Transport choice

| Mode | v1 behavior |
|------|-------------|
| **stdio (local)** | Recommended when `MEMEX_CORE_ROOT` points at a local memex-core checkout and spawn is allowed. Command: `node --experimental-strip-types <memex-core>/src/mcp/server.ts` via `@modelcontextprotocol/sdk` StdioClientTransport. |
| **SSE / VPS** | **PARK** — not in v1 |
| **Cloud (Vercel, Lambda, …)** | **Unavailable** — never spawns local Memex by default |
| **Production local** | Requires `ORIA_ENABLE_MEMEX_READONLY=1` **and** `MEMEX_CORE_ROOT` |

No free shell, no user-controlled args, bounded timeout (default 5s), bounded output (8k chars).

## Dependency

**YES** — `@modelcontextprotocol/sdk@1.0.1` (minimal official MCP client for controlled stdio only).

No OpenAI/Anthropic/Zapier SDK, no OAuth, no mandatory secrets.

## Allowed tools (v1 exact allowlist)

- `agentmemory_context_pack`
- `agentmemory_librarian_brief`
- `agentmemory_project_state`
- `agentmemory_latest_updates`

## Forbidden tools

- `agentmemory_submit_proposal`
- `agentmemory_write_vault_file`
- `agentmemory_read_vault_file` (raw vault path surface)
- `agentmemory_search_vault` (unbounded search)
- `agentmemory_graph_query`
- `agentmemory_tool_catalog_search`
- Wildcard tool names
- Any write / propose / consolidate / delete / deprecate action

## Memory Evidence Pack usage

Every successful Memex injection builds a **Memory Evidence Pack** (`src/server/agents/evidence/memory-evidence-pack.ts`) before context is merged. The pack records provenance, namespace, budget, redactions, and `oriaAuthority: true`. Invalid packs fail closed — context stays unchanged.

## Joris before / after

**Before:** Joris memory context = Memory Vault verified entries + verified lessons rail only.

**After (Memex available + handshake OK):** Same base context, plus an advisory Memex block merged via `mergeMemexContext` with provenance citations. **After (Memex unavailable / timeout / bad output):** Identical to before — no behavior change.

Integration: `src/server/joris/brain.ts` calls `enrichJorisMemoryContextWithMemex` after vault/lessons assembly; injectable via `RunJorisCommandDeps.enrichMemexContext`.

## Fallback behavior

Fail closed at every layer:

1. Environment gate → unavailable  
2. Handshake failure → existing context  
3. Tool call failure / timeout → existing context  
4. Empty selection / invalid evidence pack → existing context  

No throws toward Joris; transport cleanup errors are swallowed.

## Cloud behavior

Cloud env markers (`VERCEL`, `AWS_LAMBDA_FUNCTION_NAME`, …) set `spawnAllowed: false`. Joris continues with vault-only context. Cloud does **not** spawn a local Memex process.

## Security boundaries

- Read-only corridor enforced by bridge contract + runtime checks  
- Sentinelle authority unchanged; memory never authorizes tool use  
- Ledger unchanged  
- No tenant/customer exposure (`tenantExposureForbidden: true`)  
- Personal memory fabric scoped by namespace  
- Routing hints advisory only — `applyMemexRoutingHint` / `applyMemoryRoutingHint` return Oria decision unchanged  

## Modules

| File | Role |
|------|------|
| `src/server/mcp/memex-readonly-client.ts` | Handshake, allowlist, calls, evidence assembly |
| `src/server/mcp/memex-stdio-transport.ts` | Controlled stdio spawn |
| `src/server/joris/memex-context-source.ts` | Joris optional enrichment |
| `src/server/mcp/memex-bridge-contract.ts` | Pure merge/selection policy (existing) |

## Validation

```bash
npm run typecheck
npm run lint
npm run test
npm run smoke:joris
npm run check:layering
npm run map:check
npm run build
```

## Non-goals (v1)

- Memex writes, proposals, consolidation, active forgetting execution  
- Memory Vault replacement  
- Model routing authority  
- UI / dashboard  
- VPS / SSE transport  
- DB migration  
- Tenant/customer exposure  

## Next PRs

- Optional SSE transport behind explicit ops gate (PARK)  
- Additional read tools (context_pack, project_state) with pack parsers  
- Evidence pack persistence to Ledger (display-only audit trail)  
- v2 propose-approve bridge behind Sentinelle (separate initiative)
