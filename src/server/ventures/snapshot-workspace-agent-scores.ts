// src/server/ventures/snapshot-workspace-agent-scores.ts
//
// End-to-end closing of the agent cash loop on the server side:
//
//   captured CashSignalIntake[]  →  AgentOperatorScore[]  →  persisted snapshots
//
// It reads a workspace's captured proof, scores every agent that owns proof
// (pure connector), and appends one score snapshot per agent so the CEO gets a
// performance curve over time. It executes nothing and sends nothing.
//
// Testability: list + persist + clock are injectable. With no overrides it uses
// the cash-signal and agent-score-snapshot repositories (both with in-memory dev
// fallbacks), so it runs in tests WITHOUT a real database and WITHOUT migrations
// 0012 / 0014 applied in production.

import type { AgentScoreSnapshot } from "@/features/ventures/agent-score-snapshot";
import { buildAgentScoreSnapshot } from "@/features/ventures/agent-score-snapshot";
import { scoreAllAgentOperatorsFromSignals } from "@/features/ventures/agent-operator-score-from-signals";
import type { CashSignalIntake } from "@/features/ventures/cash-signal-intake";
import { listCashSignalIntakesForWorkspace } from "./cash-signal-intake-repository";
import { createAgentScoreSnapshot } from "./agent-score-snapshot-repository";

export type SnapshotWorkspaceAgentScoresDeps = {
  /** Read captured cash signals for the workspace. Default: cash-signal repository. */
  listSignals: (workspaceId: string) => Promise<CashSignalIntake[]>;
  /** Persist one snapshot. Default: agent-score-snapshot repository. */
  persistSnapshot: (
    workspaceId: string,
    userId: string,
    snapshot: AgentScoreSnapshot,
  ) => Promise<AgentScoreSnapshot>;
  /** Clock. Default: real ISO now. */
  now: () => string;
};

function resolveDeps(overrides?: Partial<SnapshotWorkspaceAgentScoresDeps>): SnapshotWorkspaceAgentScoresDeps {
  return {
    listSignals: overrides?.listSignals ?? listCashSignalIntakesForWorkspace,
    persistSnapshot: overrides?.persistSnapshot ?? createAgentScoreSnapshot,
    now: overrides?.now ?? (() => new Date().toISOString()),
  };
}

export type SnapshotWorkspaceAgentScoresInput = {
  workspaceId: string;
  userId: string;
};

export type SnapshotWorkspaceAgentScoresResult = {
  snapshots: AgentScoreSnapshot[];
  scoredAt: string;
  agentsScored: number;
  signalsConsidered: number;
};

/**
 * Scores every agent that owns captured proof in the workspace and appends a
 * snapshot per agent. Returns the persisted snapshots. Idempotent per
 * (agent, scoredAt) via the snapshot id; a repeated call at the same timestamp
 * would collide on the unique constraint, which the caller treats as a no-op.
 */
export async function snapshotWorkspaceAgentScores(
  input: SnapshotWorkspaceAgentScoresInput,
  overrides?: Partial<SnapshotWorkspaceAgentScoresDeps>,
): Promise<SnapshotWorkspaceAgentScoresResult> {
  const deps = resolveDeps(overrides);
  const scoredAt = deps.now();

  const signals = await deps.listSignals(input.workspaceId);
  const scores = scoreAllAgentOperatorsFromSignals(signals);

  const snapshots: AgentScoreSnapshot[] = [];
  for (const score of scores) {
    const outcomeCount = signals.filter((s) => s.sourceAgentId === score.agentId).length;
    const snapshot = buildAgentScoreSnapshot({ score, scoredAt, outcomeCount });
    snapshots.push(await deps.persistSnapshot(input.workspaceId, input.userId, snapshot));
  }

  return {
    snapshots,
    scoredAt,
    agentsScored: scores.length,
    signalsConsidered: signals.length,
  };
}
