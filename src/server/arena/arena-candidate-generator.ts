import type { Mission } from "@/core/types";
import type { ArenaCandidate } from "@/server/arena/roi-arena";

export class ArenaCandidateGeneratorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArenaCandidateGeneratorError";
  }
}

export type ArenaCandidateGeneratorOptions = {
  limit?: number;
  includeNotReady?: boolean;
};

export type ArenaCandidateGeneratorInput = {
  missions: ReadonlyArray<Mission>;
  workspaceId: string;
  options?: ArenaCandidateGeneratorOptions;
};

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "archived", "deleted"]);

function normalizeLimit(limit: number | undefined, max: number): number {
  if (limit === undefined) {
    return max;
  }

  if (!Number.isInteger(limit) || limit < 1) {
    throw new ArenaCandidateGeneratorError("limit must be a positive integer.");
  }

  return Math.min(limit, max);
}

function isCandidateMission(mission: Mission, includeNotReady: boolean): boolean {
  if (TERMINAL_STATUSES.has(mission.status)) {
    return false;
  }

  if (!includeNotReady && mission.status === "draft") {
    return false;
  }

  return true;
}

function compareMissions(a: Mission, b: Mission): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt.localeCompare(b.createdAt);
  }

  return a.id.localeCompare(b.id);
}

function mapMissionToCandidate(workspaceId: string, mission: Mission): ArenaCandidate {
  return {
    id: mission.id,
    kind: "mission",
    title: mission.title,
    workspaceId,
    missionId: mission.id,
    agentId: mission.assignedAgentId,
    objective: mission.objective,
    expectedOutput: mission.expectedOutput,
    riskLevel: mission.riskLevel,
    autonomyLevel: mission.autonomyLevel,
    estimatedCostCents: mission.costBudgetCents,
  };
}

export function generateArenaCandidatesFromMissions(
  input: ArenaCandidateGeneratorInput,
): ArenaCandidate[] {
  if (!input.workspaceId || typeof input.workspaceId !== "string") {
    throw new ArenaCandidateGeneratorError("workspaceId is required.");
  }

  if (!Array.isArray(input.missions)) {
    throw new ArenaCandidateGeneratorError("missions must be an array.");
  }

  const includeNotReady = input.options?.includeNotReady ?? false;
  const limit = normalizeLimit(input.options?.limit, input.missions.length);

  return input.missions
    .filter((mission) => isCandidateMission(mission, includeNotReady))
    .slice()
    .sort(compareMissions)
    .slice(0, limit)
    .map((mission) => mapMissionToCandidate(input.workspaceId, mission));
}
