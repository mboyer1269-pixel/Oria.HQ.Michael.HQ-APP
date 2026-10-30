import "server-only";
import { evaluateLiveExecution, guardGovernedAction, type GovernedAction } from "./execution-guard";
import { TOOL_GOVERNED_ACTIONS, buildIdempotencyKey } from "./governed-tool-dispatch";
import type { AdmissionInput, AdmissionReceipt, AdmissionPort } from "@/server/agents/execution-intent-admission-contract";
import type { McpToolResult } from "@/server/agents/tools/types";
import type { AgentExecutionIntentPayload } from "@/features/agents/execution-intent";

/** Separate from consume-at-dispatch legacy rail. The store's one-use fresh-ACK
 * ticket AND a current DB/ledger check are mandatory, not a structural decision
 * supplied by the caller. The last successful read is the revocation cut-off:
 * DB and an external network effect are NOT one transaction. */
export async function dispatchAdmittedTool(input: AdmissionInput, receipt: AdmissionReceipt, port: AdmissionPort,
  execute: (payload: AgentExecutionIntentPayload, options: { idempotencyKey: string }) => Promise<McpToolResult>,
  evaluate: typeof evaluateLiveExecution = evaluateLiveExecution): Promise<McpToolResult> {
  input = structuredClone(input); // Later caller edits cannot change bytes after DB validation.
  const s = input.source;
  if (!await port.takeCurrent(input, receipt)) return { ok: false, outcomeUncertain: true,
    error: "Admission cannot be revalidated. Do not resend; reconcile this attempt." };
  const live = evaluate({ agentId: s.agentId, skillId: s.skillId, autonomyLevel: s.autonomyLevel, requestedMode: "live" });
  if (live.outcome === "BLOCK") return { ok: false, error: "Current agent policy blocks this admitted attempt." };
  const action = Object.prototype.hasOwnProperty.call(TOOL_GOVERNED_ACTIONS, s.toolName) ? TOOL_GOVERNED_ACTIONS[s.toolName] : s.toolName;
  const verdict = guardGovernedAction({ agentId: s.agentId, action, payloadHash: input.payloadHash,
    approvedDecision: { status: "approved", action: action as GovernedAction, payloadHash: receipt.payloadHash,
      decisionId: receipt.decisionId, intentId: receipt.intentId } },
  () => execute(s.payload, { idempotencyKey: buildIdempotencyKey(s.workspaceId, s.intentId, input.payloadHash) }));
  if (!verdict.allowed) return { ok: false, error: verdict.reason,
    refusal: { verdict: verdict.verdict, ruleId: verdict.ruleId, ruleVersion: verdict.ruleVersion,
      reason: verdict.reason, action: verdict.action, intentId: s.intentId } };
  return await verdict.result;
}
