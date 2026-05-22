import type { AgentOperatingCharter } from "@/features/hq/types";

export const agentCharters: AgentOperatingCharter[] = [
  {
    agentId: "joris",
    version: "1.0",
    effectiveDate: "2026-05-21",
    rules: [
      {
        action: "draft_brief",
        risk: "draft",
        mode: "auto",
        reason: "Action interne réversible — aucun impact externe.",
      },
      {
        action: "board_consult",
        risk: "read",
        mode: "auto",
        reason: "Lecture du Board virtuel — aucune donnée externe modifiée.",
      },
      {
        action: "score_opportunity",
        risk: "draft",
        mode: "auto",
        reason: "Analyse interne, résultat dans le workspace seulement.",
      },
      {
        action: "chat",
        risk: "read",
        mode: "auto",
        reason: "Conversation — aucune action sur les systèmes.",
      },
      {
        action: "book_event",
        risk: "write",
        mode: "supervised",
        evidenceRequired: ["intent_confirmed", "calendar_slot_free"],
        reason: "Écriture dans le calendrier — loggée et réversible dans 24h.",
      },
      {
        action: "send_message_external",
        risk: "publish",
        mode: "approval_required",
        evidenceRequired: ["recipient_confirmed", "content_reviewed", "send_approval"],
        reason: "Impact externe irréversible — Michael approuve avant envoi.",
      },
      {
        action: "make_purchase",
        risk: "publish",
        mode: "forbidden",
        reason: "Aucune dépense sans instruction explicite de Michael.",
      },
      {
        action: "access_financials",
        risk: "read",
        mode: "forbidden",
        reason: "Données financières MCL/Suivia hors périmètre Joris.",
      },
    ],
  },
  {
    agentId: "market-scout",
    version: "1.0",
    effectiveDate: "2026-05-21",
    rules: [
      {
        action: "collect_public_sources",
        risk: "read",
        mode: "auto",
        reason: "Scraping de sources publiques — lecture seule, aucun compte requis.",
      },
      {
        action: "draft_signal_notes",
        risk: "draft",
        mode: "auto",
        reason: "Brouillon interne transmis au Briefing Analyst — aucune diffusion.",
      },
      {
        action: "source_audit",
        risk: "check",
        mode: "supervised",
        evidenceRequired: ["source_url", "capture_date"],
        reason: "Vérification hebdomadaire de la qualité des sources — loggée.",
      },
      {
        action: "access_private_sources",
        risk: "read",
        mode: "forbidden",
        reason: "Données privées, API payantes ou données clients hors périmètre.",
      },
      {
        action: "send_any_message",
        risk: "publish",
        mode: "forbidden",
        reason: "Market Scout ne communique jamais vers l'extérieur directement.",
      },
      {
        action: "write_client_data",
        risk: "write",
        mode: "forbidden",
        reason: "Écriture sur les données clients réservée au Briefing Analyst et à Joris.",
      },
    ],
  },
  {
    agentId: "briefing-analyst",
    version: "1.0",
    effectiveDate: "2026-05-21",
    rules: [
      {
        action: "score_market_tension",
        risk: "draft",
        mode: "auto",
        reason: "Calcul interne sur données déjà collectées — aucune source externe sollicitée.",
      },
      {
        action: "draft_briefing",
        risk: "draft",
        mode: "supervised",
        evidenceRequired: ["source_citations", "confidence_note"],
        reason: "Brouillon de 5–7 pages — Michael revoit avant livraison.",
      },
      {
        action: "deliver_to_client",
        risk: "publish",
        mode: "approval_required",
        evidenceRequired: ["source_citations", "client_relevance", "confidence_note", "human_review_done"],
        reason: "Livraison externe irréversible — approbation obligatoire.",
      },
      {
        action: "modify_client_data",
        risk: "write",
        mode: "forbidden",
        reason: "Données clients modifiables uniquement via Joris avec instruction explicite.",
      },
      {
        action: "send_external_unsolicited",
        risk: "publish",
        mode: "forbidden",
        reason: "Aucune communication externe non sollicitée.",
      },
    ],
  },
  {
    agentId: "outreach-operator",
    version: "1.0",
    effectiveDate: "2026-05-21",
    rules: [
      {
        action: "draft_prospect_list",
        risk: "draft",
        mode: "supervised",
        evidenceRequired: ["prospect_fit"],
        reason: "Liste interne — révisée par Michael avant utilisation.",
      },
      {
        action: "draft_outreach_copy",
        risk: "draft",
        mode: "supervised",
        evidenceRequired: ["message_angle", "prospect_fit"],
        reason: "Copie interne — aucun envoi avant approbation.",
      },
      {
        action: "send_message",
        risk: "publish",
        mode: "approval_required",
        evidenceRequired: ["prospect_fit", "message_angle", "send_approval", "recipient_confirmed"],
        reason: "Chaque envoi externe demande une approbation explicite — sans exception.",
      },
      {
        action: "auto_send",
        risk: "publish",
        mode: "forbidden",
        reason: "Envoi automatisé sans approbation humaine — strictement interdit.",
      },
      {
        action: "publish_content",
        risk: "publish",
        mode: "forbidden",
        reason: "Publication externe (LinkedIn, email de masse, etc.) hors périmètre.",
      },
    ],
  },
  {
    agentId: "skill-curator",
    version: "1.0",
    effectiveDate: "2026-05-21",
    rules: [
      {
        action: "grade_skills",
        risk: "check",
        mode: "auto",
        reason: "Évaluation de qualité interne — lecture seule sur la bibliothèque.",
      },
      {
        action: "flag_stale_routines",
        risk: "check",
        mode: "auto",
        reason: "Signalement interne — aucune suppression, seulement un marquage.",
      },
      {
        action: "suggest_skill_merges",
        risk: "draft",
        mode: "supervised",
        evidenceRequired: ["skill_diff", "usage_count"],
        reason: "Suggestion de fusion — Michael valide avant de toucher à la bibliothèque.",
      },
      {
        action: "deploy_skill",
        risk: "write",
        mode: "approval_required",
        evidenceRequired: ["skill_diff", "usage_count", "risk_note", "test_passed"],
        reason: "Déploiement en production — approbation obligatoire.",
      },
      {
        action: "delete_skill",
        risk: "write",
        mode: "approval_required",
        evidenceRequired: ["usage_count", "risk_note", "backup_confirmed"],
        reason: "Suppression irréversible — approbation obligatoire avec backup.",
      },
      {
        action: "modify_production_code",
        risk: "write",
        mode: "forbidden",
        reason: "Le code de production est modifié uniquement par Michael ou Claude Code.",
      },
    ],
  },
];

export function getCharter(agentId: string): AgentOperatingCharter | undefined {
  return agentCharters.find((c) => c.agentId === agentId);
}
