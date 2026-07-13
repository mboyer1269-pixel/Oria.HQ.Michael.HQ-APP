// Marketplace publish policy — prepare-only. No bot, cookies, or Graph API auto-post.

export const FACEBOOK_MARKETPLACE_CREATE_URL =
  "https://www.facebook.com/marketplace/create/vehicle";

export const AUTO_PUBLISH_BLOCKED_REASON_FR = [
  "Je ne peux pas publier automatiquement sur Facebook Marketplace à ta place.",
  "",
  "Pourquoi :",
  "• Meta interdit les bots / automation sur Marketplace (risque de ban permanent du compte vendeur).",
  "• Il n'existe pas d'API publique fiable pour poster des véhicules sur Marketplace comme représentant.",
  "• Oria ne stocke jamais tes cookies ou identifiants Facebook (sécurité + conformité).",
  "",
  "Ce que je fais à la place (≈ 2 min par annonce) :",
  "1. Je prépare titre, prix, description et URLs photos.",
  "2. Tu cliques « Bundle complet » dans Sales Desk ou copies ci-dessous.",
  "3. Ouvre Marketplace → colle → upload photos → Publier.",
  "4. Marque « publié » + capture chaque prospect dans la banque leads.",
  "",
  `Lien direct : ${FACEBOOK_MARKETPLACE_CREATE_URL}`,
  "",
  "Pour une intégration officielle (catalogue dealer / ads), il faudrait Meta Business Manager",
  "vérifié + mandat Yellow Zone — pas un bot personnel.",
].join("\n");

export function wantsAutoPublishOnMarketplace(message: string): boolean {
  const lower = message.toLowerCase();
  const autoSignals = [
    "auto-publie",
    "autopublie",
    "auto publie",
    "publie automatiquement",
    "publier automatiquement",
    "publie pour moi",
    "publier pour moi",
    "poste pour moi",
    "poster pour moi",
    "publie directement",
    "publier directement",
    "génère et publie",
    "genere et publie",
    "publie sur marketplace",
    "publier sur marketplace",
    "publie sur facebook",
    "publier sur facebook",
    "mets en ligne",
    "met en ligne",
    "mets-le en ligne",
  ];
  return autoSignals.some((s) => lower.includes(s));
}
