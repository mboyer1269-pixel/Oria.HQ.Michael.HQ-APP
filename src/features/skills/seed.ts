import type { SkillProfile } from "./types";

export const skillsCatalog: SkillProfile[] = [
  // ── Money ────────────────────────────────────────────────────────────────
  {
    id: "cash.snapshot",
    label: "Cash Snapshot",
    category: "money",
    description: "Produit un résumé du cash disponible, du runway estimé et des coûts IA du mois.",
    status: "planned",
    autonomyLevel: 1,
    assignedRoles: ["money"],
    outputConstraint: "Lecture seule — aucune transaction ni virement",
  },
  {
    id: "runway.calc",
    label: "Runway Calculator",
    category: "money",
    description: "Calcule le runway en semaines selon les dépenses actuelles et les réserves.",
    status: "planned",
    autonomyLevel: 1,
    assignedRoles: ["money"],
    outputConstraint: "Lecture seule — aucune transaction ni virement",
  },

  // ── Sales / CRM ──────────────────────────────────────────────────────────
  {
    id: "lead.triage",
    label: "Lead Triage",
    category: "sales",
    description: "Évalue et classe les leads entrants par priorité selon les critères ICP définis.",
    status: "planned",
    autonomyLevel: 1,
    assignedRoles: ["scout"],
    outputConstraint: "Analyse seulement — aucun contact externe",
  },
  {
    id: "script.call",
    label: "Call Script",
    category: "sales",
    description: "Génère un script d'appel structuré (Straight Line) adapté au profil du lead.",
    status: "planned",
    autonomyLevel: 2,
    assignedRoles: ["closer"],
    outputConstraint: "Brouillon interne — aucun envoi sans confirmation CEO niveau 5",
  },
  {
    id: "followup.sequence",
    label: "Follow-up Sequence",
    category: "sales",
    description: "Crée une séquence de 3 à 5 messages de suivi pour un lead ou un pipeline.",
    status: "planned",
    autonomyLevel: 2,
    assignedRoles: ["closer"],
    outputConstraint: "Brouillon interne — aucun envoi sans confirmation CEO niveau 5",
  },

  // ── Marketing ────────────────────────────────────────────────────────────
  {
    id: "opportunity.scan",
    label: "Opportunity Scan",
    category: "marketing",
    description: "Scanne les signaux de marché et identifie les opportunités selon le contexte actif.",
    status: "planned",
    autonomyLevel: 1,
    assignedRoles: ["scout"],
    outputConstraint: "Rapport interne — aucune publication",
  },

  // ── Briefings ────────────────────────────────────────────────────────────
  {
    id: "brief.generate",
    label: "CEO Brief",
    category: "briefings",
    description: "Génère le brief matin ou soir : agenda, leads, cash, risques et action numéro 1.",
    status: "partial",
    autonomyLevel: 2,
    assignedRoles: ["orchestrator"],
    outputConstraint: "Affichage interne — aucun envoi externe automatique",
  },
  {
    id: "mission.plan",
    label: "Mission Dry-Run Plan",
    category: "briefings",
    description:
      "Produit un plan d'exécution dry-run pour une mission. approvalConfirmed toujours false. requiresConfirmation toujours true.",
    status: "active",
    autonomyLevel: 2,
    assignedRoles: ["orchestrator"],
    outputConstraint: "Dry-run uniquement — live executor verrouillé jusqu'au Red Team pass",
  },
  {
    id: "board.consult",
    label: "Board Consult",
    category: "briefings",
    description:
      "Consulte le Billionaire Board pour un angle stratégique sur une décision ou une offre.",
    status: "partial",
    autonomyLevel: 1,
    assignedRoles: ["orchestrator"],
  },

  // ── Customer Ops ─────────────────────────────────────────────────────────
  {
    id: "calendar.book",
    label: "Calendar Book",
    category: "customer-ops",
    description: "Crée un rendez-vous ou un rappel en langage naturel, FR-CA par défaut.",
    status: "active",
    autonomyLevel: 3,
    assignedRoles: ["orchestrator"],
    outputConstraint: "Invitation externe nécessite confirmation niveau 4",
  },

  // ── Legal / Admin ────────────────────────────────────────────────────────
  {
    id: "sop.draft",
    label: "SOP Draft",
    category: "legal-admin",
    description: "Rédige une procédure opérationnelle standard (SOP) pour un processus interne.",
    status: "planned",
    autonomyLevel: 2,
    assignedRoles: ["operator"],
    outputConstraint: "Brouillon interne — aucune publication ni envoi",
  },

  // ── Dev / Code ───────────────────────────────────────────────────────────
  {
    id: "spec.draft",
    label: "Spec Draft",
    category: "dev-code",
    description: "Produit une spécification technique structurée pour un MVP ou une fonctionnalité.",
    status: "planned",
    autonomyLevel: 2,
    assignedRoles: ["builder"],
    outputConstraint: "Document interne — aucun déploiement sans approbation CEO",
  },
  {
    id: "mvp.plan",
    label: "MVP Plan",
    category: "dev-code",
    description: "Structure un plan MVP : objectif, scope minimal, étapes et critères de succès.",
    status: "planned",
    autonomyLevel: 2,
    assignedRoles: ["builder"],
    outputConstraint: "Plan interne — aucune exécution sans validation CEO",
  },

  // ── Automation ───────────────────────────────────────────────────────────
  {
    id: "workflow.map",
    label: "Workflow Map",
    category: "automation",
    description: "Cartographie un workflow métier répétable et identifie les points d'automatisation.",
    status: "planned",
    autonomyLevel: 2,
    assignedRoles: ["operator"],
    outputConstraint: "Analyse interne — aucune modification de systèmes sans approbation CEO",
  },
  {
    id: "risk.review",
    label: "Risk Review",
    category: "automation",
    description:
      "Évalue les risques d'une mission ou d'un plan. Sign-off requis avant live executor unlock.",
    status: "planned",
    autonomyLevel: 1,
    assignedRoles: ["auditor"],
    outputConstraint: "Évaluation uniquement — rôle bloquant, pas d'exécution propre",
  },
  {
    id: "redteam.pass",
    label: "Red Team Pass",
    category: "automation",
    description:
      "Conduit la red team review complète des guardrails Mission Control avant toute activation live.",
    status: "planned",
    autonomyLevel: 1,
    assignedRoles: ["auditor"],
    outputConstraint: "Sign-off requis — ne peut pas s'auto-valider",
  },
];

export const CATEGORY_LABELS: Record<SkillProfile["category"], string> = {
  money: "Money",
  sales: "Sales / CRM",
  marketing: "Marketing",
  briefings: "Briefings",
  "customer-ops": "Customer Ops",
  "legal-admin": "Legal / Admin",
  "dev-code": "Dev / Code",
  automation: "Automation",
};
