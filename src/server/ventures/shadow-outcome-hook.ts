// src/server/ventures/shadow-outcome-hook.ts
//
// V7 Phase 1 step 4a — the outcome hook.
//
// One entry point, meant to be called right after the owner records a score:
// it finds that venture's most recent pairable proposal and writes the measured
// divergence to the ledger.
//
// NOT WIRED HERE. Calling it from `scoreVentureAction` moves this module from
// "cannot trigger anything" to "runs on every score the owner records" — a
// risk-profile change that belongs in its own reviewed PR, not bundled with the
// contracts it depends on. The tripwire stays red until that lands.
//
// Design constraints, all of them consequences of where this runs:
//
//   * NEVER THROWS. The caller is the owner's live scoring path. A missing
//     measurement must not surface as an error on a decision they just made —
//     the score is the product, the measurement is the byproduct.
//   * NEVER MUTATES. It reads a proposal and appends one ledger row. It does
//     not touch venture lifecycle, and it cannot: the modules that could are
//     not imported.
//   * ALWAYS REPORTS WHY. Every non-recording path returns a named reason, so
//     "no divergence data accumulated" is diagnosable rather than silent.

import "server-only";

import type { WorkspaceContext } from "@/core/workspace-context";
import type { VentureScore } from "@/core/types";
import { findLatestShadowProposal } from "./shadow-proposal-read-model";
import type { ShadowProposalReadDeps } from "./shadow-proposal-read-model";
import { recordShadowOutcome } from "./venture-score-shadow-runner";
import type { ShadowRunnerDeps } from "./venture-score-shadow-runner";

export type ShadowOutcomeHookResult =
  | { status: "recorded"; proposalId: string; recordedAt: string }
  | { status: "skipped"; reason: ShadowOutcomeSkipReason };

export type ShadowOutcomeSkipReason =
  /** No pairable proposal — the venture was scored before shadow mode saw it. */
  | "no_proposal"
  /** A proposal exists but could not be rebuilt; see the read model's reasons. */
  | "proposal_unreadable"
  /** The proposal was found but the ledger write failed. */
  | "write_failed";

export type ShadowOutcomeHookDeps = ShadowProposalReadDeps &
  Pick<ShadowRunnerDeps, "recordEvent"> & {
    findProposal?: typeof findLatestShadowProposal;
    recordOutcome?: typeof recordShadowOutcome;
  };

/**
 * Records the owner's score against the agent's proposal for the same venture.
 *
 * Returns `skipped` with a reason rather than throwing or returning a bare
 * boolean: an absent measurement and a failed write are different problems, and
 * collapsing them would hide a broken ledger behind "no proposal yet".
 */
export async function recordShadowOutcomeForVenture(
  ctx: WorkspaceContext,
  ventureId: string,
  actual: VentureScore,
  deps: ShadowOutcomeHookDeps = {},
): Promise<ShadowOutcomeHookResult> {
  const findProposal = deps.findProposal ?? findLatestShadowProposal;
  const recordOutcome = deps.recordOutcome ?? recordShadowOutcome;

  let lookup: Awaited<ReturnType<typeof findLatestShadowProposal>>;
  try {
    lookup = await findProposal(ctx, ventureId, deps);
  } catch {
    // The read model already swallows its own failures; this is belt and braces
    // for an injected implementation that does not.
    return { status: "skipped", reason: "proposal_unreadable" };
  }

  if (lookup.status === "absent") {
    return {
      status: "skipped",
      reason: lookup.reason === "not_found" ? "no_proposal" : "proposal_unreadable",
    };
  }

  const { proposal, recordedAt } = lookup.result;

  let written: boolean;
  try {
    written = await recordOutcome(ctx, proposal, actual, {
      ...(deps.recordEvent ? { recordEvent: deps.recordEvent } : {}),
    });
  } catch {
    return { status: "skipped", reason: "write_failed" };
  }

  return written
    ? { status: "recorded", proposalId: proposal.proposalId, recordedAt }
    : { status: "skipped", reason: "write_failed" };
}
