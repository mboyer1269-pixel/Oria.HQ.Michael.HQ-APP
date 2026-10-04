import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createOpenHandsLaunchStore } from "./openhands-launch-store";
import { launchBinding, type LaunchStore } from "./openhands-launch";
import { getMissionApprovalRecord, commitMissionApprovalDecision } from "./approval-record-repository";
import type { MissionApprovalRecord } from "./approval-record";
import { DEFAULT_EXECUTOR_PROVIDER_REGISTRY, createDefaultConnectionProbe, defaultLoadLaunchConfig, resolveExecutorProviderBinding } from "./model-emission-launch-gate";
import { resolveProviderConnectionDiscovery, isExecutionReady, type ProviderConnectionProbe } from "../agents/models/provider-connection-discovery";
import { missionApprovalBindingSchema, missionApprovalReviewHash } from "./mission-approval-binding";
import type { LaunchConfig } from "@/core/openhands-launch-contract";
import type { Mission } from "@/core/types";

const base = { missionId: z.uuid() };
export const missionApprovalRequestSchema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("prepare") }).strict(),
  z.object({ ...base, action: z.enum(["approve", "reject"]), expectedReviewHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ ...base, action: z.literal("revoke"), expectedApprovalId: z.uuid() }).strict(),
]);
export type MissionApprovalRequest = z.infer<typeof missionApprovalRequestSchema>;
export type ApprovalDecisionCommit = (mission: Mission, previousId: string | null, record: MissionApprovalRecord) => Promise<boolean>;

/** An owner decision only. Never emits to a model or launches an executor. */
export function createMissionApprovalService(deps: {
  store?: () => LaunchStore | null; loadRecord?: typeof getMissionApprovalRecord;
  commit?: ApprovalDecisionCommit; configuration?: () => LaunchConfig | null;
  probe?: ProviderConnectionProbe; now?: () => number;
} = {}) {
  return async (context: { workspaceId: string; actorId: string }, raw: unknown) => {
    let previousDecision: { id: string; status: string; expiresAt?: string } | null = null;
    const closed = (status: string) => ({ status, externalEffectAllowed: false as const, previousDecision });
    const request = missionApprovalRequestSchema.safeParse(raw);
    if (!request.success) return closed("invalid_request");
    try {
      const store = (deps.store ?? createOpenHandsLaunchStore)();
      if (!store) return closed("unavailable");
      const mission = await store.load(context.workspaceId, request.data.missionId);
      if (!mission || mission.workspaceId !== context.workspaceId || mission.id !== request.data.missionId) return closed("not_found");
      const previous = await (deps.loadRecord ?? getMissionApprovalRecord)(mission.id);
      previousDecision = previous ? { id: previous.id, status: previous.status, expiresAt: previous.expiresAt } : null;
      const previousId = previous?.id ?? null;
      const now = (deps.now ?? Date.now)();
      const at = new Date(now).toISOString();
      if (request.data.action === "revoke") {
        // Revocation must remain available after the provider disconnects or the plan changes.
        if (!previous || previous.id !== request.data.expectedApprovalId || previous.status !== "approved") return closed("decision_changed");
        const record: MissionApprovalRecord = { ...previous, id: randomUUID(), status: "revoked",
          approvedBy: context.actorId, approvedAt: at, createdAt: at, reason: "Owner revoked mission execution approval" };
        return closed(await (deps.commit ?? commitMissionApprovalDecision)(mission, previousId, record) ? "revoked" : "decision_changed");
      }
      const config = (deps.configuration ?? defaultLoadLaunchConfig)();
      const registry = DEFAULT_EXECUTOR_PROVIDER_REGISTRY;
      const provider = resolveExecutorProviderBinding(config, registry);
      if (!config || provider.status !== "bound") return closed("configuration_unavailable");
      if (!config.foundationModelId) return closed("model_selection_required");
      const dossier = await store.readSubmission(mission, context.actorId);
      const launch = launchBinding(mission, context.actorId, config, dossier);
      if (!launch) return closed("submission_required");
      const models = registry.listModels().filter((model) => model.providerId === provider.registryProviderId);
      if (models.length !== 1 || !config.providerProfile) return closed("configuration_unavailable");
      const discovery = await resolveProviderConnectionDiscovery(registry, { workspaceId: context.workspaceId,
        requestingWorkspaceId: context.workspaceId, probe: deps.probe ?? createDefaultConnectionProbe(context.workspaceId), nowIso: at });
      const entry = discovery.status === "ok" ? discovery.snapshot.entries.find((item) => item.providerId === provider.registryProviderId) : null;
      if (!entry?.accountId || !isExecutionReady(entry)) return closed("account_unavailable");
      const binding = missionApprovalBindingSchema.parse({ version: 1, missionVersion: mission.updatedAt, launch,
        access: { workspaceId: context.workspaceId, accountId: entry.accountId, modelId: models[0].id,
          providerId: provider.registryProviderId, billingKind: "subscription", catalogRevision: config.providerProfile.policySha256 } });
      const reviewHash = missionApprovalReviewHash(binding, previousId);
      if (request.data.action === "prepare") return { ...closed("prepared"), reviewHash, binding,
        mission: { title: mission.title, objective: mission.objective, expectedOutput: mission.expectedOutput,
          scope: dossier!.mission.scope, acceptanceCriteria: dossier!.mission.acceptanceCriteria } };
      if (request.data.expectedReviewHash !== reviewHash) return closed("review_changed");
      const record: MissionApprovalRecord = { id: randomUUID(), missionId: mission.id,
        status: request.data.action === "approve" ? "approved" : "rejected", approvalScope: ["transition_to_running"],
        approvedBy: context.actorId, approvedAt: at, createdAt: at, expiresAt: new Date(now + 600_000).toISOString(), binding };
      const committed = await (deps.commit ?? commitMissionApprovalDecision)(mission, previousId, record);
      return committed ? { ...closed(record.status), approvalId: record.id, expiresAt: record.expiresAt } : closed("decision_changed");
    } catch { return closed("unavailable"); }
  };
}
