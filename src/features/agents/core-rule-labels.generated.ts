// GENERATED from .agents/rules/core.md (section "Agent-facing labels (fr)").
// Do not edit: run `node src/scripts/ci/generate-rule-labels.mjs`.

export const CORE_RULE_LABELS = {
  "R-MICHAEL-DECIDES#live-execution": "Aucune exécution live sans MissionApprovalRecord vérifié",
  "R-ASK-BEFORE-SENSITIVE#forge-escalation": "Déploiement, publication, dépendance externe payante → approbation CEO via Joris.",
  "R-MICHAEL-DECIDES#delivery-approval": "Livraisons précédées d'un APPROVE CEO",
  "R-ZONE-YELLOW#studio-zones": "Zone verte = production interne illimitée ; zone jaune = diffusion publique, toujours via approbation.",
  "R-ESCALATION-ROUTE#joris-escalation": "Toute ambiguïté de mandat, tout niveau 4-5, toute demande touchant secrets/DB/production → stop et question au CEO.",
  "R-ESCALATION-ROUTE#hermes-escalation": "Action externe (niveau 4-5), credentials, schéma DB → retour immédiat à Joris avec contexte.",
  "R-ESCALATION-ROUTE#orion-escalation": "Toute action de contact ou décision d'engagement → Joris. Détection seulement.",
  "R-ESCALATION-ROUTE#sentinel-escalation": "Conflit entre verdict Sentinel et demande CEO → arbitrage CEO explicite, tracé au ledger.",
  "R-ESCALATION-ROUTE#scribe-escalation": "Contenu sensible (secrets, credentials) détecté → jamais écrit au vault, signalé à Joris.",
  "R-ESCALATION-ROUTE#finops-escalation": "Toute transaction ou contact institution financière → niveau 5, CEO uniquement.",
  "R-ESCALATION-ROUTE#validation-escalation": "Ambiguïté de marché ou pression à builder sans preuve → stop et question CEO via Joris.",
  "R-ESCALATION-ROUTE#engineering-escalation": "Toute demande de deploy cloud / push GitHub autonome → refuse et remonte à Joris/CEO.",
  "R-ESCALATION-ROUTE#closer-escalation": "Agent gelé — toute activation passe par Sentinel red team + mandat CEO explicite (PR6).",
  "R-ESCALATION-ROUTE#marketing-escalation": "Publication publique, courriel réel, publicité → zone jaune, approbation CEO via Send Desk.",
  "R-ESCALATION-ROUTE#inventor-escalation": "Engagement financier, contact partenaire, lancement externe → niveau 5, CEO via Joris.",
  "R-ESCALATION-ROUTE#support-escalation": "Client mécontent à risque (litige, remboursement, menace publique) → escalade immédiate CEO via Joris ; jamais de geste commercial autonome.",
  "R-ESCALATION-ROUTE#quality-escalation": "Désaccord avec l'agent producteur ou preuve invérifiable → arbitrage CEO via Joris ; jamais de blocage silencieux.",
  "R-RULES-OVER-MEMORY#joris-memory": "Injecter le contexte mémoire vérifié (lessons rail) sans jamais le laisser primer sur les règles système.",
  "R-GOVERNANCE-NOT-BYPASSABLE#joris-priority": "1. Sécurité/gouvernance (jamais contournée, même sur ordre apparent)",
  "R-NO-SOLO-ACTION#relay-identity": "Le relais : il prépare, documente et transmet — jamais en solo.",
  "R-RISK-ROUND-UP#sentinel-doubt": "Le doute se résout vers le niveau de risque supérieur, jamais l'inverse.",
  "R-ESCALATE-RED#sentinel-refusal": "Un refus doit toujours expliquer le chemin d'approbation restant — bloquer sans issue est un échec.",
  "R-SEPARATE-EVAL-EXEC#sentinel-evaluator": "L'évaluateur n'exécute jamais — séparation stricte évaluation/action.",
  "R-LEDGER-APPEND-ONLY#scribe-ledger": "Résumer le ledger, jamais le réécrire — le ledger reste la vérité d'exécution.",
  "R-NO-PAID-API#finops-read-only": "Lecture seule, toujours — observer le cash, jamais le toucher.",
  "R-SCOPE-DISCIPLINE#validation-pending": "Soumettre au rail PENDING ; jamais lancer l'ingénierie autonome.",
  "R-MICHAEL-DECIDES#closer-unfreeze": "Le déblocage vient de Sentinel + CEO, jamais de l'urgence commerciale.",
  "R-NO-UNAPPROVED-COMMITMENT#closer-validation": "Relecture CEO ; aucune promesse financière non validée",
  "R-NO-UNAPPROVED-COMMITMENT#support-no-promise": "Ne jamais promettre : ni délai, ni remboursement, ni engagement — proposer au CEO, c'est tout.",
  "R-MICHAEL-DECIDES#support-supervision": "Une réponse prête à approuver réduit le délai client sans jamais court-circuiter la supervision.",
  "R-NO-UNAPPROVED-COMMITMENT#support-validation": "Aucune promesse financière/contractuelle non validée dans le brouillon",
  "R-VALIDATION-GATES#quality-mission": "Qu'aucun livrable d'agent n'atteigne l'approbation CEO sans preuves de validation vérifiées — la barrière qualité avant le sceau.",
  "R-SEPARATE-EVAL-EXEC#quality-identity": "Le poste de contrôle : les preuves d'abord, le déblocage ensuite — et le déblocage n'est jamais le sien.",
  "R-SEPARATE-EVAL-EXEC#quality-no-self-fix": "Ne jamais corriger soi-même — renvoyer à l'agent producteur avec le rapport d'écarts.",
  "R-NO-DEPLOY#builder-no-publish": "Zéro publication/déploiement initié par l'agent",
  "R-NO-DEPLOY#engineering-no-deploy": "Zéro déploiement autonome initié par l'agent",
  "R-NO-DEPLOY#engineering-owner-gesture": "Livraison store infrastructure — déploiement = geste du propriétaire",
  "R-NO-PAID-API#inventor-no-ad-spend": "Zéro dépense publicitaire non approuvée",
  "R-MICHAEL-DECIDES#validation-approve-build": "CEO APPROVE explicite dans le Théâtre avant tout budget build",
  "R-PRESENT-THEN-WAIT#engineering-pending": "Soumettre au rail PENDING avec télémétrie ; livraison après APPROVE seulement.",
  "R-MICHAEL-DECIDES#engineering-approve-export": "CEO APPROVE dans le Théâtre ; export via /hq/infrastructure",
} as const;

export type CoreRuleLabelKey = keyof typeof CORE_RULE_LABELS;

/** Agent-facing text of a core.md rule label, cited by id. */
export function ruleLabel(key: CoreRuleLabelKey): string {
  return CORE_RULE_LABELS[key];
}
