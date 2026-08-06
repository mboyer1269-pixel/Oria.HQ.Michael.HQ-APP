// src/server/jobs/shadow-score-cron.ts
//
// V7 Phase 1 step 4c-2 — the shadow mode trigger.
//
// Orchestration only. Every decision lives in pure modules that are tested
// without Inngest: batch selection and the tick report in shadow-tick-report,
// daily deduplication in shadow-proposal-dedup, proposal generation in the
// shadow runner. This file wires them and owns nothing.
//
// Runs once daily. Three phases in one function, producing ONE audit row per
// tick rather than N routines to correlate afterwards.
//
// It never mints a proposalId. That belongs to the domain, at the moment
// buildVentureScoreProposal constructs the proposal — two authorities over one
// key would make the pairing unprovable, which is the only thing shadow mode
// produces.

import { inngest } from "./inngest-client";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { recordLedgerEvent } from "@/server/actions/ledger-events";
import { listVenturesForWorkspace } from "@/server/ventures/venture-repository";
import { findVenturesProposedToday } from "@/server/ventures/shadow-proposal-dedup";
import {
  buildTickReport,
  formatTickSummary,
  selectShadowBatch,
} from "@/server/ventures/shadow-tick-report";
import type { ProposalTally } from "@/server/ventures/shadow-tick-report";
import {
  SHADOW_TICK_ACTION_TYPE,
  runShadowProposalForVenture,
} from "@/server/ventures/venture-score-shadow-runner";

/** Daily, off-peak. A venture's state does not change hourly. */
export const SHADOW_CRON_SCHEDULE = "0 7 * * *";

/** A1 — the tick prepares and proposes; it executes nothing. */
const SHADOW_TICK_AUTONOMY_LEVEL = 1;

export const shadowScoreCron = inngest.createFunction(
  {
    id: "shadow-score-cron",
    name: "Shadow mode — daily venture score proposals",
    // No retries. A retried tick would re-propose for ventures the first
    // attempt already handled; deduplication guards that, but a tick is cheap
    // to miss and expensive to double. The next day's run picks up the work.
    retries: 0,
  },
  { cron: SHADOW_CRON_SCHEDULE },
  async ({ step }) => {
    const ctx = getActiveWorkspaceContext();

    // PHASE 1 — selection. One step: one venture read, one dedup read, for the
    // whole batch. Twenty reads to guard twenty ventures would cost more than
    // the duplicates they prevent.
    const plan = await step.run("select-batch", async () => {
      const [ventures, dedup] = await Promise.all([
        listVenturesForWorkspace(ctx.workspace.id).catch(() => []),
        findVenturesProposedToday(ctx),
      ]);

      const selection = selectShadowBatch(ventures, dedup.alreadyProposed);
      return {
        ventureIds: selection.selected.map((venture) => venture.id),
        selection: {
          considered: selection.considered,
          deduped: selection.deduped,
          deferred: selection.deferred,
        },
        dedupDegraded: dedup.degraded,
      };
    });

    // PHASE 2 — proposals, one isolated step each. A venture that fails must
    // not take the other nineteen with it, so each step catches its own error
    // and reports it as a skip rather than throwing into the run.
    const tally: ProposalTally = { proposed: 0, skipped: [] };

    for (const ventureId of plan.ventureIds) {
      const result = await step.run(`propose-${ventureId}`, async () => {
        const ventures = await listVenturesForWorkspace(ctx.workspace.id).catch(() => []);
        const venture = ventures.find((candidate) => candidate.id === ventureId);
        if (!venture) return { ok: false as const, reason: "venture disappeared mid-run" };

        const outcome = await runShadowProposalForVenture(ctx, venture);
        return outcome.status === "proposed"
          ? { ok: true as const }
          : { ok: false as const, reason: outcome.reason };
      });

      if (result.ok) tally.proposed += 1;
      else tally.skipped.push({ ventureId, reason: result.reason });
    }

    // PHASE 3 — the tick. Emitted unconditionally, including when nothing was
    // proposed: "ran and found no candidates" and "did not run" are different
    // facts, and only this row tells them apart. It is what moves the cronbeat
    // probe to healthy.
    const report = buildTickReport({
      selection: {
        selected: [],
        considered: plan.selection.considered,
        deduped: plan.selection.deduped,
        deferred: plan.selection.deferred,
      },
      tally,
      dedupDegraded: plan.dedupDegraded,
    });

    await step.run("tick-report", async () => {
      try {
        await recordLedgerEvent(ctx, {
          eventType: "decision",
          actionType: SHADOW_TICK_ACTION_TYPE,
          summary: formatTickSummary(report),
          autonomyLevel: SHADOW_TICK_AUTONOMY_LEVEL,
          requiresConfirmation: false,
          workspaceId: ctx.workspace.id,
          agentId: "venture_scorer",
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
        // A failed tick row leaves the cronbeat reading stale. That is the
        // honest outcome — the run happened but left no evidence, and a probe
        // reporting health from an unwritten tick would be worse.
      }
      return report;
    });

    return report;
  },
);
