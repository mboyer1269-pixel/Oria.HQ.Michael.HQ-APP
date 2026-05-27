import type { Mission } from "@/core/types";
import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";

const localMissionDrafts: Mission[] = [];

export class MissionDraftRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissionDraftRepositoryError";
  }
}

function assertLocalMissionDraftAllowed() {
  if (!isLocalPersistenceFallbackAllowed()) {
    throw new MissionDraftRepositoryError(
      "Local mission draft persistence is only available in non-production development.",
    );
  }
}

export function createLocalMissionDraft(mission: Mission): Mission {
  assertLocalMissionDraftAllowed();

  const existingIndex = localMissionDrafts.findIndex((entry) => entry.id === mission.id);
  if (existingIndex >= 0) {
    localMissionDrafts[existingIndex] = mission;
    return mission;
  }

  localMissionDrafts.push(mission);
  return mission;
}

export function listLocalMissionDrafts(workspaceId: string, modeId?: string): Mission[] {
  let drafts = localMissionDrafts.filter((mission) => mission.workspaceId === workspaceId);

  if (modeId !== undefined) {
    drafts = drafts.filter((mission) => mission.modeId === modeId);
  }

  return drafts;
}

export function resetLocalMissionDraftsForTests(): void {
  localMissionDrafts.length = 0;
}
