// MCP tool: engineering_package_deliver
//
// CEO-approved delivery path for the Sovereign Engineering Agent.
// Does NOT deploy autonomously — materializes a portable code package into the
// infrastructure store for download / export to the owner's GitHub or cloud.

import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  saveInfrastructurePackage,
  type EngineeringPackageFile,
} from "@/server/agents/engineering-package-store";
import { extractEstimatedCostFromIntentData } from "@/server/michael-hq/telemetry-extract";
import type { McpTool, McpToolContext, McpToolResult } from "./types";

export const ENGINEERING_PACKAGE_DELIVER_TOOL_NAME = "engineering_package_deliver";

const fileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

export const engineeringPackagePayloadSchema = z
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
        packageId: z.string().min(1),
        title: z.string().min(1),
        brief: z.string().min(1),
        modeId: z.string().min(1),
        files: z.array(fileSchema).min(1),
        exportTargets: z
          .array(z.enum(["download", "github", "terraform", "docker"]))
          .default(["download", "docker", "terraform"]),
      })
      .passthrough(),
  })
  .strict();

export type EngineeringPackagePayload = z.infer<typeof engineeringPackagePayloadSchema>;

async function deliverEngineeringPackage(
  rawInput: unknown,
  ctx: McpToolContext,
): Promise<McpToolResult> {
  const parsed = engineeringPackagePayloadSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "Invalid engineering_package_deliver payload." };
  }

  const input = parsed.data;
  const actionRef = `eng_pkg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const data = input.data as Record<string, unknown> & {
    intentId: string;
    packageId: string;
    title: string;
    brief: string;
    modeId: string;
    files: EngineeringPackageFile[];
    exportTargets: ("download" | "github" | "terraform" | "docker")[];
  };

  const pkg = saveInfrastructurePackage({
    packageId: data.packageId,
    workspaceId: ctx.workspaceId,
    modeId: data.modeId,
    intentId: data.intentId,
    agentId: input.agentId,
    title: data.title,
    brief: data.brief,
    files: data.files,
    createdAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    estimatedCost: extractEstimatedCostFromIntentData(data),
    exportTargets: data.exportTargets,
  });

  logger.info("mcp.engineering_package_deliver.saved", {
    workspaceId: ctx.workspaceId,
    packageId: pkg.packageId,
    fileCount: pkg.files.length,
  });

  return {
    ok: true,
    actionRef,
    output: {
      packageId: pkg.packageId,
      fileCount: pkg.files.length,
      exportTargets: pkg.exportTargets,
      delivery: "infrastructure_store",
    },
  };
}

export const engineeringPackageDeliverTool: McpTool = {
  name: ENGINEERING_PACKAGE_DELIVER_TOOL_NAME,
  description:
    "Materialize a CEO-approved engineering code package into the infrastructure store. " +
    "No autonomous deployment — owner downloads or exports to their own GitHub/cloud.",
  inputSchema: engineeringPackagePayloadSchema,
  handler: deliverEngineeringPackage,
};
