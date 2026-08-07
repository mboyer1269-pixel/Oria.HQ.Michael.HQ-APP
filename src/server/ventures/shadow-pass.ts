// src/server/ventures/shadow-pass.ts
//
// V7 — one shadow pass, shared by the daily cron and the manual trigger.
//
// The two callers differ in exactly two ways, so both are parameters rather
// than reasons to duplicate the orchestration:
//
//   * ISOLATION. The cron passes Inngest's `step.run`, so a venture that fails
//     does not take the batch with it and a redeploy resumes mid-run. The
//     manual route passes a pass-through: there is a human watching, and an
//     HTTP request has nothing to resume into.
//
//   * TICK IDENTITY. The cron emits SHADOW_TICK_ACTION_TYPE, which is what the
//     cronbeat probe watches. The manual route emits a DIFFERENT type on
//     purpose — a human-triggered run must never make the probe report the cron
//     healthy. The probe answers "is the schedule alive", and a manual pass is
//     not evidence of that.
//
// Everything else — selection, cap, dedup, the tick report — is identical, and
// duplicating it would let the two drift until only one of them respected the
// batch cap.

import "server-only";

import type { WorkspaceContext } from "@/core/workspace-context";
import { recordLedgerEvent } from "@/server/actions/ledger-events";
import { listVenturesForWorkspace } from "./venture-repository";
import { findVenturesProposedToday } from "./shadow-proposal-dedup";
import { buildTickReport, formatTickSummary, selectShadowBatch } from "./shadow-tick-report";
import type { ProposalTally, TickReport } from "./shadow-tick-report";
import type { VentureScoreProposal } from "@/features/ventures/venture-score-proposal";
import { runShadowProposalForVenture } from "./venture-score-shadow-runner";

/**
 * A JSON round-trip of T.
 *
 * Inngest serializes every step result so a run can resume after a crash, so
 * what comes back is the JSON form of what was returned — not the object
 * itself. Steps here therefore only ever carry primitives and plain arrays,
 * where that round-trip is identity. Passing a VentureCard through a step would
 * type-check under a cast and quietly change any Date it carried into a string.
 */
export type StepResult<T> = T extends string | number | boolean | null
  ? T
  : T extends readonly (infer U)[]
    ? StepResult<U>[]
    : { [K in keyof T]: StepResult<T[K]> };

/** Wraps one unit of work. Inngest's step.run satisfies this shape. */
export type StepRunner = <T>(id: string, fn: () => Promise<T>) => Promise<StepResult<T>>;

/** Default: run inline. No isolation, no resumability — for a watched request. */
const inlineStep: StepRunner = async (_id, fn) => (await fn()) as never;

/** A1 — the pass prepares and proposes; it executes nothing. */
const SHADOW_PASS_AUTONOMY_LEVEL = 1;

export type ShadowPassDeps = {
  runStep?: StepRunner;
  /** Which ledger action type the closing tick carries. */
  tickActionType: string;
  listVentures?: typeof listVenturesForWorkspace;
  findProposedToday?: typeof findVenturesProposedToday;
  proposeForVenture?: typeof runShadowProposalForVenture;
  recordEvent?: typeof recordLedgerEvent;
  agentId?: string;
  /**
   * Return the proposals themselves, not just the counts.
   *
   * Off by default, and off for the cron: nobody reads a scheduled run's
   * proposals from its return value — they are in the ledger — and carrying
   * eleven rationales through every Inngest step would pay durable storage for
   * output that is thrown away.
   *
   * On for the manual trigger, where the whole point is reading them.
   */
  collectProposals?: boolean;
};

export type ShadowPassResult = {
  report: TickReport;
  /** Populated only when collectProposals is set. */
  proposals: VentureScoreProposal[];
};

/**
 * Runs one pass: select a capped batch, propose for each, then account for it.
 *
 * The tick is emitted unconditionally, including when nothing was proposed:
 * "ran and found no candidates" and "did not run" are different facts, and only
 * that row tells them apart.
 */
export async function runShadowPass(
  ctx: WorkspaceContext,
  deps: ShadowPassDeps,
): Promise<ShadowPassResult> {
  const runStep = deps.runStep ?? inlineStep;
  const listVentures = deps.listVentures ?? listVenturesForWorkspace;
  const findProposedToday = deps.findProposedToday ?? findVenturesProposedToday;
  const propose = deps.proposeForVenture ?? runShadowProposalForVenture;
  const record = deps.recordEvent ?? recordLedgerEvent;
  const agentId = deps.agentId ?? "venture_scorer";

  // PHASE 1 — selection. One read of each kind for the whole batch: twenty
  // dedup reads to guard twenty ventures would cost more than the duplicates
  // they prevent.
  // Only ids and counts cross the step boundary — see StepResult. The venture
  // objects are looked up again below, which a resumed run would do anyway.
  const plan = await runStep("select-batch", async () => {
    const [ventures, dedup] = await Promise.all([
      listVentures(ctx.workspace.id).catch(() => []),
      findProposedToday(ctx),
    ]);

    const selection = selectShadowBatch(ventures, dedup.alreadyProposed);
    return {
      selectedIds: selection.selected.map((venture) => venture.id),
      considered: selection.considered,
      deduped: selection.deduped,
      deferred: selection.deferred,
      dedupDegraded: dedup.degraded,
    };
  });

  // PHASE 2 — proposals. Each venture is its own unit of work, and each reports
  // failure as a skip rather than throwing, so one bad venture leaves the rest
  // of the batch intact.
  const tally: ProposalTally = { proposed: 0, skipped: [] };

  const byId = new Map(
    (await listVentures(ctx.workspace.id).catch(() => [])).map((venture) => [venture.id, venture]),
  );

  const proposals: VentureScoreProposal[] = [];

  for (const ventureId of plan.selectedIds) {
    const result = await runStep(`propose-${ventureId}`, async () => {
      const venture = byId.get(ventureId);
      if (!venture) {
        return { ok: false, reason: "venture disappeared mid-run", proposal: null };
      }

      try {
        const outcome = await propose(ctx, venture);
        if (outcome.status !== "proposed") {
          return { ok: false, reason: outcome.reason, proposal: null };
        }
        return {
          ok: true,
          reason: "",
          // A proposal is plain JSON — strings, numbers, arrays — so it crosses
          // the step boundary unchanged. It is still omitted unless asked for,
          // because the cron would be paying durable storage for it.
          proposal: deps.collectProposals ? outcome.proposal : null,
        };
      } catch (error) {
        return {
          ok: false,
          reason: error instanceof Error ? error.message.slice(0, 120) : "proposal threw",
          proposal: null,
        };
      }
    });

    if (result.ok) {
      tally.proposed += 1;
      if (result.proposal) proposals.push(result.proposal as VentureScoreProposal);
    } else {
      tally.skipped.push({ ventureId, reason: result.reason });
    }
  }

  // PHASE 3 — the account.
  const report = buildTickReport({
    selection: {
      selected: [],
      considered: plan.considered,
      deduped: plan.deduped,
      deferred: plan.deferred,
    },
    tally,
    dedupDegraded: plan.dedupDegraded,
  });

  await runStep("tick-report", async () => {
    try {
      await record(ctx, {
        eventType: "decision",
        actionType: deps.tickActionType,
        summary: formatTickSummary(report),
        autonomyLevel: SHADOW_PASS_AUTONOMY_LEVEL,
        requiresConfirmation: false,
        workspaceId: ctx.workspace.id,
        agentId,
        effect: { kind: "db_write", operation: "plan", target: "venture_score_tick" },
        metadata: {
          considered: report.considered,
          proposed: report.proposed,
          skipped: report.skipped,
          skippedReasons: report.skippedReasons,
          deduped: report.deduped,
          deferred: report.deferred,
          deferredVentureIds: report.deferredVentureIds,
          dedupDegraded: report.dedupDegraded,
          balanced: report.balanced,
        },
      });
    } catch {
      // A failed tick row leaves the probe reading stale. That is the honest
      // outcome: the run happened but left no evidence, and a probe reporting
      // health from an unwritten tick would be worse.
    }
    return report;
  });

  return { report, proposals };
}
