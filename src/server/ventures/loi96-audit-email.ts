// src/server/ventures/loi96-audit-email.ts
//
// Pure builder: Loi 96 audit-offer email from a pipeline target.
// v1 is template-based (deterministic, no LLM call — the CEO reviews every
// word in the Send Desk before clicking). The Hermès/LLM personalization
// upgrade (P5 RAG + golden examples) replaces the body builder later without
// touching the bridge.
//
// Positioning per PLAN_DE_VENTE.md: we sell the elimination of a quantified
// legal risk — never legal advice (disclaimer mandatory).

import type { Loi96Target } from "./loi96-target-store";

export type Loi96AuditEmail = {
  subject: string;
  body: string;
};

export function buildLoi96AuditEmail(target: Loi96Target): Loi96AuditEmail {
  const company = target.name.replace(/\s+inc\.?$/i, "");
  const subject = `Non-conformités Loi 96 repérées sur ${target.domain}`;

  const body = `Bonjour,

En préparant une veille sur les obligations de la Charte de la langue française
(Loi 96), notre équipe a analysé ${target.domain} et y a relevé plusieurs
non-conformités concrètes — du type de celles que l'OQLF cible en priorité
depuis juin 2025.

Contexte spécifique à ${company} : ${target.angle}.

Ce que notre audit gratuit couvre (rapport personnalisé, pages précises de
votre site à l'appui) :
• contenu web et fiches produits unilingues anglais ;
• formulaires, infolettres et courriels transactionnels non francisés ;
• métadonnées, balises et parcours d'achat ;
• votre situation face à l'inscription OQLF (obligatoire pour les
  entreprises de 25 employés et plus depuis juin 2025).

Si vous le souhaitez, je vous envoie le rapport complet — sans frais et sans
engagement. Si les constats vous interpellent, un appel de 20 minutes suffit
pour vous présenter les deux options de mise en conformité (interne, avec
notre checklist, ou clé en main à prix fixe, livrée en 10 jours ouvrables).

Cordialement,
Michael Boyer

--
Cet audit porte exclusivement sur le contenu web et marketing. Il ne constitue
pas un avis juridique. Préparé avec l'assistance d'agents Orya HQ.
Pour ne plus recevoir de communications de notre part, répondez « retirer ».`;

  return { subject, body };
}
