// src/server/agents/engineering-agent.ts
//
// Sovereign Engineering Agent — generates portable IaC under Joris briefs.
// Never deploys autonomously: output is queued as a PENDING execution intent
// with Michael HQ telemetry for CEO approval in the Execution Theatre.

import "server-only";

import { buildAgentExecutionIntent } from "@/features/agents/execution-intent";
import { chooseModel } from "@/server/ai/model-router";
import { generateStructuredJson } from "@/server/ai/llm-json-provider";
import { createAgentExecutionIntent } from "@/server/agents/execution-intent-repository";
import { applyTelemetryToIntent } from "@/server/michael-hq/intent-telemetry";
import { recordLedgerEvent } from "@/server/actions/ledger-events";
import type { WorkspaceContext } from "@/core/workspace-context";
import { ENGINEERING_PACKAGE_DELIVER_TOOL_NAME } from "@/server/agents/tools/engineering-package-deliver";
import { logger } from "@/lib/logger";

export const ENGINEERING_AGENT_ID = "engineering";
export const ENGINEERING_SKILL_ID = "infrastructure.generate";

export type EngineeringBriefInput = {
  brief: string;
  missionId: string;
  client: string;
  email: string;
  modeId: string;
  ventureId?: string;
  autonomyLevel?: number;
};

export type EngineeringPackageArtifact = {
  packageId: string;
  title: string;
  brief: string;
  files: { path: string; content: string }[];
};

export type EngineeringProposalResult =
  | {
      ok: true;
      intentId: string;
      packageId: string;
      modelId: string;
      estimatedCostUsd: number;
      fileCount: number;
    }
  | { ok: false; error: string; errorCode: "llm_unavailable" | "generation_failed" | "queue_failed" };

const CODE_PACKAGE_SCHEMA_HINT = `Return JSON: {
  "title": string,
  "summary": string,
  "files": [{ "path": string, "content": string }]
}
Include at minimum: Dockerfile, docker-compose.yml, README.md, and either main.tf or deploy script.
All paths must be relative. No secrets in files — use env var placeholders.`;

export async function generateEngineeringPackage(
  brief: string,
  modeId: string,
): Promise<
  | { ok: true; artifact: EngineeringPackageArtifact; modelId: string; tokenUsage?: { input: number; output: number } }
  | { ok: false; error: string; errorCode: "llm_unavailable" | "generation_failed" }
> {
  const route = chooseModel({
    message: brief,
    highImpact: true,
    taskClass: "general",
    agentId: ENGINEERING_AGENT_ID,
  });

  const systemPrompt = [
    "You are the Sovereign Engineering Agent for Michael HQ.",
    "Generate portable Infrastructure-as-Code only — Docker, Terraform, or clone-ready repo files.",
    "Never include deployment credentials. Never assume a specific cloud vendor lock-in.",
    `Operating mode context (Vie/Travail isolation): ${modeId}`,
    CODE_PACKAGE_SCHEMA_HINT,
  ].join("\n");

  const llm = await generateStructuredJson({
    providerPreference: "auto",
    systemPrompt,
    userPrompt: brief,
    maxTokens: 4096,
    temperature: 0.2,
  });

  if (!llm.ok) {
    return {
      ok: false,
      error: llm.fallbackReason,
      errorCode: "llm_unavailable",
    };
  }

  const json = llm.json as {
    title?: string;
    summary?: string;
    files?: { path?: string; content?: string }[];
  };

  const files = (json.files ?? [])
    .filter((f): f is { path: string; content: string } =>
      typeof f.path === "string" && f.path.length > 0 && typeof f.content === "string",
    );

  if (files.length === 0) {
    return {
      ok: false,
      error: "LLM response did not include any valid files.",
      errorCode: "generation_failed",
    };
  }

  const packageId = `pkg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    ok: true,
    modelId: llm.modelId,
    tokenUsage: llm.tokenUsage,
    artifact: {
      packageId,
      title: json.title?.trim() || "Engineering package",
      brief: json.summary?.trim() || brief.slice(0, 500),
      files,
    },
  };
}

/**
 * Generate code from a Joris brief and queue a telemetry-enriched PENDING intent.
 */
export async function submitEngineeringProposal(
  ctx: WorkspaceContext,
  input: EngineeringBriefInput,
): Promise<EngineeringProposalResult> {
  const generated = await generateEngineeringPackage(input.brief, input.modeId);
  if (!generated.ok) {
    return generated;
  }

  const { artifact, modelId, tokenUsage } = generated;
  const createdAt = new Date().toISOString();
  const intentId = `intent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const basePayload = {
    agentId: ENGINEERING_AGENT_ID,
    skillId: ENGINEERING_SKILL_ID,
    client: input.client,
    email: input.email,
    actionType: "infrastructure.code_package",
    missionId: input.missionId,
    ...(input.ventureId ? { ventureId: input.ventureId } : {}),
    data: {
      intentId,
      packageId: artifact.packageId,
      title: artifact.title,
      brief: artifact.brief,
      modeId: input.modeId,
      files: artifact.files,
      exportTargets: ["download", "docker", "terraform", "github"] as const,
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
    agentId: ENGINEERING_AGENT_ID,
    skillId: ENGINEERING_SKILL_ID,
    toolName: ENGINEERING_PACKAGE_DELIVER_TOOL_NAME,
    autonomyLevel: input.autonomyLevel ?? 2,
    payload,
    createdAt,
  });

  try {
    await createAgentExecutionIntent(ctx.workspace.id, ctx.userId, intent);
  } catch (err) {
    logger.error("engineering-agent.queue.failed", {
      reason: err instanceof Error ? err.message : "unknown",
    });
    return { ok: false, error: "Failed to queue engineering intent.", errorCode: "queue_failed" };
  }

  await recordLedgerEvent(ctx, {
    eventType: "decision",
    actionType: ENGINEERING_SKILL_ID,
    summary: `Engineering package ${artifact.packageId} queued for CEO approval (${artifact.title}).`,
    autonomyLevel: input.autonomyLevel ?? 2,
    requiresConfirmation: true,
    workspaceId: ctx.workspace.id,
    skillId: ENGINEERING_SKILL_ID,
    agentId: ENGINEERING_AGENT_ID,
    missionId: input.missionId,
    actorId: ctx.userId,
    effect: { kind: "runtime_result", operation: "plan", target: "engineering_package" },
    metadata: {
      phase: "eligible_for_approval",
      intentId,
      packageId: artifact.packageId,
      modeId: input.modeId,
      estimatedCostUsd: telemetry.estimated_cost.totalUsd,
      modelId,
    },
  }).catch(() => void 0);

  return {
    ok: true,
    intentId,
    packageId: artifact.packageId,
    modelId,
    estimatedCostUsd: telemetry.estimated_cost.totalUsd,
    fileCount: artifact.files.length,
  };
}
