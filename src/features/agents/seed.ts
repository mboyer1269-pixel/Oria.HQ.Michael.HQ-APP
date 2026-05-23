import type { AgentProfile } from "./types";

/**
 * Canonical Oria agent registry. Single source of truth.
 * IDs are stable; `name` is the product label. No runtime code matches on the
 * old hermes-* IDs (verified), so the rename to distinct names is safe.
 */
export const agentRegistry: AgentProfile[] = [
  {
    id: "joris",
    name: "Joris",
    role: "orchestrator",
    tagline: "Chef d'orchestre — intention, routage cerveau, missions, approbation",
    description:
      "Cerveau central du HQ. Comprend l'intention, choisit le cerveau IA, crée les missions, route vers les agents et écrit au ledger. Ne délègue jamais sans approbation. Dry-run par défaut.",
    status: "active",
    autonomyLevel: 2,
    skillIds: ["mission.plan", "calendar.book", "board.consult", "brief.generate"],
    constraints: [
      "Ne jamais exécuter en live sans MissionApprovalRecord vérifié",
      "Ne jamais dépenser, publier ou livrer sans niveau 5 confirmé",
      "approvalConfirmed: false dans toute réponse",
    ],
    ventures: ["global"],
    monthlyRevenuePotential: 0,
    reviewCadence: "Chaque sprint",
  },
  {
    id: "hermes",
    name: "Hermès",
    role: "operator",
    tagline: "Opérateur exécutif contrôlé — SOPs, workflows, exécution gouvernée",
    description:
      "Exécute les missions validées (niveaux 1-3), documente les SOPs et cartographie les workflows. Aucun accès credentials prod, aucune modif de schéma DB sans approbation.",
    status: "standby",
    autonomyLevel: 2,
    skillIds: ["sop.draft", "workflow.map"],
    constraints: [
      "Aucun accès credentials production",
      "Aucune action externe (niveau 4-5) sans approbation",
      "Aucune modification de schéma DB sans approbation CEO",
    ],
    ventures: ["hq", "suivia", "mcl"],
    monthlyRevenuePotential: 0,
    reviewCadence: "Hebdomadaire",
  },
  {
    id: "orion",
    name: "Orion",
    role: "scout",
    tagline: "Recherche marché — opportunités, leads, signaux",
    description:
      "Scanne le marché, triage les leads et identifie les opportunités monétisables. Lecture seule — aucun contact externe.",
    status: "standby",
    autonomyLevel: 1,
    skillIds: ["opportunity.scan", "lead.triage"],
    constraints: [
      "Lecture seule — aucun envoi, aucun contact externe",
      "Aucune décision sans validation Joris",
    ],
    ventures: ["suivia", "mcl"],
    monthlyRevenuePotential: 1200,
    reviewCadence: "Hebdomadaire",
  },
  {
    id: "sentinel",
    name: "Sentinel",
    role: "auditor",
    tagline: "Red Team — risque, sécurité, conformité, guardrails",
    description:
      "Évalue les risques, valide les guardrails et conduit les red team reviews. Rôle bloquant : son sign-off est requis avant déverrouillage de l'exécution live.",
    status: "locked",
    autonomyLevel: 1,
    skillIds: ["risk.review", "redteam.pass"],
    constraints: [
      "Rôle purement évaluatif — aucune exécution propre",
      "Sign-off requis avant live executor unlock",
    ],
    ventures: ["global"],
    monthlyRevenuePotential: 0,
    reviewCadence: "À chaque déblocage live",
  },
  {
    id: "scribe",
    name: "Scribe",
    role: "memory",
    tagline: "Mémoire — décisions, journal quotidien, résumés (n'écrit pas le ledger)",
    description:
      "Sauve et indexe les décisions importantes, produit les daily logs et résume les missions. Complète le ledger (il le résume/indexe), ne le duplique pas.",
    status: "standby",
    autonomyLevel: 1,
    skillIds: ["memory.save", "daily.log", "summary.generate"],
    constraints: [
      "Lecture/écriture mémoire interne uniquement",
      "Ne jamais ré-écrire ni altérer le ledger d'actions",
    ],
    ventures: ["global"],
    monthlyRevenuePotential: 0,
    reviewCadence: "Mensuelle",
  },
  {
    id: "finops",
    name: "FinOps",
    role: "money",
    tagline: "ROI & runway — cash, coûts IA, budget",
    description:
      "Suit le cash, le runway et les coûts IA, produit les snapshots financiers du CEO Brief. Lecture seule — aucune transaction.",
    status: "planned",
    autonomyLevel: 1,
    skillIds: ["cash.snapshot", "runway.calc"],
    constraints: [
      "Lecture seule — aucune transaction, aucun virement",
      "Aucune communication avec institutions financières sans niveau 5",
    ],
    ventures: ["global"],
    monthlyRevenuePotential: 0,
    reviewCadence: "Mensuelle",
  },
  {
    id: "builder",
    name: "Builder",
    role: "builder",
    tagline: "Construction MVP — specs, plans, prototypes (brouillons internes)",
    description:
      "Produit specs techniques et plans MVP. Brouillons internes uniquement. Aucune publication ni déploiement sans approbation CEO.",
    status: "standby",
    autonomyLevel: 2,
    skillIds: ["mvp.plan", "spec.draft"],
    constraints: [
      "Aucune publication ni déploiement sans approbation CEO",
      "Brouillons internes uniquement",
    ],
    ventures: ["hq"],
    monthlyRevenuePotential: 0,
    reviewCadence: "Par projet",
  },
  {
    id: "closer",
    name: "Closer",
    role: "closer",
    tagline: "Vente & conversion — GELÉ (comm. externe = trop tôt)",
    description:
      "Prépare scripts d'appel et séquences de suivi. GELÉ jusqu'au durcissement de Sentinel + approval gates. Toute communication externe = niveau 5.",
    status: "planned",
    autonomyLevel: 3,
    skillIds: ["script.call", "followup.sequence"],
    constraints: [
      "Aucun envoi direct sans confirmation CEO niveau 5",
      "Jamais de promesses financières non validées",
      "Agent gelé — ne pas activer avant PR6",
    ],
    ventures: ["suivia", "mcl"],
    monthlyRevenuePotential: 0,
    reviewCadence: "Gelé",
  },
];
