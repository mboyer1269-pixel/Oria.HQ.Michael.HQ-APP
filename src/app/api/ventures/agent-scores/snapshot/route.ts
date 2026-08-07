import { NextResponse } from "next/server";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { recordLedgerEvent } from "@/server/actions/ledger-events";
import { snapshotWorkspaceAgentScores } from "@/server/ventures/snapshot-workspace-agent-scores";

/**
 * POST /api/ventures/agent-scores/snapshot
 *
 * Scores every agent holding captured cash proof in the workspace and appends
 * one snapshot per agent, so the owner gets a performance curve over time
 * instead of a single instantaneous number.
 *
 * POST rather than GET: it writes rows to agent_score_snapshots. That is not a
 * safe method, and a prefetch or a link preview must not be able to trigger it.
 *
 * Owner-gated for the same reason.
 *
 * Every pass is recorded in the ledger. Snapshotting is the mildest kind of
 * write — additive, reversible, executing nothing — but it is still a
 * production write made on a human's command, and the rule here is that those
 * leave a trace. The row is written after the fact and carries the real
 * counts, so a pass that scored nothing is distinguishable from one that never
 * ran.
 */
export const dynamic = "force-dynamic";

/** A1 — this reads proof and records a measurement. It executes nothing. */
const SNAPSHOT_AUTONOMY_LEVEL = 1;

export const AGENT_SCORE_SNAPSHOT_ACTION_TYPE = "ventures.agent_scores.manual_snapshot";

export async function POST() {
  const authResponse = await requireOwnerApiSession();
  if (authResponse) return authResponse;

  const ctx = getActiveWorkspaceContext();

  try {
    const result = await snapshotWorkspaceAgentScores({
      workspaceId: ctx.workspace.id,
      userId: ctx.userId,
    });

    await recordLedgerEvent(ctx, {
      eventType: "decision",
      actionType: AGENT_SCORE_SNAPSHOT_ACTION_TYPE,
      summary: `Snapshot manuel — ${result.agentsScored} agent(s) scoré(s) sur ${result.signalsConsidered} signal(aux).`,
      autonomyLevel: SNAPSHOT_AUTONOMY_LEVEL,
      requiresConfirmation: false,
      workspaceId: ctx.workspace.id,
      agentId: "finops",
      effect: { kind: "db_write", operation: "plan", target: "agent_score_snapshots" },
      metadata: {
        agentsScored: result.agentsScored,
        signalsConsidered: result.signalsConsidered,
        scoredAt: result.scoredAt,
        trigger: "manual",
      },
    }).catch(() => {
      // A failed ledger write must not discard a snapshot that did happen. The
      // rows are already persisted; losing the trace is the lesser harm, and
      // pretending the pass failed would be the greater one.
    });

    return NextResponse.json({
      trigger: "manual",
      workspaceId: ctx.workspace.id,
      scoredAt: result.scoredAt,
      agentsScored: result.agentsScored,
      signalsConsidered: result.signalsConsidered,
      snapshots: result.snapshots.map((snapshot) => ({
        snapshotId: snapshot.snapshotId,
        agentId: snapshot.agentId,
        totalOperatorScore: snapshot.totalOperatorScore,
        operatorScoreBand: snapshot.operatorScoreBand,
        operatorStatus: snapshot.operatorStatus,
        dimensionScores: snapshot.dimensionScores,
        // How many captured outcomes fed the number. A score built on two
        // signals and one built on forty read the same without it.
        outcomeCount: snapshot.outcomeCount,
      })),
    });
  } catch (error) {
    // snapshotWorkspaceAgentScores persists agent by agent and does not isolate
    // failures, so a throw part-way leaves the earlier agents already written.
    // Say so rather than implying nothing happened — the owner needs to know a
    // partial set exists before reading the curve.
    return NextResponse.json(
      {
        trigger: "manual",
        error: "snapshot pass failed",
        partialWritePossible: true,
        reason: error instanceof Error ? error.message.slice(0, 200) : "unknown",
      },
      { status: 500 },
    );
  }
}
