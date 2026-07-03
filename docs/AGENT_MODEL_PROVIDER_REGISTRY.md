# Agent Model Provider Registry — Foundation Contracts

**Status:** contracts only. No runtime wiring, no network calls, no SDKs, no
secrets, no DB. This document describes the foundation shipped in
`src/server/agents/models/` and the doctrine it enforces.

## Doctrine

- **Oria = GOVERN. Memex = ORIENT. Hermes/Joris = ACT.**
- **Providers are adapters, never core.** Oria absorbs, compares, governs,
  replaces, and audits model providers. No provider takes the wheel.
- Existing execution rule (unchanged):
  `provider → adapter → skillId → Sentinelle zone → Autonomy Line → Wager si requis → Ledger`
- New model-selection rule introduced by these contracts:
  `Intent → Agent Profile → Model Policy → Provider Registry → Runtime Adapter → Sentinelle → Ledger`

## Why this exists

Today the vendor choice is hardcoded in core routing:

- `src/server/ai/model-config.ts` pins `claude-sonnet-4-6`, `gpt-4o-mini`,
  and `gemini-flash` as the premium/economy/long-context brains, with a
  vendor-specific fallback chain.
- `src/server/ai/llm-json-provider.ts` closes the provider union to
  `"anthropic" | "openai"` and hardcodes the auto order.
- `src/core/types.ts` closes `ModelProvider` to four named vendors.

That is the "Joris = Claude/OpenAI" assumption. These contracts make the
binding a governed, data-driven decision instead. Migration of the existing
router onto the registry is a **future PR** (see Next PRs).

## Contracts

| File | Exports | Role in the chain |
| --- | --- | --- |
| `model-provider-contract.ts` | `ModelProviderDescriptor`, `ModelCapabilityDescriptor`, `ModelPricingDescriptor`, `RuntimeAdapterDescriptor`, `LocalRuntimePreference`, `SentinelleGateMetadata`, `ProviderCostTier`, `ProviderTrustLevel`, catalog source types, pure validators | Vocabulary + per-descriptor invariants |
| `provider-registry-contract.ts` | `ProviderRegistry`, `createStaticProviderRegistry` | Provider Registry (static, validated, in-memory) |
| `agent-model-profile-contract.ts` | `AgentModelProfile`, `ModelRouteBinding`, validators | Agent Profile → Model Policy binding |
| `model-selection-policy.ts` | `selectModel`, `ModelSelectionDecision` | Model Policy (pure decision function) |

Naming note: the governance `AgentProfile` (roles, autonomy, approval gates)
already lives in `src/server/agents/agent-profile-contract.ts`. The new
`AgentModelProfile` references it by `agentId` and never redefines it.

## Invariants (each backed by a test)

1. **Unknown provider → ineligible.** The registry returns `undefined`; the
   policy skips the candidate. Never a silent fallback.
2. **Unknown model → ineligible.** Same rule.
3. **Secrets never live in descriptors.** `apiKeyEnvVar` must be an
   environment variable NAME (`OPENROUTER_API_KEY`), validated by pattern.
   A key value fails validation.
4. **Free is proven, never assumed.** `costTier: "free"` requires
   catalog-proven zero pricing on all three dimensions. Unknown (`null`)
   pricing is only usable as free behind an explicit policy opt-in
   (`allowTrialOrUnknownAsFree`).
5. **Tool use requires trust.** `untrusted` providers cannot run tools at
   all; `reviewed` providers run tools only behind a forced
   `requiresApprovalForToolUse` gate; only `allowlisted` providers use the
   adapter's declared gate as-is.
6. **No hidden vendor pins.** An `auto` route with a single candidate is
   invalid. Binding one vendor requires `bindingMode: "pinned"` plus a
   written `pinnedReason`.
7. **Local runtime preferred, never assumed.** `assumeAvailable` is the
   literal `false` in the type; the policy silently falls back when the
   preferred adapter is absent.
8. **OpenRouter is a catalog source, not core.** The only sanctioned source
   is the official JSON API (`https://openrouter.ai/api/v1/models`), consumed
   as cached snapshots. HTML scraping fails validation. Live refresh is a
   future PR.
9. **CLI subscription runtimes are adapters, not model providers.** Claude
   Code, Gemini CLI, and ChatGPT/OpenAI MCP clients are
   `RuntimeAdapterDescriptor` (`kind: "cli-subscription"` / `"mcp-client"`),
   never `ModelProviderDescriptor`.
10. **Ledger has no opt-out.** `ledgerRequired` is the literal `true` on
    adapters and on every eligible decision; `sentinelleRequired` likewise.
    `SentinelleGateMetadata` is input to Sentinelle's policy engine, never a
    bypass — the authoritative verdict still comes from
    `evaluateLiveExecution` at dispatch time.

## Security model

- Pure TypeScript + pure functions: no I/O, no network, no `process.env`
  reads, no persistence, no side effects.
- Descriptors reference secrets by env var NAME only; validation rejects
  anything that does not look like a name.
- MCP servers and new providers default to `untrusted`. Tool descriptions
  and provider metadata are input, not authority: nothing in this registry
  can trigger execution.
- Every eligible decision carries `sentinelleRequired: true` and
  `ledgerRequired: true`. Runtime enforcement stays with Sentinelle
  (`src/server/runtime/execution-guard.ts`) and the Ledger.

## Non-goals (this PR)

- No OpenRouter live fetch, no Ollama live call, no Claude/OpenAI/Gemini SDK.
- No provider package, no API key, no `.env` change, no external call.
- No runtime execution, no DB/migration, no webhook.
- No Sentinelle or Ledger bypass, no hardcoded venture/client.
- No migration of `model-config.ts` / `llm-json-provider.ts` (future PR).

## Next PRs

1. OpenRouter catalog refresh with cache, rate limit, provenance, and zero
   secret values in the repo.
2. Ollama local runtime health check and model discovery.
3. Joris model policy migration off the hardcoded vendor defaults in
   `model-config.ts` / `llm-json-provider.ts`.
4. Claude/Gemini/ChatGPT MCP client compatibility matrix.
5. Sentinelle-governed runtime execution adapter.
6. Agent memory bridge with the Memex context pack.
