// src/server/jobs/shadow-score-cron.ts
//
// V7 Phase 1 step 4c-2 — the shadow mode trigger.
//
// Orchestration lives in runShadowPass, shared with the manual trigger. This
// file supplies the two things that make a scheduled run different from a
// hand-triggered one:
//
//   * Inngest's step.run for isolation — a venture that fails does not take the
//     batch with it, and a redeploy resumes mid-run rather than restarting.
//   * SHADOW_TICK_ACTION_TYPE, the event the cronbeat probe watches.
//
// It never mints a proposalId. That belongs to the domain, where
// buildVentureScoreProposal constructs it — two authorities over one key would
// make the pairing unprovable, and the pairing is the only thing shadow mode
// produces.

import { inngest } from "./inngest-client";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { runShadowPass } from "@/server/ventures/shadow-pass";
import type { StepRunner } from "@/server/ventures/shadow-pass";
import { SHADOW_TICK_ACTION_TYPE } from "@/server/ventures/venture-score-shadow-runner";

/** Daily, off-peak. A venture's state does not change hourly. */
export const SHADOW_CRON_SCHEDULE = "0 7 * * *";

export const shadowScoreCron = inngest.createFunction(
  {
    id: "shadow-score-cron",
    name: "Shadow mode — daily venture score proposals",
    // No retries. A retried tick would re-propose for ventures the first
    // attempt already handled; deduplication guards that, but a tick is cheap
    // to miss and expensive to double. Tomorrow's run picks up the work.
    retries: 0,
  },
  { cron: SHADOW_CRON_SCHEDULE },
  async ({ step }) => {
    const ctx = getActiveWorkspaceContext();

    return runShadowPass(ctx, {
      // The one place two type systems meet. Inngest describes a step result
      // with its own Jsonify<T>; runShadowPass describes the same round-trip
      // with StepResult<T>. They agree on every shape that actually crosses
      // this boundary — primitives, arrays and plain objects, enforced by
      // construction in runShadowPass — but TypeScript cannot prove that
      // generically, so the equivalence is asserted here rather than smeared
      // through the shared module.
      runStep: ((id: string, fn: () => Promise<unknown>) =>
        step.run(id, fn)) as StepRunner,
      tickActionType: SHADOW_TICK_ACTION_TYPE,
    });
  },
);
