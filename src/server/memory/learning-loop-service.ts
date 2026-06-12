import "server-only";

import { getArenaEvaluationService } from "@/server/arena/get-arena-service";
import type { LearningLoopReport } from "./agent-learning-loop";
import { adaptStoredVerdict, buildLearningLoopReport } from "./agent-learning-loop";
import {
  adaptVaultEntryToMemoryEntry,
  loadFileVaultEntries,
  mergeMemoryEntries,
} from "./memory-file-vault";
import { listAllVaultEntriesForWorkspace } from "./memory-vault-repository";

// ---------------------------------------------------------------------------
// Compound Learning Loop — server wiring.
// ---------------------------------------------------------------------------
// Reads stored arena verdicts and the full memory vault (file + runtime),
// returns the ROI report and approval-ready lesson proposals. Read-only:
// nothing is written to the vault here — proposals require CEO approval.
// ---------------------------------------------------------------------------

export async function getLearningLoopReport(
  workspaceId: string,
): Promise<LearningLoopReport & { generatedAt: string }> {
  let signals: ReturnType<typeof adaptStoredVerdict>[] = [];
  try {
    const stored = await getArenaEvaluationService().listVerdicts(workspaceId);
    signals = stored.map((entry) => adaptStoredVerdict(entry));
  } catch {
    // No verdicts available — the loop simply has nothing to learn from yet.
  }

  const fileEntries = await loadFileVaultEntries();
  const allEntries = mergeMemoryEntries(
    fileEntries,
    listAllVaultEntriesForWorkspace(workspaceId).map(adaptVaultEntryToMemoryEntry),
  );

  return {
    ...buildLearningLoopReport(signals, allEntries),
    generatedAt: new Date().toISOString(),
  };
}
