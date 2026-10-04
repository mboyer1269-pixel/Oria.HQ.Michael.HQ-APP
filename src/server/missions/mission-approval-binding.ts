import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { launchBindingSchema, type LaunchConfig } from "@/core/openhands-launch-contract";
import type { ApprovedServerBinding } from "@/server/ai/server-capability-catalog";
import type { Mission } from "@/core/types";

/** Reuses the execution binding (including budget, source and image) and the
 * same account/model tuple used by the emission gate. No credentials. */
export const missionApprovalBindingSchema = z.object({
  version: z.literal(1),
  missionVersion: z.iso.datetime({ offset: true }),
  launch: launchBindingSchema,
  access: z.object({
    workspaceId: z.string().min(1).max(160), accountId: z.string().min(1).max(160),
    modelId: z.string().min(1).max(200), providerId: z.string().min(1).max(160),
    billingKind: z.literal("subscription"), catalogRevision: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
}).strict();
export type MissionApprovalBinding = z.infer<typeof missionApprovalBindingSchema>;
export type MissionApprovedAccess = ApprovedServerBinding & { providerId: string };

export function missionApprovalReviewHash(binding: MissionApprovalBinding, previousApprovalId: string | null) {
  return createHash("sha256").update(JSON.stringify([binding, previousApprovalId])).digest("hex");
}

export function missionApprovalBindingMatches(raw: unknown, mission: Mission, config: LaunchConfig,
  expectedLaunchHash: string, access: MissionApprovedAccess): boolean {
  const parsed = missionApprovalBindingSchema.safeParse(raw);
  if (!parsed.success) return false;
  const binding = parsed.data;
  return binding.missionVersion === mission.updatedAt && binding.launch.workspaceId === mission.workspaceId
    && binding.launch.missionId === mission.id && binding.launch.launchHash === expectedLaunchHash
    && isDeepStrictEqual(binding.launch.config, config) && isDeepStrictEqual(binding.access, access);
}
