// src/features/agents/execution-intent-reject.ts
//
// Pure decision for the CEO rejection of an execution intent. Mirrors the
// approve route's guard (load -> 404 if absent -> 409 if not pending) but as a
// dependency-free function so the branches are unit-testable without an HTTP
// harness. The rejection itself is a terminal status transition (pending ->
// failed) carrying CEO_REJECTED; no new status is introduced.

import type { AgentExecutionIntent, AgentExecutionIntentStatus } from "@/features/agents/execution-intent";

/** Coarse failure code stamped on an intent the CEO rejects. */
export const EXECUTION_INTENT_REJECT_FAILURE_CODE = "CEO_REJECTED";

export type ExecutionIntentRejectionDecision =
  | { kind: "not_found" }
  | { kind: "conflict"; status: AgentExecutionIntentStatus }
  | { kind: "ok"; intent: AgentExecutionIntent };

/**
 * Decides whether an intent can be rejected:
 *   - absent          -> not_found (404)
 *   - non-pending     -> conflict (409), carries the current status
 *   - pending         -> ok, narrows the intent for the caller
 */
export function resolveExecutionIntentRejection(
  intent: AgentExecutionIntent | null,
): ExecutionIntentRejectionDecision {
  if (!intent) return { kind: "not_found" };
  if (intent.status !== "pending") return { kind: "conflict", status: intent.status };
  return { kind: "ok", intent };
}
