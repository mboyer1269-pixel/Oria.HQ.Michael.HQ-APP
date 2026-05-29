// src/server/agents/work-order-autonomy-envelope-response.ts

import type { WorkOrderAutonomyEnvelope } from "./work-order-autonomy-envelope-contract";

/**
 * Pure, stateless formatter that converts a WorkOrderAutonomyEnvelope
 * into a beautiful, human-readable Markdown card.
 *
 * Implements the Human-on-the-Loop principle, explicitly stating the boundaries
 * of the agent's autonomy and emphasizing that risky actions require approval.
 */
export function formatAutonomyEnvelopeResponse(envelope: WorkOrderAutonomyEnvelope): string {
  const intro = "J’ai défini une Enveloppe d'Autonomie pour ce Work Order. Voici les limites de sécurité appliquées :";

  // Autonomy Level
  const level = envelope.autonomyLevel || "(non défini)";
  const levelLabels: Record<string, string> = {
    supervised: "🔒 Supervisé (chaque action nécessite validation)",
    delegated: "🔓 Délégué (actions internes autonomes, externes avec approbation)",
    autonomous_dry_run: "📝 Dry-run autonome (planification libre, rien ne sort du système)",
  };
  const levelLabel = levelLabels[level] || `⚠️ Inconnu (${level})`;

  // Identity
  const idStr = envelope.id || "(inconnu)";
  const workOrderStr = envelope.workOrderId || "(inconnu)";
  const agentStr = envelope.agentId || "(inconnu)";

  // Autonomous actions
  const allowed = envelope.allowedAutonomousActions || [];
  let allowedStr = "Aucune action autonome autorisée.";
  if (allowed.length > 0) {
    allowedStr = allowed.map((a) => `- 🟢 ${a}`).join("\n");
  }

  // Approval required
  const approval = envelope.approvalRequiredActions || [];
  let approvalStr = "Aucune action nécessitant approbation.";
  if (approval.length > 0) {
    approvalStr = approval.map((a) => `- 🟡 ${a}`).join("\n");
  }

  // Blocked
  const blocked = envelope.blockedActions || [];
  let blockedStr = "Aucune action bloquée explicitement.";
  if (blocked.length > 0) {
    blockedStr = blocked.map((a) => `- 🔴 ${a}`).join("\n");
  }

  // Escalation triggers
  const triggers = envelope.escalationTriggers || [];
  let triggersStr = "Aucun déclencheur d'escalade défini.";
  if (triggers.length > 0) {
    triggersStr = triggers
      .map((t) => {
        const sev = t.severity === "critical" ? "🔴" : "🟡";
        return `- ${sev} **${t.condition}** : ${t.description}`;
      })
      .join("\n");
  }

  // Constraints
  const constraints: string[] = [];
  if (envelope.budgetLimit !== undefined) {
    constraints.push(`- Budget max : ${envelope.budgetLimit} EUR`);
  }
  if (envelope.timeLimitMinutes !== undefined) {
    constraints.push(`- Temps max : ${envelope.timeLimitMinutes} min`);
  }
  if (envelope.riskThreshold !== undefined) {
    constraints.push(`- Seuil de risque : ${envelope.riskThreshold}`);
  }
  if (envelope.maxToolCost !== undefined) {
    constraints.push(`- Coût max par outil : ${envelope.maxToolCost} EUR`);
  }
  
  let constraintsStr = "Aucune contrainte additionnelle.";
  if (constraints.length > 0) {
    constraintsStr = constraints.join("\n");
  }

  const hotlNote =
    "💡 *Note Human-on-the-Loop : Cette enveloppe définit uniquement des permissions de planification et de recherche. Aucune exécution live, aucun déploiement, aucune dépense ou action externe n'est autorisée sans approbation humaine explicite.*";

  return [
    intro,
    "",
    "---",
    "### 🛡️ ENVELOPPE D'AUTONOMIE",
    `- **ID** : \`${idStr}\``,
    `- **Work Order** : \`${workOrderStr}\``,
    `- **Agent** : \`${agentStr}\``,
    `- **Niveau d'Autonomie** : ${levelLabel}`,
    "",
    "#### ✅ Actions Autonomes Autorisées (Green Zone)",
    allowedStr,
    "",
    "#### 🟡 Actions Nécessitant Approbation (Yellow Zone)",
    approvalStr,
    "",
    "#### 🔴 Actions Bloquées (Red Zone)",
    blockedStr,
    "",
    "#### ⚡ Déclencheurs d'Escalade",
    triggersStr,
    "",
    "#### 📊 Contraintes de l'Enveloppe",
    constraintsStr,
    "",
    "---",
    hotlNote,
  ].join("\n");
}
