import type {
  AgentScore,
  DailyLog,
  MemorySubject,
  Moneyboard,
  VentureProgress,
} from "./types";

// Static mock data for the Memory Wiki foundation. Illustrative only — no
// persistence, no live figures. Replaced by real summaries once the Memory Log
// Contract and Supabase persistence land.

export const memorySubjects: MemorySubject[] = [
  {
    id: "sovra",
    title: "SOVRA Operating Model",
    status: "active",
    summary:
      "Modèle de holding agentique : Joris orchestre, les agents Hermes exécutent dans leur périmètre, le CEO garde la décision finale.",
    decisions: [
      "Memory Wiki avant Workboard — savoir ce qui s'est passé d'abord.",
      "Pas de stockage brut automatique — résumés opérationnels seulement.",
    ],
    risks: ["Modèle encore documentaire — pas de persistance."],
    nextActions: ["Brancher le Memory Log Contract (dry-run Joris)."],
    relatedRefs: ["docs/AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md"],
    lastUpdated: "2026-05-22",
  },
  {
    id: "joris",
    title: "Joris Operating Partner",
    status: "active",
    summary:
      "Assistant exécutif : calendrier, briefs CEO, Board virtuel, plans de mission en dry-run. N'exécute jamais sans confirmation explicite.",
    decisions: [
      "Prompt système centralisé et auditable (joris-prompt.ts).",
      "Détection d'intention durcie contre les faux positifs.",
    ],
    risks: ["Aucun wiring live — surface dry-run seulement."],
    nextActions: ["Préparer le daily log en dry-run."],
    relatedRefs: ["src/server/joris/joris-prompt.ts", "src/server/joris/intent-detection.ts"],
    lastUpdated: "2026-05-22",
  },
  {
    id: "agent-workboard",
    title: "Agent Workboard",
    status: "planned",
    summary:
      "Vue 'quoi faire maintenant' — file de tâches par agent, mandats, preuves requises. Vient après le Memory Wiki.",
    decisions: ["Reporté après la mémoire opérationnelle."],
    risks: ["Non démarré."],
    nextActions: ["Spécifier le contrat de tâche après le Memory Log."],
    relatedRefs: ["src/features/agents/charters.ts"],
    lastUpdated: "2026-05-21",
  },
  {
    id: "runtime",
    title: "Runtime VPS Hostinger",
    status: "building",
    summary:
      "Prototype runtime local (HMAC, canary runtime.health.echo). Exécuteur live verrouillé. VPS non déployé. Endpoint non exposé.",
    decisions: ["Live unlock par skill seulement, après Red Team pass."],
    risks: ["Aucun endpoint exposé — Phase 1 → 2."],
    nextActions: ["Audit Codex + contrat d'endpoint."],
    relatedRefs: ["docs/ORIA_VPS_RUNTIME_READINESS.md", "src/app/hq/runtime/page.tsx"],
    lastUpdated: "2026-05-22",
  },
  {
    id: "suivia-ap-ar",
    title: "Suivia AP/AR",
    status: "building",
    summary:
      "Pipeline d'intelligence marché pour cliniques esthétiques QC/ON : collecte de signaux, briefs hebdomadaires.",
    decisions: ["Briefing Analyst en mode supervisé."],
    risks: ["Coût IA à plafonner avant cron."],
    nextActions: ["Valider le scanner en dry-run."],
    relatedRefs: ["docs/HOLDING_PORTFOLIO_V1.md"],
    lastUpdated: "2026-05-20",
  },
  {
    id: "noorki-pro-suite",
    title: "NOORKI Pro Suite",
    status: "planned",
    summary: "Suite outillage pro — périmètre en définition.",
    decisions: [],
    risks: ["Périmètre non figé."],
    nextActions: ["Cadrer le premier module vendable."],
    relatedRefs: [],
    lastUpdated: "2026-05-18",
  },
  {
    id: "dad-school",
    title: "Dad School",
    status: "planned",
    summary: "Projet éducatif personnel — backlog.",
    decisions: [],
    risks: [],
    nextActions: ["Définir l'objectif minimal."],
    relatedRefs: [],
    lastUpdated: "2026-05-15",
  },
  {
    id: "risk-office",
    title: "Risk Office",
    status: "active",
    summary:
      "Garde-fous de la holding : charters d'agents, gates humaines, prod fail-fast, rate limit. Protège même sans générer de cash.",
    decisions: [
      "Fail-fast en production sur store in-memory.",
      "Rate limit backend sur le formulaire de contact public.",
    ],
    risks: ["Migrations en attente de sign-off CEO."],
    nextActions: ["Appliquer la migration rate-limit après sign-off."],
    relatedRefs: ["src/server/missions/execution-attempt-store.ts"],
    lastUpdated: "2026-05-22",
  },
];

export const recentDailyLogs: DailyLog[] = [
  {
    date: "2026-05-22",
    summary:
      "Stabilisation : runtime status page, prod fail-fast missions, fondation types agents. Rate limit contact et durcissement intent en review.",
    mergedPrs: ["#46 charter/fleet types", "#47 runtime status page", "#48 mission store prod guard"],
    decisions: [
      "Memory Wiki avant Workboard.",
      "Pas de stockage brut automatique.",
    ],
    blockers: ["Migration rate-limit en attente de sign-off CEO."],
    moneyInCents: 0,
    moneyOutCents: 1180,
    topAgentId: "hermes-auditor",
    nextActions: ["Lancer la fondation Memory Wiki.", "Reviewer rate limit + intent hardening."],
  },
  {
    date: "2026-05-21",
    summary:
      "Réintégration contrôlée des additions Codex : skills docs, config dev, prompt Joris. Un lot, un risque, une PR.",
    mergedPrs: ["#43 skills docs", "#44 dev config", "#45 Joris system prompt"],
    decisions: ["Landing order par lot de risque (A → J)."],
    blockers: ["Lots G/H/I (cron, AI, DB) en attente de mandat explicite."],
    moneyInCents: 0,
    moneyOutCents: 640,
    topAgentId: "hermes-builder",
    nextActions: ["Préparer la fondation types pour le Lot C."],
  },
  {
    date: "2026-05-20",
    summary:
      "Audit des 96 fichiers Codex untracked : inventaire en 10 lots, ordre de merge en 12 PR. Rien mergé sans classification.",
    mergedPrs: ["#41 Codex additions audit"],
    decisions: ["Backup branch pour préserver le travail Codex."],
    blockers: ["Scope contamination à éviter — fichier par fichier."],
    moneyInCents: 0,
    moneyOutCents: 410,
    topAgentId: "hermes-scout",
    nextActions: ["Lander le Lot A (docs) en premier."],
  },
];

export const moneyboard: Moneyboard = {
  periodLabel: "Cette semaine (mock)",
  moneyInCents: 0,
  moneyOutCents: 2230,
  pipelineEstimatedCents: 169700,
  aiRuntimeCostCents: 2230,
  inBreakdown: [
    { label: "Revenus signés", amountCents: 0 },
    { label: "MRR ajouté", amountCents: 0 },
    { label: "Pipeline qualifié (estimé)", amountCents: 169700 },
  ],
  outBreakdown: [
    { label: "Coût API IA", amountCents: 1480 },
    { label: "VPS / runtime", amountCents: 0 },
    { label: "Outils", amountCents: 750 },
    { label: "Ads", amountCents: 0 },
  ],
};

export const agentLeaderboard: AgentScore[] = [
  {
    agentId: "hermes-auditor",
    agentName: "Hermes Auditor",
    score: 91,
    outputsAccepted: 4,
    revenueInfluencedCents: 0,
    revenueLabel: "Risque évité",
    estimatedCostCents: 190,
    riskIncidents: 0,
    notes: "Protège la holding : fail-fast prod + revue des gates. Score élevé sans cash direct.",
  },
  {
    agentId: "hermes-scout",
    agentName: "Hermes Scout",
    score: 87,
    outputsAccepted: 8,
    revenueInfluencedCents: 120000,
    revenueLabel: "1 200 $ pipeline",
    estimatedCostCents: 320,
    riskIncidents: 0,
    notes: "Collecte de signaux marché — coût faible, impact pipeline élevé.",
  },
  {
    agentId: "hermes-closer",
    agentName: "Hermes Closer",
    score: 81,
    outputsAccepted: 5,
    revenueInfluencedCents: 49700,
    revenueLabel: "497 $ MRR potentiel",
    estimatedCostCents: 580,
    riskIncidents: 0,
    notes: "Outreach et closing supervisés — jamais d'envoi sans approbation.",
  },
  {
    agentId: "hermes-builder",
    agentName: "Hermes Builder",
    score: 72,
    outputsAccepted: 6,
    revenueInfluencedCents: 0,
    revenueLabel: "Interne",
    estimatedCostCents: 710,
    riskIncidents: 1,
    notes: "Construction interne — un incident de rework noté ce cycle.",
  },
  {
    agentId: "hermes-operator",
    agentName: "Hermes Operator",
    score: 68,
    outputsAccepted: 3,
    revenueInfluencedCents: 0,
    revenueLabel: "Interne",
    estimatedCostCents: 260,
    riskIncidents: 0,
    notes: "Opérations terrain — volume faible ce cycle.",
  },
  {
    agentId: "hermes-money",
    agentName: "Hermes Money",
    score: 64,
    outputsAccepted: 2,
    revenueInfluencedCents: 0,
    revenueLabel: "Suivi financier",
    estimatedCostCents: 150,
    riskIncidents: 0,
    notes: "Suivi AP/AR — démarrage, peu d'outputs acceptés.",
  },
];

export const ventureProgress: VentureProgress[] = [
  {
    id: "suivia",
    name: "Suivia AP/AR",
    status: "early",
    summary: "Briefs marché hebdomadaires pour cliniques esthétiques QC/ON.",
    mrrTargetCents: 500000,
    mrrCurrentCents: 0,
    nextAction: "Valider le scanner de signaux en dry-run.",
    riskStatus: "Coût IA à plafonner avant activation cron.",
  },
  {
    id: "noorki",
    name: "NOORKI Pro Suite",
    status: "early",
    summary: "Suite outillage pro — périmètre en définition.",
    mrrTargetCents: 300000,
    mrrCurrentCents: 0,
    nextAction: "Cadrer le premier module vendable.",
    riskStatus: "Périmètre non figé.",
  },
  {
    id: "dad-school",
    name: "Dad School",
    status: "early",
    summary: "Projet éducatif personnel — backlog.",
    mrrTargetCents: 0,
    mrrCurrentCents: 0,
    nextAction: "Définir l'objectif minimal.",
    riskStatus: "Non démarré.",
  },
];
