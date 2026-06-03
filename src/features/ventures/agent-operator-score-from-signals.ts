// src/features/ventures/agent-operator-score-from-signals.ts
//
// Closes the cash loop on the AGENT side. Captured proof (CashSignalIntake)
// already lights up the venture view via the cash-signal → outcome adapter; this
// connector takes the SAME captured signals and routes them all the way to the
// agent operator score, so the agent that prepared an action is credited (or
// penalised) by the proof that actually came back.
//
//   CashSignalIntake[]  →  AgentRevenueOutcome[]  →  AgentOperatorScore
//        (proof)              (adapter, pure)          (operator scoring)
//
// Each intake carries sourceAgentId, so outcomes attribute cleanly to the agent
// that owned the action. Pure/local: no DB, no network, no UI, no runtime — it
// only composes the existing pure adapter, builder, and scorer.

import { buildAgentRevenueOutcome } from "./agent-revenue-outcome";
import type { AgentRevenueOutcome } from "./agent-revenue-outcome";
import type { AgentOperatorScore } from "./auto-agent-operator-score";
import { scoreAgentOperator } from "./auto-agent-operator-score";
import type { CashSignalIntake } from "./cash-signal-intake";
import { mapCashSignalToOutcomeInput } from "./cash-signal-outcome-adapter";

// Convert captured cash signals into agent revenue outcomes. Order-preserving
// and deterministic — each intake maps to exactly one outcome.
export function buildAgentRevenueOutcomesFromSignals(
  intakes: readonly CashSignalIntake[],
): AgentRevenueOutcome[] {
  return intakes.map((intake) => buildAgentRevenueOutcome(mapCashSignalToOutcomeInput(intake)));
}

// Score a single agent from the captured signals it owns. Intakes for other
// agents are ignored (filtered by sourceAgentId), so the caller can pass a whole
// workspace's signals without pre-filtering.
export function scoreAgentOperatorFromSignals(
  agentId: string,
  intakes: readonly CashSignalIntake[],
): AgentOperatorScore {
  const own = intakes.filter((intake) => intake.sourceAgentId === agentId);
  const outcomes = buildAgentRevenueOutcomesFromSignals(own);
  return scoreAgentOperator(agentId, outcomes);
}

// The set of distinct agent ids that own at least one captured signal,
// in first-seen order (deterministic).
export function agentIdsFromSignals(intakes: readonly CashSignalIntake[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const intake of intakes) {
    if (intake.sourceAgentId && !seen.has(intake.sourceAgentId)) {
      seen.add(intake.sourceAgentId);
      ids.push(intake.sourceAgentId);
    }
  }
  return ids;
}

// Score every agent that owns captured signals. Returns one operator score per
// distinct sourceAgentId, in first-seen order.
export function scoreAllAgentOperatorsFromSignals(
  intakes: readonly CashSignalIntake[],
): AgentOperatorScore[] {
  return agentIdsFromSignals(intakes).map((agentId) =>
    scoreAgentOperatorFromSignals(agentId, intakes),
  );
}
