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

import type { SentinelleDecision } from "@/server/runtime/execution-guard";
import type { GovernedRefusal, McpToolResult } from "@/server/agents/tools/types";

export type ExecutionIntentApprovalDeps = {
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
  markFailed: (failureCode: string) => Promise<unknown>;
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
  | { ok: false; status: "refused"; error: string; httpStatus: 403; refusal: GovernedRefusal }
  | { ok: false; status: "executing"; outcome: "uncertain"; error: string; httpStatus: 502 }
  | { ok: true; status: "executed"; actionRef?: string; output?: Record<string, unknown> }
  | { ok: false; status: "blocked" | "failed" | "pending"; error: string; httpStatus: number }
  | {
      ok: false;
      status: "pending" | "executing";
      error: string;
      httpStatus: 500;
      reason: "ledger_unavailable";
      /** false = the conditional revert matched 0 rows; operator alert needed. */
      claimReverted: boolean;
    };

export async function approveAndDispatchExecutionIntent(
  deps: ExecutionIntentApprovalDeps,
): Promise<ExecutionIntentApprovalResult> {
  // Defense in depth: a hard BLOCK is the only verdict that stops an explicit
  // CEO approval (yellow REQUIRE_APPROVAL is satisfied by the CEO acting now).
  const sentinelle = deps.evaluate();
  if (sentinelle.outcome === "BLOCK") {
    await deps.recordResult(false, "blocked").catch(() => void 0);
    await deps.markFailed("SENTINELLE_BLOCK").catch(() => void 0);
    return { ok: false, status: "blocked", error: sentinelle.reason, httpStatus: 403 };
  }

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
    };
  }

  const result = await deps.dispatch();

  if (result.rateLimited) {
    await deps.recordResult(false, "rate_limited").catch(() => void 0);
    await deps.revertToPending().catch(() => void 0);
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
    await deps.markFailed(`GUARD_REFUSED:${refusal.ruleId}`);
    return { ok: false, status: "refused", error: refusal.reason, httpStatus: 403, refusal };
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

  await deps.recordResult(result.ok, result.ok ? "success" : "failed").catch(() => void 0);

  if (result.ok) {
    await deps.markExecuted(result.actionRef);
    return { ok: true, status: "executed", actionRef: result.actionRef, output: result.output };
  }

  await deps.markFailed("DISPATCH_FAILED");
  return {
    ok: false,
    status: "failed",
    error: result.error ?? "n8n dispatch failed.",
    httpStatus: 502,
  };
}
