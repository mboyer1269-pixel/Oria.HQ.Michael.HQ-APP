import type { Mission } from "@/core/types";
import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import { persistMissionDraftDurable } from "./mission-draft-durable-repository";
import { isDurableMissionDraftEnabled } from "./mission-persistence-flag";

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

/**
 * Save a mission draft through the persistence path selected by the
 * mission-persistence flag.
 *
 * Default (flag OFF): identical to today — the in-memory local repository.
 * Flag ON: durable Supabase persistence to the existing `missions` table.
 *
 * The flag is OFF by default, so this preserves current behavior until durable
 * persistence is explicitly enabled (staging first).
 */
export async function saveMissionDraft(mission: Mission): Promise<Mission> {
  if (isDurableMissionDraftEnabled()) {
    return persistMissionDraftDurable(mission);
  }

  return createLocalMissionDraft(mission);
}
