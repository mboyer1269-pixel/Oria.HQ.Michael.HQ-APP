import "server-only";

// G1 wiring — every MCP tool dispatch from the execution-intent rail passes
// through guardGovernedAction. The approval is NEVER taken from the caller: it
// is read server-side from the G2 execution-intent repository (the intent row
// claimed pending→executing by the owner-approved route). The payload hash is
// recomputed from the payload actually handed to the tool, and compared with
// the hash of the stored row. Anything else fails closed.

import { getAgentExecutionIntent } from "@/server/agents/execution-intent-repository";
import { hashExecutionIntentPayload } from "@/server/agents/execution-intent-payload-hash";
import type { AgentExecutionIntentPayload } from "@/features/agents/execution-intent";
import type { GovernedRefusal, McpToolResult } from "@/server/agents/tools/types";
import {
  guardGovernedAction,
  type ApprovedDecision,
  type GovernedAction,
} from "@/server/runtime/execution-guard";

/** Tool → governed action. Unlisted tools are refused (R-RISK-ROUND-UP). */
export const TOOL_GOVERNED_ACTIONS: Readonly<Record<string, GovernedAction>> = {
  n8n_webhook_trigger: "external_contact",
  // Materialize / persist a CEO-approved artifact: treated as a publish step.
  engineering_package_deliver: "deploy",
  validation_report_deliver: "deploy",
};

export type GovernedToolDispatchInput = {
  workspaceId: string;
  intentId: string;
  toolName: string;
  agentId: string;
  payload: AgentExecutionIntentPayload;
  /** The `attempt:<uuid>` token this request wrote at the pending→executing claim. */
  attemptToken?: string;
};

/** Stable provider-facing key: same intent + same approved payload ⇒ same key. */
export function buildIdempotencyKey(workspaceId: string, intentId: string, payloadHash: string): string {
  return `oria1:${workspaceId}:${intentId}:${payloadHash}`;
}

export type GovernedToolExecuteOptions = { idempotencyKey: string };

export type GovernedToolDispatchDeps = {
  loadIntent?: typeof getAgentExecutionIntent;
};

export async function dispatchGovernedTool(
  input: GovernedToolDispatchInput,
  execute: (payload: AgentExecutionIntentPayload, options: GovernedToolExecuteOptions) => Promise<McpToolResult>,
  deps: GovernedToolDispatchDeps = {},
): Promise<McpToolResult> {
  // Only these fields are read; anything else a caller passes (e.g. an
  // approvedDecision) is ignored by construction.
  const { workspaceId, intentId, toolName, agentId, payload, attemptToken } = input;
  const action: string = Object.prototype.hasOwnProperty.call(TOOL_GOVERNED_ACTIONS, toolName)
    ? TOOL_GOVERNED_ACTIONS[toolName]
    : toolName;

  let approvedDecision: ApprovedDecision | undefined;
  let idempotencyKey = "";
  try {
    const stored = await (deps.loadIntent ?? getAgentExecutionIntent)(workspaceId, intentId);
    if (
      stored &&
      stored.status === "executing" &&
      stored.toolName === toolName &&
      stored.agentId === agentId &&
      // Single use: only the attempt that holds the claim may dispatch. A token
      // from another attempt, or another intent's claim, is no approval here.
      typeof attemptToken === "string" &&
      attemptToken.startsWith("attempt:") &&
      stored.actionRef === attemptToken
    ) {
      const storedHash = hashExecutionIntentPayload(stored.payload);
      approvedDecision = {
        status: "approved",
        action: action as GovernedAction,
        payloadHash: storedHash,
      };
      idempotencyKey = buildIdempotencyKey(workspaceId, intentId, storedHash);
    }
  } catch {
    approvedDecision = undefined; // repository failure → no approval → refused
  }

  let payloadHash: string;
  try {
    payloadHash = hashExecutionIntentPayload(payload);
  } catch {
    payloadHash = "";
  }

  const verdict = guardGovernedAction(
    { agentId, action, payloadHash, approvedDecision },
    () => execute(payload, { idempotencyKey }),
  );
  if (!verdict.allowed) {
    return {
      ok: false,
      error: `Refused by execution guard (${verdict.ruleId}): ${verdict.reason}`,
      output: { ruleId: verdict.ruleId, refused: true },
      refusal: {
        verdict: verdict.verdict,
        ruleId: verdict.ruleId,
        ruleVersion: verdict.ruleVersion,
        reason: verdict.reason,
        action: verdict.action,
        intentId,
      },
    };
  }
  return await verdict.result;
}

/**
 * Lot 2 — ADVISORY precheck, run before the claim. Pure: no I/O, no effect,
 * grants nothing. Evaluates the same guard as dispatch under the assumption
 * that the approval being given right now matches this exact payload; so it
 * only catches refusals that no approval could lift (unknown/unmapped tool,
 * unhashable payload). Returns null when the action may proceed to the claim.
 *
 * dispatchGovernedTool remains the BINDING check after the claim: it re-reads
 * the real intent row, recomputes the payload hash and re-applies the policy
 * current at that moment.
 */
export function precheckGovernedTool(input: {
  intentId: string;
  toolName: string;
  payload: AgentExecutionIntentPayload;
}): GovernedRefusal | null {
  const { intentId, toolName, payload } = input;
  const action: string = Object.prototype.hasOwnProperty.call(TOOL_GOVERNED_ACTIONS, toolName)
    ? TOOL_GOVERNED_ACTIONS[toolName]
    : toolName;
  let payloadHash = "";
  try {
    payloadHash = hashExecutionIntentPayload(payload);
  } catch {
    payloadHash = "";
  }
  const verdict = guardGovernedAction(
    {
      agentId: payload.agentId,
      action,
      payloadHash,
      approvedDecision: { status: "approved", action, payloadHash: payloadHash || "unhashable" },
    },
    () => undefined,
  );
  if (verdict.allowed) return null;
  return {
    verdict: verdict.verdict,
    ruleId: verdict.ruleId,
    ruleVersion: verdict.ruleVersion,
    reason: verdict.reason,
    action: verdict.action,
    intentId,
  };
}
