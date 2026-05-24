import type { Mission } from "@/core/types";

export const mockMissions: Mission[] = [
  {
    id: "mission_ceo_brief_2026_05_21",
    workspaceId: "michael-hq",
    modeId: "hq",
    title: "CEO Brief du jour",
    objective:
      "Compiler les signaux marché, l'agenda, les actions en attente et les décisions récentes en un brief décisionnel pour la journée.",
    assignedAgentId: "joris",
    autonomyLevel: 2,
    status: "queued",
    riskLevel: "low",
    input: { date: "2026-05-21", sources: ["agenda", "action_ledger", "market_scout"] },
    expectedOutput:
      "Brief structuré: top 3 priorités du jour, signaux marché à surveiller, actions à approuver, décisions récentes.",
    requiresApproval: false,
    costBudgetCents: 50,
    createdAt: "2026-05-21T08:00:00.000Z",
    updatedAt: "2026-05-21T08:00:00.000Z",
  },
  {
    id: "mission_audit_oria_2026_05_21",
    workspaceId: "michael-hq",
    modeId: "hq",
    title: "Audit repo Oria",
    objective:
      "Analyser la structure du repo, identifier les dépendances obsolètes, les tests manquants et les incohérences entre types et implémentation.",
    assignedAgentId: "builder",
    autonomyLevel: 1,
    status: "running",
    riskLevel: "medium",
    input: { repo: "Oria.HQ.Michael.HQ-APP", scope: "src/", exclude: [".env", "secrets"] },
    expectedOutput:
      "Rapport d'audit: liste de fichiers concernés, sévérité par catégorie, recommandations sans auto-fix.",
    requiresApproval: false,
    costBudgetCents: 200,
    createdAt: "2026-05-21T09:00:00.000Z",
    updatedAt: "2026-05-21T10:30:00.000Z",
  },
  {
    id: "mission_venture_lab_plan_2026_05_21",
    workspaceId: "michael-hq",
    modeId: "hq",
    title: "Préparer plan Venture Lab",
    objective:
      "Rédiger la proposition de modèle Venture Lab pour Phase 3: scoring d'idées, états de décision et flow de validation Joris.",
    assignedAgentId: "joris",
    autonomyLevel: 2,
    status: "draft",
    riskLevel: "medium",
    input: { reference: "docs/ROADMAP.md#phase-3", format: "internal_proposal" },
    expectedOutput:
      "Proposition structurée avec modèle de données, dimensions de scoring et states de décision. Aucune implémentation.",
    requiresApproval: false,
    createdAt: "2026-05-21T11:00:00.000Z",
    updatedAt: "2026-05-21T11:00:00.000Z",
  },
  {
    id: "mission_client_message_2026_05_21",
    workspaceId: "michael-hq",
    modeId: "hq",
    title: "Message externe client",
    objective:
      "Rédiger et envoyer un message de suivi au client pour la démonstration Signal-to-Client. Inclure le brief de la semaine et proposer une date de rencontre.",
    assignedAgentId: "joris",
    autonomyLevel: 5,
    status: "needs_approval",
    riskLevel: "high",
    input: { recipient: "client_demo", channel: "email", brief_ref: "mission_ceo_brief_2026_05_21" },
    expectedOutput:
      "Brouillon de message prêt à envoyer après approbation. Aucun envoi sans confirmation explicite.",
    requiresApproval: true,
    costBudgetCents: 10,
    createdAt: "2026-05-21T12:00:00.000Z",
    updatedAt: "2026-05-21T12:00:00.000Z",
  },
  {
    id: "mission_nettoyage_docs_2026_05_20",
    workspaceId: "michael-hq",
    modeId: "hq",
    title: "Nettoyage docs workspace",
    objective:
      "Archiver les documents dupliqués, renommer les fichiers sans convention et regrouper les SOPs par module dans le coffre privé.",
    assignedAgentId: "joris",
    autonomyLevel: 2,
    status: "completed",
    riskLevel: "low",
    input: { scope: "documents", workspace: "michael-hq" },
    expectedOutput: "Liste des fichiers archivés, renommés ou regroupés. Aucune suppression sans confirmation.",
    requiresApproval: false,
    result: {
      filesArchived: 4,
      filesRenamed: 7,
      groupsCreated: 2,
      summary: "Docs nettoyés. 4 archivés, 7 renommés, 2 groupes créés.",
    },
    createdAt: "2026-05-20T14:00:00.000Z",
    updatedAt: "2026-05-20T16:30:00.000Z",
    completedAt: "2026-05-20T16:30:00.000Z",
  },
];

export const KANBAN_COLUMNS: { status: Mission["status"]; label: string }[] = [
  { status: "draft", label: "Brouillon" },
  { status: "queued", label: "En attente" },
  { status: "running", label: "En cours" },
  { status: "needs_approval", label: "Approbation" },
  { status: "completed", label: "Terminé" },
  { status: "failed", label: "Échoué" },
];
