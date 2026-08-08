// src/server/agents/validation-agent.ts
//
// Validation Agent — mandatory demand-check before engineering budget.
// Generates TAM/SAM/SOM + acquisition channels as structured JSON, then queues
// a PENDING intent for CEO approval in the Execution Theatre.

import "server-only";

import { buildAgentExecutionIntent } from "@/features/agents/execution-intent";
import { chooseModel } from "@/server/ai/model-router";
import { generateStructuredJson } from "@/server/ai/llm-json-provider";
import { createAgentExecutionIntent } from "@/server/agents/execution-intent-repository";
import { applyTelemetryToIntent } from "@/server/michael-hq/intent-telemetry";
import { recordLedgerEvent } from "@/server/actions/ledger-events";
import type { WorkspaceContext } from "@/core/workspace-context";
import { VALIDATION_REPORT_DELIVER_TOOL_NAME } from "@/server/agents/tools/validation-report-deliver";
import {
  normalizeMarketReport,
  type NormalizedMarketReport,
} from "@/server/agents/validation-report-normalize";
import { logger } from "@/lib/logger";

export const VALIDATION_AGENT_ID = "validation";
export const VALIDATION_SKILL_ID = "market.demand_check";

export type ValidationBriefInput = {
  brief: string;
  missionId: string;
  client: string;
  email: string;
  modeId: string;
  ventureId?: string;
  autonomyLevel?: number;
};

export type ValidationReportArtifact = NormalizedMarketReport;

export type ValidationProposalResult =
  | {
      ok: true;
      intentId: string;
      reportId: string;
      modelId: string;
      estimatedCostUsd: number;
      demandVerdict: "proceed" | "iterate" | "kill";
    }
  | { ok: false; error: string; errorCode: "llm_unavailable" | "generation_failed" | "queue_failed" };

const MARKET_REPORT_SCHEMA_HINT = `Return JSON only:
{
  "title": string,
  "projectBrief": string,
  "marketSizing": {
    "tamUsd": number,
    "samUsd": number,
    "somUsd": number,
    "currency": "USD",
    "rationale": string
  },
  "acquisitionChannels": [
    { "channel": string, "fit": "high"|"medium"|"low", "notes": string }
  ],
  "demandVerdict": "proceed"|"iterate"|"kill",
  "evidenceSummary": string
}
Rules:
- Numbers must be numeric USD estimates (not strings).
- SOM ≤ SAM ≤ TAM.
- At least 2 acquisition channels.
- Base the analysis on the brief; do not invent customer names or fake citations.
- demandVerdict=proceed only when a credible beachhead + channel fit exist.`;

export { normalizeMarketReport } from "@/server/agents/validation-report-normalize";

export async function generateDemandCheckReport(
  brief: string,
  modeId: string,
): Promise<
  | {
      ok: true;
      artifact: ValidationReportArtifact;
      modelId: string;
      tokenUsage?: { input: number; output: number };
    }
  | { ok: false; error: string; errorCode: "llm_unavailable" | "generation_failed" }
> {
  chooseModel({
    message: brief,
    highImpact: true,
    taskClass: "client_audit",
    agentId: VALIDATION_AGENT_ID,
  });

  const systemPrompt = [
    "You are the Validation Agent for Michael HQ.",
    "Your job is a demand-check BEFORE any engineering budget is allocated.",
    "Produce evidence-based TAM/SAM/SOM estimates and acquisition channels.",
    "Never recommend building without a credible beachhead.",
    `Operating mode context (Vie/Travail isolation): ${modeId}`,
    MARKET_REPORT_SCHEMA_HINT,
  ].join("\n");

  const llm = await generateStructuredJson({
    providerPreference: "auto",
    systemPrompt,
    userPrompt: brief,
    maxTokens: 2500,
    temperature: 0.2,
  });

  if (!llm.ok) {
    return { ok: false, error: llm.fallbackReason, errorCode: "llm_unavailable" };
  }

  const artifact = normalizeMarketReport(llm.json, brief);
  if (!artifact) {
    return {
      ok: false,
      error: "LLM response was not a valid demand-check JSON report.",
      errorCode: "generation_failed",
    };
  }

  return {
    ok: true,
    artifact,
    modelId: llm.modelId,
    tokenUsage: llm.tokenUsage,
  };
}

/**
 * Run demand-check and queue a telemetry-enriched PENDING intent for CEO review.
 */
export async function submitValidationProposal(
  ctx: WorkspaceContext,
  input: ValidationBriefInput,
): Promise<ValidationProposalResult> {
  const generated = await generateDemandCheckReport(input.brief, input.modeId);
  if (!generated.ok) return generated;

  const { artifact, modelId, tokenUsage } = generated;
  const createdAt = new Date().toISOString();
  const intentId = `intent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const basePayload = {
    agentId: VALIDATION_AGENT_ID,
    skillId: VALIDATION_SKILL_ID,
    client: input.client,
    email: input.email,
    actionType: "market.demand_check",
    missionId: input.missionId,
    ...(input.ventureId ? { ventureId: input.ventureId } : {}),
    data: {
      intentId,
      reportId: artifact.reportId,
      title: artifact.title,
      projectBrief: artifact.projectBrief,
      modeId: input.modeId,
      marketSizing: artifact.marketSizing,
      acquisitionChannels: artifact.acquisitionChannels,
      demandVerdict: artifact.demandVerdict,
      evidenceSummary: artifact.evidenceSummary,
    },
  };

  const { payload, telemetry } = applyTelemetryToIntent({
    payload: basePayload,
    tokenUsage: tokenUsage
      ? { modelId, inputTokens: tokenUsage.input, outputTokens: tokenUsage.output }
      : { modelId, inputTokens: 0, outputTokens: 0 },
    estimationHint: input.brief,
    modelId,
  });

  const intent = buildAgentExecutionIntent({
    intentId,
    workspaceId: ctx.workspace.id,
    agentId: VALIDATION_AGENT_ID,
    skillId: VALIDATION_SKILL_ID,
    toolName: VALIDATION_REPORT_DELIVER_TOOL_NAME,
    autonomyLevel: input.autonomyLevel ?? 2,
    payload,
    createdAt,
  });

  try {
    await createAgentExecutionIntent(ctx.workspace.id, ctx.userId, intent);
  } catch (err) {
    logger.error("validation-agent.queue.failed", {
      reason: err instanceof Error ? err.message : "unknown",
    });
    return { ok: false, error: "Failed to queue validation intent.", errorCode: "queue_failed" };
  }

  await recordLedgerEvent(ctx, {
    eventType: "decision",
    actionType: VALIDATION_SKILL_ID,
    summary: `Demand-check ${artifact.reportId} queued for CEO approval (${artifact.demandVerdict}).`,
    autonomyLevel: input.autonomyLevel ?? 2,
    requiresConfirmation: true,
    workspaceId: ctx.workspace.id,
    skillId: VALIDATION_SKILL_ID,
    agentId: VALIDATION_AGENT_ID,
    missionId: input.missionId,
    actorId: ctx.userId,
    effect: { kind: "runtime_result", operation: "plan", target: "validation_report" },
    metadata: {
      phase: "eligible_for_approval",
      intentId,
      reportId: artifact.reportId,
      modeId: input.modeId,
      demandVerdict: artifact.demandVerdict,
      estimatedCostUsd: telemetry.estimated_cost.totalUsd,
      modelId,
    },
  }).catch(() => void 0);

  return {
    ok: true,
    intentId,
    reportId: artifact.reportId,
    modelId,
    estimatedCostUsd: telemetry.estimated_cost.totalUsd,
    demandVerdict: artifact.demandVerdict,
  };
}
