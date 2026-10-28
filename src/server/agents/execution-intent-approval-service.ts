// Execution-intent approval orchestration.
//
// The dependency-injected core of the CEO manual-approval path. It encodes the
// exact, auditable sequence the mandate requires and nothing else:
//
//   Sentinelle re-check (BLOCK => stop) -> mark executing -> Ledger (attempt,
//   BEFORE the call) -> dispatch via MCP tool -> Ledger (result) -> update
//   status (executed | failed). A rate-limited dispatch reverts to pending so
//   the CEO can retry.
//
// Like green-lane-execution-service, all side effects are injected so the route
// wires real deps and tests inject spies -- no Supabase, ledger, or network
// here.

import { logger } from "@/lib/logger";
import type { SentinelleDecision } from "@/server/runtime/execution-guard";
import type { GovernedRefusal, McpToolResult } from "@/server/agents/tools/types";

export type ExecutionIntentApprovalDeps = {
  /**
   * Advisory guard precheck BEFORE the claim (pure, no effect). A refusal here
   * leaves the intent pending. Not binding: dispatch re-checks after the claim.
   */
  precheck?: () => GovernedRefusal | null;
  /** Re-evaluate the Sentinelle policy at approval time (defense in depth). */
  evaluate: () => SentinelleDecision;
  /** pending -> executing. */
  markExecuting: () => Promise<unknown>;
  /** Ledger entry recorded BEFORE the dispatch. */
  recordAttempt: () => Promise<unknown>;
  /** Invoke the MCP tool (the single n8n chokepoint). */
  dispatch: () => Promise<McpToolResult>;
  /** Ledger entry recorded AFTER the dispatch. */
  recordResult: (
    ok: boolean,
    phase: ExecutionResultPhase,
    details?: { refusal?: GovernedRefusal },
  ) => Promise<unknown>;
  /** executing -> executed (carries the dispatch reference). */
  markExecuted: (actionRef?: string) => Promise<unknown>;
  /** executing -> failed (carries a coarse failure code). */
  markFailed: (failureCode: string, fromStatus?: "pending" | "executing") => Promise<unknown>;
  /** executing -> pending (retryable after a transient rate-limit). */
  revertToPending: () => Promise<unknown>;
  /**
   * Compensation when the attempt Ledger write fails after the claim:
   * CONDITIONAL executing -> pending (same id + workspace, still executing).
   * Throws if it matched zero rows.
   */
  revertClaim: () => Promise<unknown>;
};

/**
 * Three distinct outcome classes after the claim:
 *  - refused   : policy refusal by the guard; no external effect (GUARD_REFUSED:<ruleId>)
 *  - failed    : technical failure, provider answered or never reached
 *  - uncertain : request may have reached the provider; NOT failed, NOT resent
 */
export type ExecutionResultPhase = "success" | "failed" | "blocked" | "rate_limited" | "refused" | "uncertain";

export type ExecutionIntentApprovalResult =
  | {
      ok: false;
      status: "refused";
      /** precheck: before the claim, intent still pending. dispatch: after the claim, intent failed. */
      stage: "precheck" | "dispatch";
      error: string;
      httpStatus: 403;
      refusal: GovernedRefusal;
    }
  | { ok: false; status: "executing"; outcome: "uncertain"; error: string; httpStatus: 502 }
  | {
      /** Dispatch reported success but the executed transition was not stored. Not retryable. */
      ok: false;
      status: "executing";
      outcome: "dispatched_unconfirmed";
      actionRef?: string;
      error: string;
      httpStatus: 202;
    }
  | {
      /** Dispatch failed but the failed transition was not stored. State unconfirmed. */
      ok: false;
      status: "executing";
      outcome: "failed_unrecorded";
      error: string;
      httpStatus: 503;
    }
  | { ok: true; status: "executed"; actionRef?: string; output?: Record<string, unknown> }
  | { ok: false; status: "blocked" | "failed" | "pending"; error: string; httpStatus: number }
  | {
      /** Rate-limited revert matched 0 rows (row no longer executing/same payload). */
      ok: false;
      status: "executing";
      error: string;
      httpStatus: 409;
      reason: "revert_conflict";
    }
  | {
      ok: false;
      status: "pending" | "executing";
      error: string;
      httpStatus: 500;
      reason: "ledger_unavailable";
      /** false = the conditional revert matched 0 rows; operator alert needed. */
      claimReverted: boolean;
      revert: "reverted" | "revert_conflict";
    };

export async function approveAndDispatchExecutionIntent(
  deps: ExecutionIntentApprovalDeps,
): Promise<ExecutionIntentApprovalResult> {
  // Defense in depth: a hard BLOCK is the only verdict that stops an explicit
  // CEO approval (yellow REQUIRE_APPROVAL is satisfied by the CEO acting now).
  const sentinelle = deps.evaluate();
  if (sentinelle.outcome === "BLOCK") {
    await deps.recordResult(false, "blocked").catch(() => void 0);
    await deps.markFailed("SENTINELLE_BLOCK", "pending").catch(() => void 0);
    return { ok: false, status: "blocked", error: sentinelle.reason, httpStatus: 403 };
  }

  const pre = deps.precheck?.() ?? null;
  if (pre) {
    // Nothing claimed, nothing dispatched: the intent stays pending.
    await deps.recordResult(false, "refused", { refusal: pre }).catch(() => void 0);
    return { ok: false, status: "refused", stage: "precheck", error: pre.reason, httpStatus: 403, refusal: pre };
  }

  // Executable point: this conditional pending->executing claim (bound to the
  // verified payload). Before it, reject/edit revokes. After it, no revocation.
  await deps.markExecuting();
  // No dispatch may start without a recorded attempt. If the Ledger write
  // fails, undo the claim conditionally and stop.
  try {
    await deps.recordAttempt();
  } catch {
    const claimReverted = await deps.revertClaim().then(
      () => true,
      () => false,
    );
    return {
      ok: false,
      status: claimReverted ? "pending" : "executing",
      error: "Ledger unavailable; execution intent was not dispatched.",
      httpStatus: 500,
      reason: "ledger_unavailable",
      claimReverted,
      revert: claimReverted ? "reverted" : "revert_conflict",
    };
  }

  let result: McpToolResult;
  try {
    result = await deps.dispatch();
  } catch (err) {
    // A throw after the attempt was recorded: the effect may or may not have
    // happened. Same handling as an uncertain result: no markFailed, no
    // revert, no resend.
    result = {
      ok: false,
      outcomeUncertain: true,
      error: err instanceof Error ? err.message : "Dispatch threw; external result unknown.",
    };
  }

  if (result.rateLimited) {
    await deps.recordResult(false, "rate_limited").catch(() => void 0);
    // Conditional revert (executing + same payload only). Zero rows updated is
    // an error that surfaces: a terminal row must never go back to pending.
    try {
      await deps.revertToPending();
    } catch (err) {
      logger.error("agent.execution-intent.revert_to_pending.failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        ok: false,
        status: "executing",
        error: "Rate-limited, but the intent could not be safely returned to pending; not re-dispatchable.",
        httpStatus: 409,
        reason: "revert_conflict",
      };
    }
    return {
      ok: false,
      status: "pending",
      error: result.error ?? "n8n dispatch rate limit exceeded.",
      httpStatus: 429,
    };
  }

  if (result.refusal) {
    const refusal = result.refusal;
    await deps.recordResult(false, "refused", { refusal }).catch(() => void 0);
    // The refusal (403 + ruleId) stands even if the terminal write fails.
    await deps.markFailed(`GUARD_REFUSED:${refusal.ruleId}`).catch((err: unknown) => {
      logger.error("agent.execution-intent.mark_failed_after_refusal.failed", {
        ruleId: refusal.ruleId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    return { ok: false, status: "refused", stage: "dispatch", error: refusal.reason, httpStatus: 403, refusal };
  }

  if (!result.ok && result.outcomeUncertain) {
    // Leave the claim in `executing`: no markFailed, no revert, no resend.
    // Reconciliation/recovery is lot 3.
    await deps.recordResult(false, "uncertain").catch(() => void 0);
    return {
      ok: false,
      status: "executing",
      outcome: "uncertain",
      error: result.error ?? "External result unknown.",
      httpStatus: 502,
    };
  }

  await deps.recordResult(result.ok, result.ok ? "success" : "failed").catch((err: unknown) => {
    // Outcome unchanged; the missing Ledger result needs an operator alert.
    logger.error("agent.execution-intent.ledger_result.failed", {
      phase: result.ok ? "success" : "failed",
      error: err instanceof Error ? err.message : String(err),
    });
  });

  if (result.ok) {
    try {
      await deps.markExecuted(result.actionRef);
    } catch (err) {
      // The effect already happened: never report a retryable failure.
      logger.error("agent.execution-intent.approve.mark_executed_failed", {
        alert: true,
        actionRef: result.actionRef,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        ok: false,
        status: "executing",
        outcome: "dispatched_unconfirmed",
        ...(result.actionRef ? { actionRef: result.actionRef } : {}),
        error: "Dispatched, but the executed state was not recorded. Do not retry; reconcile.",
        httpStatus: 202,
      };
    }
    return { ok: true, status: "executed", actionRef: result.actionRef, output: result.output };
  }

  try {
    await deps.markFailed("DISPATCH_FAILED");
  } catch (err) {
    logger.error("agent.execution-intent.approve.mark_failed_after_dispatch.failed", {
      alert: true,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      status: "executing",
      outcome: "failed_unrecorded",
      error: result.error ?? "n8n dispatch failed; failed state not recorded.",
      httpStatus: 503,
    };
  }
  return {
    ok: false,
    status: "failed",
    error: result.error ?? "n8n dispatch failed.",
    httpStatus: 502,
  };
}
