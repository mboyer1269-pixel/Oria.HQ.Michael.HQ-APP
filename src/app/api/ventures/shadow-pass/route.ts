import { NextResponse } from "next/server";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { runShadowPass } from "@/server/ventures/shadow-pass";
import { SHADOW_MANUAL_PASS_ACTION_TYPE } from "@/server/ventures/venture-score-shadow-runner";

/**
 * POST /api/ventures/shadow-pass
 *
 * Runs one shadow pass on demand, so the owner can see what the agent produces
 * in seconds instead of waiting for tomorrow's 07:00 UTC cron. It is also how
 * the quality of the rationales gets judged — a judgement no test can make.
 *
 * Same orchestration as the cron: same batch cap, same daily deduplication, so
 * a manual run cannot double-propose for a venture the cron already handled
 * today, and cannot exceed the cost ceiling.
 *
 * It emits a DIFFERENT tick type from the cron. The cronbeat probe answers "is
 * the schedule alive", and a hand-triggered run is not evidence of that —
 * sharing the type would let someone keep the probe green by hand while the
 * cron had been dead for a week.
 *
 * POST rather than GET: it spends LLM budget and appends to the ledger. That is
 * not a safe method, and a link preview or a prefetch must not be able to
 * trigger it.
 */
export const dynamic = "force-dynamic";

export async function POST() {
  const authResponse = await requireOwnerApiSession();
  if (authResponse) return authResponse;

  const ctx = getActiveWorkspaceContext();

  try {
    const { report, proposals } = await runShadowPass(ctx, {
      tickActionType: SHADOW_MANUAL_PASS_ACTION_TYPE,
      // The counts say the pass ran. The rationales are what has to be judged,
      // and reading them out of the ledger by hand would defeat the point of a
      // trigger built to make that judgement quick.
      collectProposals: true,
    });

    return NextResponse.json({
      trigger: "manual",
      workspaceId: ctx.workspace.id,
      ...report,
      proposals: proposals.map((proposal) => ({
        proposalId: proposal.proposalId,
        ventureId: proposal.ventureId,
        overallScore: proposal.score.overallScore,
        recommendation: proposal.score.recommendation,
        gatesPassed: proposal.gates.allPassed,
        failedGates: proposal.gates.gates
          .filter((gate) => !gate.passed)
          .map((gate) => ({ id: gate.id, missing: gate.missing })),
        // Full, untruncated — the ledger caps rationales at 240 chars for its
        // own sake, but a judgement made on a clipped sentence is not a
        // judgement of what the agent actually said.
        evidence: proposal.evidence.map((item) => ({
          dimension: item.dimension,
          value: item.value,
          rationale: item.rationale,
          source: item.source,
        })),
      })),
    });
  } catch (error) {
    // runShadowPass absorbs per-venture failures itself, so reaching here means
    // something structural broke. Report it rather than returning a report that
    // would read as "ran and found nothing".
    return NextResponse.json(
      {
        trigger: "manual",
        error: "shadow pass failed",
        reason: error instanceof Error ? error.message.slice(0, 200) : "unknown",
      },
      { status: 500 },
    );
  }
}
