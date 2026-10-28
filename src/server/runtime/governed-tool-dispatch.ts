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
import type { McpToolResult } from "@/server/agents/tools/types";
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
};

export type GovernedToolDispatchDeps = {
  loadIntent?: typeof getAgentExecutionIntent;
};

export async function dispatchGovernedTool(
  input: GovernedToolDispatchInput,
  execute: (payload: AgentExecutionIntentPayload) => Promise<McpToolResult>,
  deps: GovernedToolDispatchDeps = {},
): Promise<McpToolResult> {
  // Only these fields are read; anything else a caller passes (e.g. an
  // approvedDecision) is ignored by construction.
  const { workspaceId, intentId, toolName, agentId, payload } = input;
  const action: string = Object.prototype.hasOwnProperty.call(TOOL_GOVERNED_ACTIONS, toolName)
    ? TOOL_GOVERNED_ACTIONS[toolName]
    : toolName;

  let approvedDecision: ApprovedDecision | undefined;
  try {
    const stored = await (deps.loadIntent ?? getAgentExecutionIntent)(workspaceId, intentId);
    if (
      stored &&
      stored.status === "executing" &&
      stored.toolName === toolName &&
      stored.agentId === agentId
    ) {
      approvedDecision = {
        status: "approved",
        action: action as GovernedAction,
        payloadHash: hashExecutionIntentPayload(stored.payload),
      };
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
    () => execute(payload),
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
