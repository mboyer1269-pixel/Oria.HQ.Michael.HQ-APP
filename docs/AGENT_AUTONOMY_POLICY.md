# Orya Agent Autonomy Policy

This document defines the autonomy, execution rules, and safety boundaries for all agents operating within the Orya platform.

## Strategic Decisions

The following principles govern agent autonomy:

1. Tier and license are separate (`AutonomyTier` vs `AgentExecutionLicense`).
2. Agents never receive global permission.
3. Green autonomous actions require ALL 13 conditions (corridor, tier, license, policy pass, budget, suppression, no egress, bounded blast radius, reversible, rollback plan, tested rollback, ledger evidence, kill switch inactive).
4. "Reversible" is not merely "small" — it requires a tested rollback.
5. DB prod is not automatically red (append-only ledger is green-possible).
6. LLM supervisor can only downgrade risk, never override a deterministic block.
7. Non-composability must be defined: evaluator uses aggregate effect ceiling per agent.
8. Fail-safe default: unknown is never green (requires BLOCK or REQUIRE_APPROVAL).
9. Promotion is governed (eligible, not entitled); demotion can be automatic.
10. Mastra/runtime adoption is out of scope.
11. Green corridors must be non-composable.
12. No side effects are unlocked by this PR.

## Section 13

### Fail-safe defaults (unknown = not green)
The system operates on a strict fail-safe default. If the risk level, corridor status, or permission state of an action cannot be deterministically verified, the system treats it as "not green". Any unknown state immediately requires either a `BLOCK` or `REQUIRE_APPROVAL` directive. Agents cannot proceed autonomously when in an unknown state.

### Aggregate effect ceiling / non-composability mechanics
Green corridors are designed to be strictly non-composable. This ensures that multiple independent green actions cannot be chained together to bypass blast radius limits. The policy evaluator enforces an aggregate effect ceiling per agent session. Once the aggregate impact approaches this ceiling, subsequent actions are escalated, preventing combinatorial risks from compound autonomous executions.
