// src/config/ventures/loi96-profile.ts
//
// The Loi 96 compliance-audit venture expressed as DATA under the generic
// VentureMarketProfile model. This is config, not core code — proper nouns
// (Loi 96, OQLF) belong here. The generic builder in
// `@/core/ventures/build-outreach-email` turns this profile + a target into the
// outreach email, reproducing the previous bespoke loi96-audit-email output.
//
// To launch another Quebec venture, copy this file and change the offer +
// drivers. To launch a French venture, set market.region = undefined,
// language unchanged, and list the RGPD as the compliance driver. No code change.

import type { VentureMarketProfile } from "@/core/ventures/venture-market-profile";

export const loi96VentureProfile: VentureMarketProfile = {
  ventureId: "loi96",
  displayName: "Audit de conformité Loi 96",
  market: {
    country: "CA",
    region: "QC",
    language: "fr",
  },
  complianceDrivers: [
    {
      id: "loi-96",
      label: "Loi 96 (Charte de la langue française)",
      authority: "OQLF",
      since: "2025-06-01",
      note: "Inscription OQLF obligatoire pour les entreprises de 25 employés et plus.",
    },
    {
      id: "loi-25",
      label: "Loi 25 (protection des renseignements personnels)",
      authority: "CAI",
    },
  ],
  offer: {
    sell: "l'élimination d'un risque légal quantifié (jamais un avis juridique)",
    deliverable: "un audit gratuit avec rapport personnalisé",
    nextStep: "un appel de 20 minutes",
    pricingOptions: [
      {
        id: "internal",
        label: "Mise en conformité interne",
        model: "custom",
        summary: "Avec notre checklist, réalisée par l'équipe du client.",
      },
      {
        id: "turnkey",
        label: "Clé en main à prix fixe",
        model: "fixed",
        summary: "Livrée en 10 jours ouvrables.",
      },
    ],
    disclaimer: `--
Cet audit porte exclusivement sur le contenu web et marketing. Il ne constitue
pas un avis juridique. Préparé avec l'assistance d'agents Oria HQ.
Pour ne plus recevoir de communications de notre part, répondez « retirer ».`,
    neverClaims: ["un avis juridique", "une garantie de conformité légale"],
  },
  icp: {
    description:
      "Entreprises québécoises de 25 employés et plus avec un site web partiellement unilingue anglais.",
    qualifiers: {
      minEmployees: "25",
      jurisdiction: "QC",
      signal: "contenu web unilingue anglais",
    },
  },
  outreach: {
    channel: "email",
    language: "fr",
    tone: "professionnel, factuel, sans alarmisme",
    mode: "template",
    template: {
      subject: "Non-conformités Loi 96 repérées sur {{reference}}",
      body: `Bonjour,

En préparant une veille sur les obligations de la Charte de la langue française
(Loi 96), notre équipe a analysé {{reference}} et y a relevé plusieurs
non-conformités concrètes — du type de celles que l'OQLF cible en priorité
depuis juin 2025.

Contexte spécifique à {{company}} : {{angle}}.

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

{{disclaimer}}`,
    },
  },
};
