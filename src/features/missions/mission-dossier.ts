import type { Mission } from "@/core/types";
import { openHandsResultReceiptSchema, type OpenHandsResultReceipt } from "../../core/openhands-result-contract";
import { getAgentDisplayName, resolveAgentId } from "../agents/naming";
import { agentRegistry } from "../agents/seed";

export const missionStatusLabels: Record<Mission["status"], string> = {
  draft: "À préciser", queued: "En attente", running: "En cours",
  needs_approval: "Décision attendue", completed: "Terminée déclarée",
  failed: "Échouée", cancelled: "Annulée",
};

const MAX_REPORTED_TEXT = 100_000;
export type MissionReportedOutput = {
  missionId: string;
  state: "empty" | "reported";
  text: string | null;
  truncated: boolean;
  independentlyValidated: false;
  sourceField: "mission.result.summary";
  process: { exitCode: number; deadlineExceeded: boolean } | null;
  receipt: OpenHandsResultReceipt | null;
};
/** Only project fields that already exist in the persisted mission contract.
 * A stopped process, including exit 0, is not validation of its deliverable. */
export function missionReportedOutput(mission: Mission): MissionReportedOutput {
  const summary = mission.result?.summary;
  const text = typeof summary === "string" && summary.trim() ? summary : null;
  const raw = mission.input?._openhandsLaunch;
  const launch = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  const observation = launch?.process;
  const process = observation && typeof observation === "object" && !Array.isArray(observation)
    ? observation as Record<string, unknown> : null;
  const bound = launch?.missionId === mission.id && launch?.workspaceId === mission.workspaceId
    && typeof mission.id === "string" && typeof mission.workspaceId === "string"
    && launch?.state === "execution_finished";
  const parsedReceipt = openHandsResultReceiptSchema.safeParse(mission.result?._openhandsResult);
  const receipt = parsedReceipt.success ? parsedReceipt.data : null;
  const report = receipt?.report;
  const receiptBound = bound && process?.containerStopped === true && report
    && report.missionId === mission.id && report.workspaceId === mission.workspaceId
    && report.launchId === launch?.launchId && report.payloadHash === launch?.payloadHash
    && report.commitSha === launch?.commitSha;
  return {
    missionId: mission.id,
    state: text === null ? "empty" : "reported",
    text: text?.slice(0, MAX_REPORTED_TEXT) ?? null,
    truncated: text !== null && text.length > MAX_REPORTED_TEXT,
    independentlyValidated: false,
    sourceField: "mission.result.summary",
    receipt: receiptBound ? receipt : null,
    process: bound && process?.containerStopped === true && Number.isSafeInteger(process.exitCode)
      && typeof process.deadlineExceeded === "boolean"
      ? { exitCode: process.exitCode as number, deadlineExceeded: process.deadlineExceeded } : null,
  };
}

/** A reported result is not independent validation or measured consumption. */
export function missionDossierSummary(mission: Mission) {
  const summary = mission.result?.summary;
  const budget = mission.costBudgetCents;
  return {
    owner: !mission.assignedAgentId?.trim() ? "Non attribué"
      : agentRegistry.some((agent) => agent.id === resolveAgentId(mission.assignedAgentId))
        ? getAgentDisplayName(mission.assignedAgentId) : "Agent à identifier",
    status: missionStatusLabels[mission.status],
    reportedResult: typeof summary === "string" && summary.trim() ? summary : null,
    budget: typeof budget === "number" && Number.isFinite(budget) && budget >= 0
      ? `${(budget / 100).toFixed(2)} $` : "Non défini",
    nextStep: mission.status === "needs_approval" ? "Consulter les approbations ci-dessous."
      : mission.status === "failed" ? "Examiner la trace avant toute nouvelle tentative."
      : mission.status === "completed" ? "Vérifier le livrable et ses preuves avant de le considérer validé."
      : mission.status === "cancelled" ? "Aucune reprise automatique."
      : "Suivre le résultat dans le dossier ; aucune nouvelle exécution n’est déclenchée ici.",
  };
}
