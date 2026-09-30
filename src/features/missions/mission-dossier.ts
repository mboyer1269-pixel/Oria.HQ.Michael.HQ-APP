import type { Mission } from "@/core/types";
import { getAgentDisplayName, resolveAgentId } from "../agents/naming";
import { agentRegistry } from "../agents/seed";

export const missionStatusLabels: Record<Mission["status"], string> = {
  draft: "À préciser", queued: "En attente", running: "En cours",
  needs_approval: "Décision attendue", completed: "Terminée déclarée",
  failed: "Échouée", cancelled: "Annulée",
};

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
