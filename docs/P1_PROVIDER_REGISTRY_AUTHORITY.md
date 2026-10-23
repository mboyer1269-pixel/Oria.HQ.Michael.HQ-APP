# P1 — authenticated Joris chat selection

Base: `origin/main` at `1db8c647efed55b896ccc4dc1c95ff24996b1042`.

The authenticated chat route detects intent and resolves the existing explicit
account/model selection through an AgentModelProfile, `selectModel()` and the
validated Provider Registry. The profile pins that model with a written reason;
P1 does not introduce automatic selection or fallback candidates.

`chat-model-policy.ts` translates the server capability into registry descriptors.
Only existing Anthropic/OpenAI API clients have compatibility adapters. Unknown
pricing stays unknown. Descriptors and selection grant no authorization: catalog
freshness, account/workspace scope, tariffs, ambiguity and budget checks remain
in `resolveChatModelBinding()` and the unchanged emission path.

The brain projects the resolved decision into its existing response fields and
does not call `chooseModel()` when a chat binding (ready or blocked) is supplied.
A divergence between the selected and approved models is refused. Generation
failure returns the existing deterministic reply, without selecting another model.
Requested/chosen and observed executed model IDs remain separate.

`chooseModel()` remains compatible for legacy callers outside this authenticated
route. `executionTargetForModel()` checks emission compatibility, never replaces
the selected model. Provider clients and `llm-json-provider.ts` are unchanged.
OpenRouter, Nara, local and subscription runtimes gain no execution capability.
Existing authorization/Sentinelle controls remain in place; this change does not
turn descriptor gate metadata into approval or add a Ledger persistence feature.

Tests use injected generators/transports and synthetic fixtures, with no real
model generation. Run the policy, binding, brain, registry/profile, router and
JSON provider tests, then the four AGENTS.md validations before declaring ready.

Recovery worktrees and the execution infrastructure are not sources of this change.
