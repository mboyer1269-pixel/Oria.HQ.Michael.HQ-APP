import { buildVentureScore } from "./venture-scoring";
import type { VentureCandidateSuggestion } from "./venture-suggestions";

const NEUTRAL_TIMESTAMP = "2026-05-31T00:00:00.000Z";

function score(overrides: Parameters<typeof buildVentureScore>[0], recommendation?: Parameters<typeof buildVentureScore>[1]) {
  return buildVentureScore(overrides, recommendation);
}

export const ventureSuggestionSeed: VentureCandidateSuggestion[] = [
  {
    id: "suggestion-ai-ops-audit-kit",
    name: "AI Ops Audit Kit",
    description:
      "Simulation de suggestion pour auditer rapidement les tâches d'exploitation que l'IA peut réduire.",
    targetCustomer: "Équipes ops qui veulent identifier des gains rapides sans refonte lourde.",
    problem:
      "Les opérations répétitives absorbent du temps sans visibilité claire sur les gains possibles.",
    offer:
      "Kit d'audit guidé pour classer les tâches, estimer le gain et prioriser les premiers tests.",
    primaryChannel: "Usage interne simulé avant toute future génération agent.",
    source: "simulated",
    suggestedBy: "simulation-seed",
    rationale:
      "Bon candidat pour un premier tri car le problème est concret, mesurable et facile à expliquer.",
    estimatedScore: score(
      {
        revenuePotential: 7,
        speedToFirstDollar: 7,
        costToValidate: 3,
        automationPotential: 7,
        ownerInvolvementRequired: 4,
        marketPain: 7,
        differentiation: 6,
        executionDifficulty: 4,
        risk: 3,
        grossMarginPotential: 8,
        strategicFit: 7,
      },
      "go",
    ),
    estimatedCostToValidateCents: 65000,
    estimatedTimeToFirstDollarDays: 21,
    riskNotes: ["Canal externe non activé.", "Validation d'abord en lecture seule."],
    suggestedNextAction: "review",
    createdAt: NEUTRAL_TIMESTAMP,
  },
  {
    id: "suggestion-niche-workflow-template-pack",
    name: "Niche Workflow Template Pack",
    description:
      "Bibliothèque de gabarits de workflow pour accélérer les opérations d'une niche précise.",
    targetCustomer: "Petites équipes qui veulent partir d'un modèle plutôt que d'une page blanche.",
    problem:
      "Les workflows spécialisés sont trop longs à concevoir et trop chers à personnaliser manuellement.",
    offer:
      "Pack de templates adaptables pour lancer un premier pilote sans développement lourd.",
    primaryChannel: "Démonstration interne, puis revue CEO.",
    source: "simulated",
    suggestedBy: "simulation-seed",
    rationale:
      "Intéressant si l'on cherche un actif packagé, mais la différenciation reste à vérifier.",
    estimatedScore: score(
      {
        revenuePotential: 6,
        speedToFirstDollar: 6,
        costToValidate: 4,
        automationPotential: 6,
        ownerInvolvementRequired: 5,
        marketPain: 6,
        differentiation: 5,
        executionDifficulty: 5,
        risk: 4,
        grossMarginPotential: 7,
        strategicFit: 6,
      },
      "test_small",
    ),
    estimatedCostToValidateCents: 50000,
    estimatedTimeToFirstDollarDays: 30,
    riskNotes: ["La personnalisation peut diluer la marge.", "Nécessite un cadre de validation strict."],
    suggestedNextAction: "score",
    createdAt: NEUTRAL_TIMESTAMP,
  },
  {
    id: "suggestion-local-service-automation-finder",
    name: "Local Service Automation Finder",
    description:
      "Suggestion prête pour repérer les automatisations utiles aux prestataires locaux.",
    targetCustomer: "Services locaux avec beaucoup de tâches répétitives et des relances manuelles.",
    problem:
      "Les prestataires locaux perdent du temps à identifier quoi automatiser en premier.",
    offer:
      "Explorateur qui classe les automatismes possibles par impact et effort de validation.",
    primaryChannel: "Future agent-ready review queue.",
    source: "future_agent",
    suggestedBy: "future-agent-placeholder",
    rationale:
      "Le problème est simple à expliquer et le coût de validation peut rester contrôlé.",
    estimatedScore: score(
      {
        revenuePotential: 5,
        speedToFirstDollar: 5,
        costToValidate: 5,
        automationPotential: 7,
        ownerInvolvementRequired: 5,
        marketPain: 6,
        differentiation: 5,
        executionDifficulty: 5,
        risk: 4,
        grossMarginPotential: 6,
        strategicFit: 6,
      },
      "hold",
    ),
    estimatedCostToValidateCents: 40000,
    estimatedTimeToFirstDollarDays: 45,
    riskNotes: ["Le terrain local peut exiger plus de support qu'attendu."],
    suggestedNextAction: "save_later",
    createdAt: NEUTRAL_TIMESTAMP,
  },
  {
    id: "suggestion-micro-reporting-assistant",
    name: "Micro Reporting Assistant",
    description:
      "Assistant de reporting léger pour transformer des exports bruts en lecture hebdomadaire.",
    targetCustomer: "Équipes de 5 à 20 personnes qui suivent déjà leurs métriques en local.",
    problem:
      "Les données existent, mais les rapports actionnables ne sont pas produits assez vite.",
    offer:
      "Résumé hebdomadaire en lecture seule avec priorisation des écarts et des tendances.",
    primaryChannel: "Tri interne de propositions, pas de publication externe.",
    source: "future_agent",
    suggestedBy: "future-agent-placeholder",
    rationale:
      "Candidat raisonnable pour un score rapide, car la proposition reste étroite et mesurable.",
    estimatedScore: score(
      {
        revenuePotential: 7,
        speedToFirstDollar: 6,
        costToValidate: 4,
        automationPotential: 8,
        ownerInvolvementRequired: 4,
        marketPain: 7,
        differentiation: 6,
        executionDifficulty: 4,
        risk: 3,
        grossMarginPotential: 8,
        strategicFit: 7,
      },
      "go",
    ),
    estimatedCostToValidateCents: 75000,
    estimatedTimeToFirstDollarDays: 28,
    riskNotes: ["Vigilance sur la qualité des données entrantes."],
    suggestedNextAction: "review",
    createdAt: NEUTRAL_TIMESTAMP,
  },
  {
    id: "suggestion-founder-content-repurposing-engine",
    name: "Founder Content Repurposing Engine",
    description:
      "Moteur de reformatage de contenu pour transformer des notes internes en brouillons réutilisables.",
    targetCustomer: "Fondateurs et petites équipes qui veulent recycler leurs idées de façon disciplinée.",
    problem:
      "Les idées de contenu sont dispersées et nécessitent trop de travail manuel pour être réutilisées.",
    offer:
      "Pipeline de brouillons internes qui réorganise les idées sans publication automatique.",
    primaryChannel: "Simulation interne uniquement.",
    source: "simulated",
    suggestedBy: "simulation-seed",
    rationale:
      "Le concept est facile à comprendre, mais la valeur dépend fortement du flux de contenu existant.",
    estimatedScore: score(
      {
        revenuePotential: 5,
        speedToFirstDollar: 5,
        costToValidate: 3,
        automationPotential: 7,
        ownerInvolvementRequired: 4,
        marketPain: 5,
        differentiation: 5,
        executionDifficulty: 5,
        risk: 4,
        grossMarginPotential: 7,
        strategicFit: 6,
      },
      "hold",
    ),
    estimatedCostToValidateCents: 30000,
    estimatedTimeToFirstDollarDays: 35,
    riskNotes: ["Pas de publication sans décision CEO.", "Le besoin peut être trop générique."],
    suggestedNextAction: "reject",
    createdAt: NEUTRAL_TIMESTAMP,
  },
  {
    id: "suggestion-compliance-checklist-generator",
    name: "Compliance Checklist Generator",
    description:
      "Générateur de checklist pour aider une équipe à préparer une revue de conformité interne.",
    targetCustomer: "Équipes qui ont besoin d'un cadre de contrôle sans lancer un projet légal.",
    problem:
      "Les contrôles sont souvent dispersés entre plusieurs fichiers et restent difficiles à suivre.",
    offer:
      "Checklist structurée pour préparer les revues sans canal externe ni automatisation risquée.",
    primaryChannel: "File de revue future_agent uniquement.",
    source: "future_agent",
    suggestedBy: "future-agent-placeholder",
    rationale:
      "Le sujet mérite un tri prudent, car il touche à la conformité et doit rester strictement assisté.",
    estimatedScore: score(
      {
        revenuePotential: 6,
        speedToFirstDollar: 4,
        costToValidate: 4,
        automationPotential: 5,
        ownerInvolvementRequired: 6,
        marketPain: 6,
        differentiation: 5,
        executionDifficulty: 4,
        risk: 2,
        grossMarginPotential: 7,
        strategicFit: 6,
      },
      "test_small",
    ),
    estimatedCostToValidateCents: 85000,
    estimatedTimeToFirstDollarDays: 60,
    riskNotes: ["Aucun envoi ou engagement externe.", "Revue humaine obligatoire."],
    suggestedNextAction: "save_later",
    createdAt: NEUTRAL_TIMESTAMP,
  },
];
