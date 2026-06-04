# Original User Request

## Initial Request — 2026-06-04T06:27:40Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview

Execute PR-A: Write and document the Orya Agent Autonomy Policy based on the strategic decisions provided by the user.

Working directory: C:\Users\micha\.gemini\antigravity\worktrees\Oria.HQ.Michael.HQ-APP\refine-antigravity-autonomy-policy
Integrity mode: development

## Strategic Decisions to Encode
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

## Requirements

### R1. Create docs/AGENT_AUTONOMY_POLICY.md
Create `docs/AGENT_AUTONOMY_POLICY.md` from scratch. Ensure it encodes the 12 strategic decisions above. Ensure Section 13 explicitly includes: "Fail-safe defaults (unknown = not green)" and "Aggregate effect ceiling / non-composability mechanics".

### R2. Create .agents/rules/orya-agent-autonomy-policy.md
Create `.agents/rules/orya-agent-autonomy-policy.md` representing the agent-facing rules derived from the policy.

### R3. Update DECISION_LOG.md
Update `docs/DECISION_LOG.md` to reflect the new Agent Autonomy Policy decisions.

### R4. Enforce Scope Locks
This is a docs-only PR. Obey the existing docs-only scope locks. Do not modify `README.md`, `src/`, `db/`, `migrations/`, `package.json`, `.env`, runtime, executor, or Mastra files.

## Acceptance Criteria

### Documentation Verification
- [ ] `docs/AGENT_AUTONOMY_POLICY.md` is created and contains the 12 strategic decisions and the required Section-13 subsections.
- [ ] `.agents/rules/orya-agent-autonomy-policy.md` is created and accurately reflects the policy rules.
- [ ] `docs/DECISION_LOG.md` is updated.
- [ ] Running `git diff --stat` confirms that ONLY files under `docs/` and `.agents/` are modified or added.
- [ ] Validation suite (`npm run typecheck`, `npm run lint`, `npm test`, `npm run smoke:joris`) passes without relying on conditional fallbacks.
