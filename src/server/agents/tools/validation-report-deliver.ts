// MCP tool: validation_report_deliver
//
// CEO-approved delivery for the Validation Agent. Stores the demand-check
// report — never starts engineering autonomously.

import { z } from "zod";
import { logger } from "@/lib/logger";
import { saveValidationReport } from "@/server/agents/validation-report-store";
import { extractEstimatedCostFromIntentData } from "@/server/michael-hq/telemetry-extract";
import type { McpTool, McpToolContext, McpToolResult } from "./types";

export const VALIDATION_REPORT_DELIVER_TOOL_NAME = "validation_report_deliver";

const channelSchema = z.object({
  channel: z.string().min(1),
  fit: z.enum(["high", "medium", "low"]),
  notes: z.string(),
});

const sizingSchema = z.object({
  tamUsd: z.number().nonnegative(),
  samUsd: z.number().nonnegative(),
  somUsd: z.number().nonnegative(),
  currency: z.literal("USD").default("USD"),
  rationale: z.string().min(1),
});

export const validationReportPayloadSchema = z
  .object({
    agentId: z.string().min(1),
    skillId: z.string().min(1),
    client: z.string().min(1),
    email: z.string().email(),
    actionType: z.string().min(1),
    missionId: z.string().min(1),
    ventureId: z.string().min(1).optional(),
    data: z
      .object({
        intentId: z.string().min(1),
        reportId: z.string().min(1),
        title: z.string().min(1),
        projectBrief: z.string().min(1),
        modeId: z.string().min(1),
        marketSizing: sizingSchema,
        acquisitionChannels: z.array(channelSchema).min(1),
        demandVerdict: z.enum(["proceed", "iterate", "kill"]),
        evidenceSummary: z.string().min(1),
      })
      .passthrough(),
  })
  .strict();

async function deliverValidationReport(
  rawInput: unknown,
  ctx: McpToolContext,
): Promise<McpToolResult> {
  const parsed = validationReportPayloadSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "Invalid validation_report_deliver payload." };
  }

  const input = parsed.data;
  const data = input.data;
  const actionRef = `val_rpt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const report = saveValidationReport({
    reportId: data.reportId,
    workspaceId: ctx.workspaceId,
    modeId: data.modeId,
    intentId: data.intentId,
    agentId: input.agentId,
    title: data.title,
    projectBrief: data.projectBrief,
    marketSizing: {
      ...data.marketSizing,
      currency: "USD",
    },
    acquisitionChannels: data.acquisitionChannels,
    demandVerdict: data.demandVerdict,
    evidenceSummary: data.evidenceSummary,
    createdAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    estimatedCost: extractEstimatedCostFromIntentData(data as Record<string, unknown>),
  });

  logger.info("mcp.validation_report_deliver.saved", {
    workspaceId: ctx.workspaceId,
    reportId: report.reportId,
    verdict: report.demandVerdict,
  });

  return {
    ok: true,
    actionRef,
    output: {
      reportId: report.reportId,
      demandVerdict: report.demandVerdict,
      delivery: "validation_report_store",
      nextGate: "engineering_budget_allocation",
    },
  };
}

export const validationReportDeliverTool: McpTool = {
  name: VALIDATION_REPORT_DELIVER_TOOL_NAME,
  description:
    "Persist a CEO-approved market validation (demand-check) report. " +
    "Does not start engineering — budget allocation remains a separate CEO decision.",
  inputSchema: validationReportPayloadSchema,
  handler: deliverValidationReport,
};
