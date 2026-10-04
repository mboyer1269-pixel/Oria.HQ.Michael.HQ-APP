import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Mission } from "@/core/types";
import { foundationModelIdSchema } from "@/core/openhands-launch-contract";
import { createDevelopmentStore, developmentInputSchema, developmentMissionId, type DevelopmentStore } from "./development-mission";
import { evaluateMissionApproval } from "./approval-service";
import { validateOpenHandsMemorySnapshot, type OpenHandsMemoryContextSnapshot } from "./openhands-memory-context";

export const OPENHANDS_MEMORY_KEY = "_openhandsMemory";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const boundedId = z.string().trim().min(1).max(160);
export const openHandsSubmissionRequestSchema = z.object({
  foundationModelId: foundationModelIdSchema.optional(),
  missionId: z.uuid(), expectedUpdatedAt: z.iso.datetime({ offset: true }),
  commitSha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/).refine((value) => !/^0+$/.test(value)),
  executorVersion: z.string().regex(/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/).max(64),
  budget: z.object({ maxCostCents: z.number().int().min(1).max(10000), maxTokens: z.number().int().min(1).max(200000),
    maxIterations: z.number().int().min(1).max(100), timeoutSeconds: z.number().int().min(1).max(1800) }).strict(),
}).strict();
const metadataSchema = z.object({ version: z.literal(1), requestId: z.uuid(),
  scope: developmentInputSchema.shape.scope, acceptanceCriteria: developmentInputSchema.shape.acceptanceCriteria,
  createdBy: boundedId, payloadHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type OpenHandsSubmissionRequest = z.infer<typeof openHandsSubmissionRequestSchema>;
export type OpenHandsSubmissionDossier = Readonly<{
  contractVersion: 1 | 2 | 3; executor: "openhands"; executorVersion: string;
  foundationModelId?: string;
  memory?: OpenHandsMemoryContextSnapshot;
  mission: Readonly<{ id: string; workspaceId: string; modeId: string; version: string; title: string; objective: string;
    scope: string; acceptanceCriteria: string; expectedOutput: string; createdBy: string }>;
  source: Readonly<{ commitSha: string; commitVerification: "not_verified" }>;
  budget: Readonly<OpenHandsSubmissionRequest["budget"]>;
  approvalRequired: boolean; executionRequested: false;
  idempotencyKey: string; payloadHash: string;
}>;
export type OpenHandsPreparationResult = { status: "prepared"; dossier: OpenHandsSubmissionDossier }
  | { status: "invalid_request" | "not_found" | "unavailable" | "stale_version" | "ineligible_mission" };

/** Preparation only. The future adapter must verify commit availability, enforce
 * budgets, obtain approval and reserve idempotencyKey+payloadHash durably before
 * any network request. A changed hash under the same key is a conflict, not retry.
 */
export function buildOpenHandsSubmission(mission: Mission, workspaceId: string, raw: unknown): OpenHandsPreparationResult {
  const request = openHandsSubmissionRequestSchema.safeParse(raw);
  if (!request.success || !boundedId.safeParse(workspaceId).success) return { status: "invalid_request" };
  const input = request.data;
  if (mission.workspaceId !== workspaceId || mission.id !== input.missionId) return { status: "not_found" };
  if (mission.updatedAt !== input.expectedUpdatedAt) return { status: "stale_version" };
  const meta = metadataSchema.safeParse(mission.input?.development);
  // Only persisted mission input is considered; the browser request remains strict.
  const memoryRaw = mission.input?.[OPENHANDS_MEMORY_KEY];
  const memory = memoryRaw === undefined ? undefined : validateOpenHandsMemorySnapshot(memoryRaw);
  if (memory === null || (memory && memory.workspaceId !== workspaceId)) return { status: "ineligible_mission" };
  // Unknown input extensions are not silently omitted from a submission contract.
  if (!meta.success || Object.keys(mission.input).some((key) => key !== "development" && key !== OPENHANDS_MEMORY_KEY) || mission.status !== "draft"
    || mission.result !== undefined || mission.completedAt !== undefined
    || mission.assignedAgentId !== "" || mission.autonomyLevel !== 0 || mission.requiresApproval !== true
    || mission.riskLevel !== "medium" || !boundedId.safeParse(mission.modeId).success
    || !developmentInputSchema.shape.title.safeParse(mission.title).success
    || !developmentInputSchema.shape.objective.safeParse(mission.objective).success
    || typeof mission.expectedOutput !== "string" || !mission.expectedOutput.trim() || mission.expectedOutput.length > 4000
    || (mission.costBudgetCents !== undefined && (!Number.isSafeInteger(mission.costBudgetCents) || mission.costBudgetCents < input.budget.maxCostCents))) {
    return { status: "ineligible_mission" };
  }
  const development = meta.data;
  if (developmentMissionId(workspaceId, development.requestId) !== mission.id
    || hash([mission.title, mission.objective, development.scope, development.acceptanceCriteria, mission.modeId, development.createdBy]) !== development.payloadHash) {
    return { status: "ineligible_mission" };
  }
  const payload = {
    contractVersion: input.foundationModelId ? 3 as const : memory ? 2 as const : 1 as const,
    executor: "openhands" as const, executorVersion: input.executorVersion,
    ...(input.foundationModelId ? { foundationModelId: input.foundationModelId } : {}),
    mission: Object.freeze({ id: mission.id, workspaceId, modeId: mission.modeId, version: mission.updatedAt,
      title: mission.title, objective: mission.objective, scope: development.scope, acceptanceCriteria: development.acceptanceCriteria,
      expectedOutput: mission.expectedOutput, createdBy: development.createdBy }),
    source: Object.freeze({ commitSha: input.commitSha, commitVerification: "not_verified" as const }),
    budget: Object.freeze({ ...input.budget }), approvalRequired: evaluateMissionApproval(mission).required,
    executionRequested: false as const,
    ...(memory ? { memory } : {}),
  };
  return { status: "prepared", dossier: Object.freeze({ ...payload,
    idempotencyKey: `hq-openhands-v1-${hash([workspaceId, mission.id, mission.updatedAt])}`, payloadHash: hash(payload) }) };
}

/** Loads the persisted mission using the existing durable development repository.
 * No local fallback, scheduler, credentials, HTTP adapter or activation switch.
 * workspaceId must come from an authenticated server boundary in future wiring.
 */
export async function prepareOpenHandsSubmission(workspaceId: string, raw: unknown,
  storeFactory: () => Pick<DevelopmentStore, "load"> | null = createDevelopmentStore): Promise<OpenHandsPreparationResult> {
  const request = openHandsSubmissionRequestSchema.safeParse(raw);
  if (!request.success || !boundedId.safeParse(workspaceId).success) return { status: "invalid_request" };
  try {
    const store = storeFactory();
    if (!store) return { status: "unavailable" };
    const mission = await store.load(workspaceId, request.data.missionId);
    return mission ? buildOpenHandsSubmission(mission, workspaceId, request.data) : { status: "not_found" };
  } catch { return { status: "unavailable" }; }
}
