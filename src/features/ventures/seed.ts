import { getDefaultSafeAutonomyProfile } from "./autonomy";
import type { VentureCard } from "./types";

const SAFE_AUTONOMY_PROFILE = getDefaultSafeAutonomyProfile();

const NEUTRAL_TIMESTAMP = "2026-05-31T00:00:00.000Z";

/**
 * Neutral, blank-slate Venture Engine sample cards.
 *
 * Source of truth: the Venture Engine Recalibration doctrine
 * (`docs/VENTURE_ENGINE_RECALIBRATION.md`). These cards are illustrative only —
 * they are not historical ventures and not seeded into any runtime store.
 *
 * Guardrails respected here:
 * - No historical venture names (MCL, Suivia, NOORKI, Dad School, DADZCO,
 *   MUMZCO, APPAREL must never appear in this file).
 * - No card is in a `killed` or `archived` status.
 * - At most 3 cards are in an active validation status
 *   (`approved_for_validation`, `validating`, `operating`, `autonomous`,
 *   `scaling`) — matches the recalibration's 3 active validation slots.
 * - Every card carries the default safe autonomy profile so risky domains
 *   (spending, externalComms, publishing, dataMutation, legalCommitment)
 *   stay approval-gated by default.
 * - All `budgetCapCents` are 0: this surface is read-only, no spending is
 *   pre-authorized.
 * - `assignedAgents` use neutral role IDs only, no real persona names.
 */
export const ventureSeedCards: VentureCard[] = [
  {
    id: "venture-sample-candidate-marketplace-automation",
    name: "Candidate Marketplace Automation",
    description:
      "Idée candidate : automatiser la réconciliation des marketplaces pour les opérateurs indépendants.",
    source: "agent_suggested",
    status: "shortlisted",
    targetCustomer: "Opérateurs indépendants gérant plusieurs marketplaces.",
    problem:
      "La réconciliation manuelle des ventes et des frais entre marketplaces consomme plusieurs heures par semaine.",
    offer:
      "Workflow léger qui rapproche automatiquement les ventes, repère les écarts et produit un rapport d'exception lisible.",
    primaryChannel: "Outreach direct ciblé après approbation CEO.",
    score: {
      revenuePotential: 7,
      speedToFirstDollar: 6,
      costToValidate: 3,
      automationPotential: 8,
      ownerInvolvementRequired: 4,
      marketPain: 7,
      differentiation: 5,
      executionDifficulty: 5,
      risk: 3,
      grossMarginPotential: 8,
      strategicFit: 7,
      overallScore: 68,
      recommendation: "test_small",
    },
    validationPlan: {
      windowDays: 30,
      hypothesis:
        "Des opérateurs indépendants paieront pour récupérer au moins 3 heures par semaine de réconciliation.",
      successMetrics: [
        "3 entretiens qualifiés réalisés",
        "1 engagement de pilote payant",
      ],
      budgetCapCents: 0,
      requiredEvidence: [
        "Notes d'entretien horodatées",
        "Mesure baseline du workflow manuel",
      ],
      killCriteria: [
        {
          id: "kc-marketplace-automation-1",
          metric: "qualified_interviews",
          threshold: "< 3 en 30 jours",
          evaluationWindowDays: 30,
          consequence: "manual_review",
        },
      ],
    },
    autonomyProfile: SAFE_AUTONOMY_PROFILE,
    assignedAgents: [
      {
        agentId: "research-scout",
        role: "Recherche marché",
        status: "proposed",
        autonomyDomains: ["research", "marketScanning", "analysis", "reporting"],
      },
    ],
    decisions: [],
    createdAt: NEUTRAL_TIMESTAMP,
    updatedAt: NEUTRAL_TIMESTAMP,
  },
  {
    id: "venture-sample-ai-workflow-audit-service",
    name: "AI Workflow Audit Service",
    description:
      "Service d'audit ponctuel pour cartographier où l'IA peut remplacer ou accélérer un workflow opérationnel.",
    source: "human_created",
    status: "approved_for_validation",
    targetCustomer:
      "PME et équipes ops cherchant à comprendre où injecter l'IA sans déployer un projet long.",
    problem:
      "Les équipes savent qu'elles devraient utiliser l'IA mais ne savent pas où commencer ni mesurer l'impact.",
    offer:
      "Audit court (2 semaines) qui livre une carte des workflows, un score d'opportunités IA et un plan d'expérimentation.",
    primaryChannel: "Référencement réseau, puis offre signée explicitement.",
    score: {
      revenuePotential: 8,
      speedToFirstDollar: 8,
      costToValidate: 4,
      automationPotential: 5,
      ownerInvolvementRequired: 6,
      marketPain: 8,
      differentiation: 6,
      executionDifficulty: 4,
      risk: 3,
      grossMarginPotential: 8,
      strategicFit: 7,
      overallScore: 74,
      recommendation: "go",
    },
    validationPlan: {
      windowDays: 30,
      hypothesis:
        "Au moins 2 équipes ops paieront 2 000 $ CA pour un audit IA d'une durée de 2 semaines.",
      successMetrics: [
        "2 audits vendus",
        "Score NPS > 8 sur les livrables",
      ],
      budgetCapCents: 0,
      requiredEvidence: [
        "Bons de commande signés",
        "Comptes-rendus de présentation finale",
      ],
      killCriteria: [
        {
          id: "kc-audit-service-1",
          metric: "audits_sold",
          threshold: "< 2 en 30 jours",
          evaluationWindowDays: 30,
          consequence: "pause",
        },
      ],
    },
    autonomyProfile: SAFE_AUTONOMY_PROFILE,
    assignedAgents: [
      {
        agentId: "research-scout",
        role: "Cartographie des workflows clients",
        status: "active",
        autonomyDomains: ["research", "analysis", "scoring", "reporting"],
      },
      {
        agentId: "planning-agent",
        role: "Préparation des plans d'expérimentation",
        status: "proposed",
        autonomyDomains: ["planning", "reporting"],
      },
    ],
    decisions: [
      {
        id: "decision-audit-service-promote",
        type: "promote",
        summary: "CEO approuve le passage en validation contrôlée.",
        decidedBy: "ceo",
        decidedAt: NEUTRAL_TIMESTAMP,
        noExecutionAuthorized: true,
        humanOnTheLoop: true,
      },
    ],
    createdAt: NEUTRAL_TIMESTAMP,
    updatedAt: NEUTRAL_TIMESTAMP,
  },
  {
    id: "venture-sample-micro-saas-reporting-assistant",
    name: "Micro SaaS Reporting Assistant",
    description:
      "Micro SaaS qui génère des rapports hebdomadaires lisibles à partir des données opérationnelles d'une équipe.",
    source: "agent_suggested",
    status: "validating",
    targetCustomer:
      "Équipes de 5 à 20 personnes qui exportent déjà leurs données dans des outils standards.",
    problem:
      "Les équipes accumulent des données opérationnelles sans en tirer un rapport hebdomadaire actionnable.",
    offer:
      "Connecteurs en lecture seule + résumé hebdomadaire IA, livré par e-mail interne.",
    primaryChannel: "Communautés professionnelles internes après approbation CEO.",
    score: {
      revenuePotential: 7,
      speedToFirstDollar: 5,
      costToValidate: 4,
      automationPotential: 8,
      ownerInvolvementRequired: 3,
      marketPain: 7,
      differentiation: 5,
      executionDifficulty: 5,
      risk: 4,
      grossMarginPotential: 8,
      strategicFit: 7,
      overallScore: 65,
      recommendation: "test_small",
    },
    validationPlan: {
      windowDays: 60,
      hypothesis:
        "5 équipes accepteront un pilote payant si le rapport hebdomadaire automatique remplace un livrable manuel.",
      successMetrics: [
        "5 pilotes payants démarrés",
        "Taux de lecture du rapport > 70 %",
      ],
      budgetCapCents: 0,
      requiredEvidence: [
        "Contrats pilotes signés",
        "Logs anonymisés d'ouverture des rapports",
      ],
      killCriteria: [
        {
          id: "kc-reporting-assistant-1",
          metric: "active_pilots",
          threshold: "< 5 à 60 jours",
          evaluationWindowDays: 60,
          consequence: "rework",
        },
      ],
    },
    autonomyProfile: SAFE_AUTONOMY_PROFILE,
    assignedAgents: [
      {
        agentId: "analysis-agent",
        role: "Analyse des données pilotes",
        status: "active",
        autonomyDomains: ["analysis", "reporting"],
      },
    ],
    decisions: [
      {
        id: "decision-reporting-assistant-validate",
        type: "promote",
        summary: "CEO approuve la fenêtre de validation 60 jours.",
        decidedBy: "ceo",
        decidedAt: NEUTRAL_TIMESTAMP,
        noExecutionAuthorized: true,
        humanOnTheLoop: true,
      },
    ],
    createdAt: NEUTRAL_TIMESTAMP,
    updatedAt: NEUTRAL_TIMESTAMP,
  },
  {
    id: "venture-sample-niche-content-engine",
    name: "Niche Content Engine",
    description:
      "Moteur de contenu pour un créneau professionnel précis : recherche, plan éditorial, et brouillons internes.",
    source: "agent_suggested",
    status: "validating",
    targetCustomer:
      "Créateurs et solo-entrepreneurs ciblant une niche professionnelle bien définie.",
    problem:
      "Produire un contenu cohérent et différencié dans une niche demande beaucoup de recherche et de discipline éditoriale.",
    offer:
      "Pipeline qui recherche les sujets prioritaires, propose un plan éditorial et livre des brouillons internes prêts à éditer.",
    primaryChannel: "Référencement direct dans les communautés de niche, après approbation CEO.",
    score: {
      revenuePotential: 6,
      speedToFirstDollar: 6,
      costToValidate: 3,
      automationPotential: 8,
      ownerInvolvementRequired: 4,
      marketPain: 6,
      differentiation: 6,
      executionDifficulty: 4,
      risk: 4,
      grossMarginPotential: 8,
      strategicFit: 6,
      overallScore: 61,
      recommendation: "test_small",
    },
    validationPlan: {
      windowDays: 30,
      hypothesis:
        "Au moins 3 créateurs payeront un abonnement mensuel pour des brouillons de contenu en niche.",
      successMetrics: [
        "3 abonnements payants confirmés",
        "Au moins 1 brouillon publié par abonné dans le mois",
      ],
      budgetCapCents: 0,
      requiredEvidence: [
        "Preuves de paiement (montants masqués)",
        "Liens vers publications faites par les abonnés",
      ],
      killCriteria: [
        {
          id: "kc-niche-content-1",
          metric: "paying_subscribers",
          threshold: "< 3 en 30 jours",
          evaluationWindowDays: 30,
          consequence: "kill",
        },
      ],
    },
    autonomyProfile: SAFE_AUTONOMY_PROFILE,
    assignedAgents: [
      {
        agentId: "research-scout",
        role: "Veille de la niche",
        status: "active",
        autonomyDomains: ["research", "marketScanning", "analysis"],
      },
    ],
    decisions: [
      {
        id: "decision-niche-content-validate",
        type: "promote",
        summary: "CEO ouvre une fenêtre de validation 30 jours.",
        decidedBy: "ceo",
        decidedAt: NEUTRAL_TIMESTAMP,
        noExecutionAuthorized: true,
        humanOnTheLoop: true,
      },
    ],
    createdAt: NEUTRAL_TIMESTAMP,
    updatedAt: NEUTRAL_TIMESTAMP,
  },
  {
    id: "venture-sample-local-ops-automation-kit",
    name: "Local Ops Automation Kit",
    description:
      "Kit packagé d'automatisations pour des opérations locales standardisées (devis, rappels, suivis).",
    source: "human_created",
    status: "scored",
    targetCustomer:
      "Très petites entreprises locales avec un cycle commercial simple mais répétitif.",
    problem:
      "Les TPE locales perdent du temps sur des tâches répétitives faute d'outils adaptés à leur taille.",
    offer:
      "Pack d'automatisations prêtes à l'emploi (devis, rappels, suivis), installable sans connaissance technique.",
    primaryChannel: "Recommandation locale ciblée, après approbation CEO.",
    score: {
      revenuePotential: 5,
      speedToFirstDollar: 6,
      costToValidate: 4,
      automationPotential: 7,
      ownerInvolvementRequired: 6,
      marketPain: 7,
      differentiation: 4,
      executionDifficulty: 4,
      risk: 4,
      grossMarginPotential: 6,
      strategicFit: 5,
      overallScore: 55,
      recommendation: "hold",
    },
    validationPlan: {
      windowDays: 30,
      hypothesis:
        "Au moins 2 TPE locales adopteront le kit si la mise en route prend moins d'une heure.",
      successMetrics: [
        "2 installations terminées",
        "Aucun ticket bloquant après installation",
      ],
      budgetCapCents: 0,
      requiredEvidence: [
        "Logs d'installation horodatés",
        "Retour qualitatif post-installation",
      ],
      killCriteria: [
        {
          id: "kc-local-ops-1",
          metric: "completed_installs",
          threshold: "< 2 en 30 jours",
          evaluationWindowDays: 30,
          consequence: "manual_review",
        },
      ],
    },
    autonomyProfile: SAFE_AUTONOMY_PROFILE,
    assignedAgents: [
      {
        agentId: "planning-agent",
        role: "Plan d'installation simple",
        status: "proposed",
        autonomyDomains: ["planning", "reporting"],
      },
    ],
    decisions: [],
    createdAt: NEUTRAL_TIMESTAMP,
    updatedAt: NEUTRAL_TIMESTAMP,
  },
  {
    id: "venture-sample-digital-product-validation-lab",
    name: "Digital Product Validation Lab",
    description:
      "Laboratoire interne pour tester rapidement des idées de produits numériques avec une page de pré-vente contrôlée.",
    source: "agent_suggested",
    status: "candidate",
    targetCustomer:
      "L'équipe Oria elle-même, en tant que premier client interne du Venture Engine.",
    problem:
      "Trop d'idées numériques restent au stade de l'intuition, faute d'un cadre rapide pour mesurer un intérêt réel.",
    offer:
      "Cycle court : brief, page de pré-vente brouillonnée, plan de mesure, et décision go / hold / kill.",
    primaryChannel: "Test interne uniquement, pas de publication publique tant qu'aucune approbation CEO.",
    score: {
      revenuePotential: 4,
      speedToFirstDollar: 4,
      costToValidate: 2,
      automationPotential: 7,
      ownerInvolvementRequired: 5,
      marketPain: 5,
      differentiation: 5,
      executionDifficulty: 3,
      risk: 2,
      grossMarginPotential: 7,
      strategicFit: 8,
      overallScore: 50,
      recommendation: "hold",
    },
    validationPlan: {
      windowDays: 30,
      hypothesis:
        "Un cycle de validation court rendra explicite la décision go / hold / kill pour chaque idée passée au lab.",
      successMetrics: [
        "1 cycle de validation complet livré",
        "Décision documentée par idée testée",
      ],
      budgetCapCents: 0,
      requiredEvidence: [
        "Compte-rendu de cycle horodaté",
        "Décision finale signée par le CEO",
      ],
      killCriteria: [
        {
          id: "kc-validation-lab-1",
          metric: "cycles_completed",
          threshold: "< 1 en 30 jours",
          evaluationWindowDays: 30,
          consequence: "pause",
        },
      ],
    },
    autonomyProfile: SAFE_AUTONOMY_PROFILE,
    assignedAgents: [],
    decisions: [],
    createdAt: NEUTRAL_TIMESTAMP,
    updatedAt: NEUTRAL_TIMESTAMP,
  },
];
