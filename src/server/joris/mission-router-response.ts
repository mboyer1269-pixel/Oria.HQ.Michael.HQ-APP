import type { MissionRouterResult } from "./mission-router";

/**
 * Pure, stateless formatter that converts a dry-run MissionRouterResult
 * into a beautiful, human-readable Markdown card for Joris's conversational response.
 *
 * Implements the Human-on-the-Loop principle, explicitly stating that
 * no execution took place and requiring manual CEO review.
 */
export function formatMissionRouterResponse(result: MissionRouterResult): string {
  const wo = result.workOrder;
  const intro = "J’ai préparé un Work Order dry-run. Aucune action n’a été exécutée.";

  // Work out fields safely
  const typeStr = wo.type === "venture" ? "VentureWorkOrder" : "MissionWorkOrder";
  const titleStr = wo.title || "(sans titre)";
  const ownerStr = wo.ownerAgentId || "(aucun)";
  const assignedStr =
    wo.type === "mission" && wo.assignedAgentId
      ? `\n- **Agent assigné (Assigned Agent)** : \`${wo.assignedAgentId}\``
      : "";

  // Boosters
  const boosters = wo.boostersRequested || [];
  let boostersStr = "Aucun";
  if (boosters.length > 0) {
    boostersStr = boosters
      .map((b) => {
        const typeLabel = b.boosterType ? `**${String(b.boosterType).toUpperCase()}**` : "**BOOSTER**";
        const tierLabel = b.modelTier ? ` (${b.modelTier})` : "";
        return `- ${typeLabel}${tierLabel} : ${b.reason}`;
      })
      .join("\n");
  }

  // Business Value
  let valueStr = "Non spécifiée";
  if (wo.businessValue) {
    const valType = wo.businessValue.valueType || "inconnue";
    const confidence = wo.businessValue.confidence || "inconnue";
    const amount =
      wo.businessValue.expectedValue !== undefined
        ? ` (${wo.businessValue.expectedValue} ${wo.businessValue.currency || "EUR"})`
        : "";
    valueStr = `${valType}${amount}, confiance : ${confidence}`;
  }

  // Expected Output
  const outputStr = wo.expectedOutput?.description || "Non spécifié";

  // Success Metric
  const successStr = wo.successMetric?.description || "Non spécifiée";

  // Next Action
  let nextActionStr = "Non spécifiée";
  if (wo.nextAction) {
    nextActionStr = `${wo.nextAction.description} par \`${wo.nextAction.actor || "inconnu"}\``;
  }

  // Approval Gates
  const gates = wo.approvalGates || [];
  let gatesStr = "Aucune porte d'approbation requise (bas risque)";
  if (gates.length > 0) {
    gatesStr = gates.map((g) => `- 🛡️ **${String(g).toUpperCase()}**`).join("\n");
  }

  const hotlNote =
    "💡 *Note Human-on-the-Loop : Ce Work Order est une proposition de planification purement passive. En tant que CEO / Workflow Owner, vous gardez le contrôle total. Aucune exécution, aucun transfert de fonds ou déploiement ne s'effectuera sans votre approbation explicite.*";

  return [
    intro,
    "",
    "---",
    "### 📋 PROPOSITION DE WORK ORDER (DRY-RUN)",
    `- **Type** : ${typeStr}`,
    `- **Titre** : ${titleStr}`,
    `- **Propriétaire (Owner Agent)** : \`${ownerStr}\`${assignedStr}`,
    `- **Valeur Business** : ${valueStr}`,
    `- **Livrable attendu (Expected Output)** : ${outputStr}`,
    `- **Métrique de succès** : ${successStr}`,
    `- **Prochaine action** : ${nextActionStr}`,
    "",
    "#### 🛡️ Portes d'approbation requises (Approval Gates)",
    gatesStr,
    "",
    "#### ⚡ Boosters recommandés",
    boostersStr,
    "",
    "---",
    hotlNote,
  ].join("\n");
}
