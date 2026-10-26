// GENERATED from .agents/rules/core.md (section "Agent-facing labels (fr)").
// Do not edit: run `node src/scripts/ci/generate-rule-labels.mjs`.

export const CORE_RULE_LABELS = {
  "R-MICHAEL-DECIDES#live-execution": "Aucune exécution live sans MissionApprovalRecord vérifié",
  "R-ASK-BEFORE-SENSITIVE#forge-escalation": "Déploiement, publication, dépendance externe payante → approbation CEO via Joris.",
  "R-MICHAEL-DECIDES#delivery-approval": "Livraisons précédées d'un APPROVE CEO",
  "R-ZONE-YELLOW#studio-zones": "Zone verte = production interne illimitée ; zone jaune = diffusion publique, toujours via approbation.",
} as const;

export type CoreRuleLabelKey = keyof typeof CORE_RULE_LABELS;

/** Agent-facing text of a core.md rule label, cited by id. */
export function ruleLabel(key: CoreRuleLabelKey): string {
  return CORE_RULE_LABELS[key];
}
