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
import type { McpToolResult } from "@/server/agents/tools";

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
  recordResult: (ok: boolean, phase: "success" | "failed" | "blocked" | "rate_limited") => Promise<unknown>;
  /** executing -> executed (carries the dispatch reference). */
  markExecuted: (actionRef?: string) => Promise<unknown>;
  /** executing -> failed (carries a coarse failure code). */
  markFailed: (failureCode: string) => Promise<unknown>;
  /** executing -> pending (retryable after a transient rate-limit). */
  revertToPending: () => Promise<unknown>;
};

export type ExecutionIntentApprovalResult =
  | { ok: true; status: "executed"; actionRef?: string; output?: Record<string, unknown> }
  | { ok: false; status: "blocked" | "failed" | "pending"; error: string; httpStatus: number };

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
  await deps.recordAttempt();

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
