import type { AgentProfile } from "./types";

export const agentRegistry: AgentProfile[] = [
  {
    id: "joris",
    name: "Joris",
    role: "orchestrator",
    tagline: "Chef d'orchestre — planification, décision, coordination",
    description:
      "Cerveau central du HQ. Reçoit les intentions, planifie les missions, consulte le Board et coordonne les agents Hermes. Ne délègue jamais sans approbation CEO. Mode dry-run activé.",
    status: "active",
    autonomyLevel: 2,
    skillIds: ["mission.plan", "calendar.book", "board.consult", "brief.generate"],
    constraints: [
      "Ne jamais exécuter en mode live sans MissionApprovalRecord vérifié",
      "Ne jamais dépenser, publier ou livrer sans niveau 5 confirmé",
      "approvalConfirmed: false dans toute réponse Joris",
    ],
  },
  {
    id: "hermes-scout",
    name: "Hermes Scout",
    role: "scout",
    tagline: "Détection d'opportunités — marché, leads, signaux",
    description:
      "Scanne le marché, identifie les leads chauds, analyse les signaux d'opportunité et produit des rapports structurés. Lecture seule — aucune action externe.",
    status: "standby",
    autonomyLevel: 1,
    skillIds: ["opportunity.scan", "lead.triage"],
    constraints: [
      "Lecture seule — aucun envoi, aucun contact externe",
      "Aucune décision sans validation Joris",
    ],
  },
  {
    id: "hermes-builder",
    name: "Hermes Builder",
    role: "builder",
    tagline: "Construction de MVP — plans, specs, prototypes",
    description:
      "Produit des plans d'exécution, spécifications techniques et structures de MVP. Génère des brouillons internes. Aucune publication sans confirmation.",
    status: "standby",
    autonomyLevel: 2,
    skillIds: ["mvp.plan", "spec.draft"],
    constraints: [
      "Aucune publication ni déploiement sans approbation CEO",
      "Brouillons internes uniquement",
    ],
  },
  {
    id: "hermes-closer",
    name: "Hermes Closer",
    role: "closer",
    tagline: "Vente et conversion — scripts, suivis, closing",
    description:
      "Prépare les scripts d'appel, rédige les séquences de suivi et structure les arguments de fermeture. Toute communication externe nécessite confirmation niveau 5.",
    status: "planned",
    autonomyLevel: 3,
    skillIds: ["script.call", "followup.sequence"],
    constraints: [
      "Aucun envoi direct sans confirmation CEO niveau 5",
      "Jamais de promesses financières non validées",
    ],
  },
  {
    id: "hermes-operator",
    name: "Hermes Operator",
    role: "operator",
    tagline: "Automatisation — SOPs, workflows, intégrations",
    description:
      "Documente les SOPs, configure les workflows répétables et gère les intégrations internes. Aucun accès aux credentials de production sans Red Team pass.",
    status: "planned",
    autonomyLevel: 2,
    skillIds: ["sop.draft", "workflow.map"],
    constraints: [
      "Aucun accès credentials production",
      "Aucune modification de schéma DB sans approbation CEO",
    ],
  },
  {
    id: "hermes-auditor",
    name: "Hermes Auditor",
    role: "auditor",
    tagline: "Red Team — risques, guardrails, revue sécurité",
    description:
      "Évalue les risques, valide les guardrails et conduit les red team reviews avant activation du live executor. Rôle bloquant — son sign-off est requis pour déverrouiller l'exécution live.",
    status: "locked",
    autonomyLevel: 1,
    skillIds: ["risk.review", "redteam.pass"],
    constraints: [
      "Rôle purement évaluatif — aucune exécution propre",
      "Sign-off requis avant live executor unlock",
    ],
  },
  {
    id: "hermes-money",
    name: "Hermes Money",
    role: "money",
    tagline: "ROI et runway — cash, coûts IA, paliers millionnaires",
    description:
      "Suit le cash, le runway, les coûts IA et les objectifs financiers. Produit les snapshots CEO Brief. Lecture seule sur les données financières — aucune transaction.",
    status: "planned",
    autonomyLevel: 1,
    skillIds: ["cash.snapshot", "runway.calc"],
    constraints: [
      "Lecture seule — aucune transaction, aucun virement",
      "Aucune communication avec institutions financières sans niveau 5",
    ],
  },
];
