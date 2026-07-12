// GM new-vehicle product knowledge for Buckingham sales consultants.
 // Microlearning cards: must-know facts, 3-line story, walkaround, objections.
 // Curated from public OEM/dealer guides (not GlobalConnect). Quebec / Gatineau first.

export type ModelKnowledgeCard = {
  id: string;
  make: "Chevrolet" | "Buick" | "GMC";
  model: string;
  /** Model name aliases for fuzzy match (TrailBlazer / Trailblazer). */
  aliases?: string[];
  years: number[];
  segmentFr: string;
  buyerProfileFr: string;
  threeLineStory: {
    useCaseFr: string;
    vsCompetitorFr: string;
    whyUsFr: string;
  };
  mustKnowFr: string[];
  featureBenefitsFr: Array<{ feature: string; benefit: string }>;
  trimLadderFr: string[];
  competitiveSetFr: Array<{ rival: string; angle: string }>;
  walkaroundFr: Array<{ zone: string; talk: string; question: string }>;
  coldClimateFr: string[];
  objectionsFr: Array<{ objection: string; reply: string }>;
  learnLinks: Array<{ label: string; url: string }>;
};

/**
 * Knowledge pack focused on new models commonly on Buckingham GM lot.
 * Numbers are approximate CAD/NA reference points for learning — always confirm
 * on window sticker / order guide before quoting a customer.
 */
export const GM_MODEL_KNOWLEDGE: ModelKnowledgeCard[] = [
  {
    id: "chevrolet-trax",
    make: "Chevrolet",
    model: "Trax",
    years: [2025, 2026, 2027],
    segmentFr: "VUS sous-compact — entrée de gamme Chevy",
    buyerProfileFr: "Premier acheteur, budget serré, ville/Gatineau, étudiants, couples sans remorque.",
    threeLineStory: {
      useCaseFr: "Le Trax est le ticket d’entrée Chevy : style, écrans modernes, conso urbaine.",
      vsCompetitorFr: "Vs Kia Seltos / Corolla Cross / Envista : tu gagnes sur prix d’entrée + confort tech sans forcer le budget.",
      whyUsFr: "Chez Buckingham : stock neuf local, essai immédiat, financement GM Canada.",
    },
    mustKnowFr: [
      "Moteur : 1.2L turbo 3-cyl ~137 ch / 162 lb-pi — toutes les finitions.",
      "Transmission : auto 6 rapports · traction avant seulement (pas d’AWD).",
      "Pas conçu pour remorquer — ne promets jamais de capacité de remorquage.",
      "Coffre : ~25,6 pi³ derrière / ~54 pi³ sièges rabattus (réf. NA).",
      "Tech : CarPlay / Android Auto sans fil ; écran jusqu’à ~11\" selon trim.",
      "Sécurité de base forte (freinage urgence, etc.) — Super Cruise non dispo.",
      "Si le client veut AWD hiver : oriente vers Trailblazer / Equinox / Terrain.",
    ],
    featureBenefitsFr: [
      { feature: "Prix d’entrée bas", benefit: "Ouvre la conversation paiement mensuel sans paniquer le client." },
      { feature: "Écrans + Apple/Android sans fil", benefit: "Le client « jeune tech » se sent dans un véhicule actuel." },
      { feature: "Taille compacte", benefit: "Stationnement Gatineau / Ottawa facile, conso urbaine." },
      { feature: "Look RS / Activ", benefit: "Style sans passer au segment premium." },
    ],
    trimLadderFr: ["LS → 1RS → LT → 2RS → Activ (noms peuvent varier CA)"],
    competitiveSetFr: [
      { rival: "Buick Envista", angle: "Même famille mécanique — Envista = look plus « luxe / coupé »." },
      { rival: "Chevy Trailblazer", angle: "Trailblazer = AWD dispo + un cran plus capable en hiver." },
      { rival: "Kia Seltos / Toyota Corolla Cross", angle: "Compare garantie/financement GM + stock immédiat ici." },
    ],
    walkaroundFr: [
      {
        zone: "Avant",
        talk: "Signature LED + face moderne — on montre que ce n’est pas un « petit cheap ».",
        question: "Tu cherches surtout le look, ou le paiement le plus bas possible ?",
      },
      {
        zone: "Côté / roues",
        talk: "Empreinte compacte pour la ville — idéal si tu te gares souvent au centre.",
        question: "Tu fais surtout Gatineau-Ottawa, ou des longs trajets 417 ?",
      },
      {
        zone: "Arrière / coffre",
        talk: "Coffre surprenant pour la taille — courses, bagages weekend.",
        question: "Tu as un poussette / hockey / valises régulièrement ?",
      },
      {
        zone: "Cabine / écrans",
        talk: "On connecte ton téléphone sans fil — tu restes dans ton écosystème.",
        question: "Tu es plutôt Apple ou Android ?",
      },
    ],
    coldClimateFr: [
      "Pas d’AWD : sois honnête — bons pneus d’hiver + conduite prudente.",
      "Si client priorise neige : Trailblazer AWD ou Equinox/Terrain AWD.",
    ],
    objectionsFr: [
      {
        objection: "Y’a pas de 4x4 ?",
        reply: "Exact — Trax = traction avant. Si l’AWD est non négociable, je te montre Trailblazer ou Terrain sur le lot maintenant.",
      },
      {
        objection: "Je veux remorquer mon VTT.",
        reply: "Trax n’est pas fait pour ça. Equinox / Colorado / Sierra selon le poids — on check le besoin réel.",
      },
    ],
    learnLinks: [
      { label: "Chevy.ca — Trax", url: "https://www.chevrolet.ca/fr/suvs/trax" },
    ],
  },
  {
    id: "chevrolet-trailblazer",
    make: "Chevrolet",
    model: "TrailBlazer",
    aliases: ["Trailblazer", "Trail Blazer"],
    years: [2024, 2025, 2026, 2027],
    segmentFr: "VUS sous-compact — AWD abordable",
    buyerProfileFr: "Client Trax qui veut AWD / hiver sans sauter à Equinox.",
    threeLineStory: {
      useCaseFr: "Le Trailblazer est le pont : taille compacte + AWD accessible.",
      vsCompetitorFr: "Vs Trax : gagne AWD. Vs Equinox : paiement souvent plus doux.",
      whyUsFr: "Meilleur argument hiver Gatineau dans le sous-compact Chevy.",
    },
    mustKnowFr: [
      "AWD disponible / souvent le différenciateur #1 vs Trax.",
      "Plus capable que Trax en conditions mixtes ; moins de volume qu’Equinox.",
      "Trims typiques : LS, LT, RS, Activ — confirme sur l’étiquette.",
      "Si client parle remorquage sérieux → Equinox / camion, pas Trailblazer.",
      "Angle vente : « même vibe urbain que Trax, mais prêt pour la neige ».",
    ],
    featureBenefitsFr: [
      { feature: "AWD", benefit: "Confiance en neige / pluie sans monter au plein Equinox." },
      { feature: "Style RS/Activ", benefit: "Look sport/aventure sans gros VUS." },
      { feature: "Taille maniable", benefit: "Facile à stationner vs Equinox/Terrain." },
    ],
    trimLadderFr: ["LS → LT → RS → Activ"],
    competitiveSetFr: [
      { rival: "Chevy Trax", angle: "Trax moins cher ; Trailblazer gagne AWD." },
      { rival: "Chevy Equinox", angle: "Equinox = plus d’espace + remorquage léger." },
      { rival: "Buick Encore GX", angle: "Encore GX = confort Buick, même conversation AWD." },
    ],
    walkaroundFr: [
      {
        zone: "Badges AWD",
        talk: "Ici on montre le badge AWD — c’est souvent la raison d’acheter.",
        question: "L’hiver, tu veux absolument AWD, ou de bons pneus suffisent ?",
      },
      {
        zone: "Coffre",
        talk: "Assez pour le quotidien famille légère / sports.",
        question: "Combien de passagers la plupart du temps ?",
      },
      {
        zone: "Cabine",
        talk: "On règle sièges + écran — confort avant l’essai route neige.",
        question: "Tu veux qu’on parte en essai sur boulevard Maloney ?",
      },
    ],
    coldClimateFr: [
      "AWD = argument #1 Outaouais — combine toujours avec pneus d’hiver.",
    ],
    objectionsFr: [
      {
        objection: "Pourquoi pas juste un Trax ?",
        reply: "Si tu ne roules qu’en ville été, Trax. Dès que l’AWD compte, Trailblazer est le step-up logique.",
      },
    ],
    learnLinks: [
      { label: "Chevy.ca — Trailblazer", url: "https://www.chevrolet.ca/fr/suvs/trailblazer" },
    ],
  },
  {
    id: "chevrolet-equinox",
    make: "Chevrolet",
    model: "Equinox",
    years: [2025, 2026, 2027],
    segmentFr: "VUS compact — volume familles",
    buyerProfileFr: "Familles, premiers VUS « vrais », besoin coffre + AWD + tech Google.",
    threeLineStory: {
      useCaseFr: "L’Equinox est le compact Chevy volume : espace, AWD, Google Built-in.",
      vsCompetitorFr: "Vs Trax/Trailblazer : plus gros. Vs Terrain : souvent meilleur rapport $/équipement.",
      whyUsFr: "Le « default » intelligent quand le client a grandi hors du sous-compact.",
    },
    mustKnowFr: [
      "Moteur typique : 1.5L turbo 4-cyl ~175 ch.",
      "AWD dispo ; FWD aussi — check le stock précis.",
      "Remorquage léger : jusqu’à ~1 500 lb selon config AWD (confirme étiquette).",
      "Tech : Google Built-in souvent standard sur génération récente.",
      "Coffre nettement plus grand que Trax/Trailblazer.",
      "Vs Terrain : Equinox = valeur ; Terrain = prestige / écran / AT4-Denali.",
    ],
    featureBenefitsFr: [
      { feature: "Espace famille", benefit: "Sièges arrière + coffre pour vraie vie (écoles, Costco)." },
      { feature: "AWD + modes de conduite", benefit: "Confiance quatre saisons Outaouais." },
      { feature: "Google Built-in", benefit: "Maps / Assistant sans dépendre du téléphone." },
      { feature: "Remorquage léger", benefit: "Petite remorque / motoneige légère — si équipé." },
    ],
    trimLadderFr: ["LT → RS → … (vérifier guide commande CA)"],
    competitiveSetFr: [
      { rival: "GMC Terrain", angle: "Terrain plus « premium » ; Equinox gagne souvent le prix." },
      { rival: "Honda CR-V / Toyota RAV4", angle: "Insiste stock + essai + financement GM aujourd’hui." },
      { rival: "Chevy Trailblazer", angle: "Trailblazer si budget ; Equinox si espace." },
    ],
    walkaroundFr: [
      {
        zone: "Profil",
        talk: "On montre la longueur d’empattement — stabilité et espace.",
        question: "Tu as des sièges d’auto / base Isofix à installer ?",
      },
      {
        zone: "Coffre",
        talk: "On rabats le siège — wow coffre vs Trax.",
        question: "Tu voyages avec poussette double ou hockey ?",
      },
      {
        zone: "Écrans Google",
        talk: "Navigation Google native — moins de galère Bluetooth.",
        question: "Tu utilises déjà Google Maps au quotidien ?",
      },
    ],
    coldClimateFr: [
      "Pousse AWD + pneus hiver ; Hill Descent / modes si équipés.",
    ],
    objectionsFr: [
      {
        objection: "Le Terrain a l’air plus chic.",
        reply: "Terrain = badge + écran + trims AT4/Denali. Equinox = même job quotidien, souvent moins cher — je te mets les deux côte à côte.",
      },
    ],
    learnLinks: [
      { label: "Chevy.ca — Equinox", url: "https://www.chevrolet.ca/fr/suvs/equinox" },
    ],
  },
  {
    id: "gmc-terrain",
    make: "GMC",
    model: "Terrain",
    years: [2025, 2026, 2027],
    segmentFr: "VUS compact premium GMC",
    buyerProfileFr: "Client qui veut le look GMC, écran XL, AT4 ou Denali.",
    threeLineStory: {
      useCaseFr: "Le Terrain est l’Equinox « elevated » : présence, tech, trims distincts.",
      vsCompetitorFr: "Vs Equinox : gagne cachet + écran ~15\" + AT4/Denali.",
      whyUsFr: "Parfait si le client dit « je veux un GMC, pas un Chevy ».",
    },
    mustKnowFr: [
      "Plateforme proche Equinox — différenciation = design, cabine, trims.",
      "Écran infodivertissement très grand (réf. ~15\") — wow factor walkaround.",
      "Trims clés : AT4 (look aventure) et Denali (luxe).",
      "AWD + remorquage léger similaires à Equinox selon équipement.",
      "Ne dénigre jamais Equinox — upsell Terrain sur émotion/brand.",
    ],
    featureBenefitsFr: [
      { feature: "Grand écran", benefit: "Démo visuelle immédiate en salle." },
      { feature: "AT4", benefit: "Client qui veut look « capable » sans gros Yukon." },
      { feature: "Denali", benefit: "Luxe accessible dans le compact." },
      { feature: "Badge GMC", benefit: "Statut — souvent décisif vs Chevy." },
    ],
    trimLadderFr: ["Elevation / AT4 / Denali (selon année CA)"],
    competitiveSetFr: [
      { rival: "Chevy Equinox", angle: "Même besoin — Terrain si budget/émotion le permet." },
      { rival: "Ford Escape / Hyundai Tucson", angle: "GMC présence + service Buckingham." },
    ],
    walkaroundFr: [
      {
        zone: "Calandre GMC",
        talk: "Signature GMC — on ancre la marque avant les specs.",
        question: "C’est important pour toi d’avoir le badge GMC ?",
      },
      {
        zone: "Écran",
        talk: "On allume l’écran XL — silence… puis on laisse le client toucher.",
        question: "Tu veux qu’on regarde AT4 ou Denali en premier ?",
      },
    ],
    coldClimateFr: ["Même logique AWD + hiver que Equinox ; AT4 pour storytelling aventure."],
    objectionsFr: [
      {
        objection: "Pourquoi plus cher qu’un Equinox ?",
        reply: "Tu paies design, écran, finition et trims AT4/Denali. Si le paiement doit rester bas, Equinox — sinon Terrain te démarque.",
      },
    ],
    learnLinks: [
      { label: "GMC.ca — Terrain", url: "https://www.gmc.ca/fr/suvs/terrain" },
      { label: "GMC Quick Start Guides", url: "https://www.gmc.com/support/quick-start-guides" },
    ],
  },
  {
    id: "buick-encore-gx",
    make: "Buick",
    model: "Encore GX",
    aliases: ["Encore"],
    years: [2024, 2025, 2026, 2027],
    segmentFr: "VUS sous-compact Buick — confort",
    buyerProfileFr: "Client qui veut douceur Buick, QuietTuning, sans gros VUS.",
    threeLineStory: {
      useCaseFr: "Encore GX = confort et raffinement dans un format facile.",
      vsCompetitorFr: "Vs Trax : plus « premium cabin ». Vs Envista : plus VUS classique.",
      whyUsFr: "Quand le client dit « je veux un Buick » en petit format.",
    },
    mustKnowFr: [
      "Positionnement confort / silence vs Chevy sport-value.",
      "AWD souvent dans la conversation hiver — vérifie l’unité.",
      "QuietTuning = talking point #1 Buick (bruit de route).",
      "Ne force pas un Trax si le client est déjà en mode Buick.",
    ],
    featureBenefitsFr: [
      { feature: "QuietTuning", benefit: "Cabine plus calme — essai = preuve." },
      { feature: "Finition Buick", benefit: "Upsell émotionnel vs Chevy entrée." },
      { feature: "Taille compacte", benefit: "Facile à vivre en ville." },
    ],
    trimLadderFr: ["Prefered / Sport Touring / Avenir (selon année)"],
    competitiveSetFr: [
      { rival: "Chevy Trax / Trailblazer", angle: "Buick = confort ; Chevy = prix/style." },
      { rival: "Buick Envista", angle: "Envista = silhouette coupé ; Encore = VUS traditionnel." },
    ],
    walkaroundFr: [
      {
        zone: "Portières",
        talk: "Ferme la porte — écoute la différence QuietTuning.",
        question: "Le silence en cabine, c’est important pour toi ?",
      },
    ],
    coldClimateFr: ["AWD + pneus hiver si dispo sur l’unité en stock."],
    objectionsFr: [
      {
        objection: "C’est juste un Trax plus cher.",
        reply: "Même famille de taille, expérience différente : silence, finition, badge. On fait un essai Trax vs Encore GX côte à côte.",
      },
    ],
    learnLinks: [
      { label: "Buick.ca — Encore GX", url: "https://www.buick.ca/fr/suvs/encore-gx" },
    ],
  },
  {
    id: "buick-envista",
    make: "Buick",
    model: "Envista",
    years: [2024, 2025, 2026, 2027],
    segmentFr: "VUS coupé sous-compact Buick",
    buyerProfileFr: "Style d’abord, young professional, look distinctif.",
    threeLineStory: {
      useCaseFr: "Envista = le Buick « Instagram » : ligne de toit, style, prix accessible.",
      vsCompetitorFr: "Vs Trax : plus distinctif. Vs Encore GX : plus fashion, moins « SUV classique ».",
      whyUsFr: "Quand le client veut se démarquer sans payer Avenir/Enclave.",
    },
    mustKnowFr: [
      "Souvent proche mécaniquement du Trax — différenciation = style + Buick.",
      "Toit fuyant = moins de volume coffre vs Encore GX — sois transparent.",
      "Angle : design premium à prix d’entrée.",
    ],
    featureBenefitsFr: [
      { feature: "Design coupé", benefit: "Hook émotionnel immédiat sur le lot." },
      { feature: "Prix accessible Buick", benefit: "Entrée dans la marque sans gros paiement." },
    ],
    trimLadderFr: ["Prefered → Sport Touring → Avenir"],
    competitiveSetFr: [
      { rival: "Chevy Trax", angle: "Même budget — Envista gagne le style Buick." },
      { rival: "Encore GX", angle: "Plus pratique Encore ; plus stylé Envista." },
    ],
    walkaroundFr: [
      {
        zone: "Profil",
        talk: "On s’arrête à 3/4 arrière — c’est le money shot.",
        question: "Tu veux un VUS pratique ou un look qui sort du lot ?",
      },
    ],
    coldClimateFr: ["Comme Trax : confirme traction ; oriente AWD ailleurs si besoin strict."],
    objectionsFr: [
      {
        objection: "Le coffre a l’air petit.",
        reply: "La ligne coupé coupe un peu le volume. Si le coffre est prioritaire, Encore GX ou Trailblazer — je te montre les litres en vrai.",
      },
    ],
    learnLinks: [
      { label: "Buick.ca — Envista", url: "https://www.buick.ca/fr/suvs/envista" },
    ],
  },
  {
    id: "chevrolet-colorado",
    make: "Chevrolet",
    model: "Colorado",
    years: [2024, 2025, 2026, 2027],
    segmentFr: "Camion mid-size",
    buyerProfileFr: "Client qui veut camion maniable, pas un full-size Silverado.",
    threeLineStory: {
      useCaseFr: "Colorado = capacité camion dans un format plus agile que Silverado.",
      vsCompetitorFr: "Vs Tacoma/Ranger : tech GM + configs trail. Vs Silverado : plus facile à vivre en ville.",
      whyUsFr: "Quand le client dit « j’ai pas besoin d’un 1500 ».",
    },
    mustKnowFr: [
      "Mid-size : plus étroit/maniable que Silverado 1500.",
      "Demande usage : chantier léger, VTT, neige, remorquage — ça dicte le moteur/boîte.",
      "Trims trail (ZR2 etc.) = storytelling off-road — confirme l’unité exacte.",
      "Compare toujours au besoin réel vs upsell Silverado.",
    ],
    featureBenefitsFr: [
      { feature: "Format mid-size", benefit: "Stationnement + sentiers plus faciles." },
      { feature: "Configs trail", benefit: "Client aventure sans Yukon/AT4 full-size." },
    ],
    trimLadderFr: ["WT → LT → Trail Boss / Z71 / ZR2 (selon année)"],
    competitiveSetFr: [
      { rival: "Toyota Tacoma / Ford Ranger", angle: "Essai + dispo stock Buckingham." },
      { rival: "Silverado 1500", angle: "Si charge/remorque lourde → 1500." },
    ],
    walkaroundFr: [
      {
        zone: "Caisse",
        talk: "Mesure mentale de la caisse vs besoin (motoneige, bois, outils).",
        question: "Qu’est-ce que tu mets le plus souvent dans la boîte ?",
      },
    ],
    coldClimateFr: ["4x4 + pneus — démontre modes terrain si équipé."],
    objectionsFr: [
      {
        objection: "Je vais trop vite au Silverado.",
        reply: "Si tu remorques lourd ou charges palette, oui. Sinon Colorado te sauve size/prix — on chiffre les deux.",
      },
    ],
    learnLinks: [
      { label: "Chevy.ca — Colorado", url: "https://www.chevrolet.ca/fr/trucks/colorado" },
    ],
  },
  {
    id: "chevrolet-bolt",
    make: "Chevrolet",
    model: "Bolt",
    aliases: ["Bolt EUV", "Bolt EV"],
    years: [2026, 2027, 2028],
    segmentFr: "Électrique compact Chevy",
    buyerProfileFr: "Commute Gatineau-Ottawa, coûts énergie, early EV / deuxième véhicule.",
    threeLineStory: {
      useCaseFr: "Le Bolt est l’EV abordable Chevy pour le quotidien électrique.",
      vsCompetitorFr: "Vs hybrides : zéro essence au quotidien. Vs gros EV : prix et taille plus simples.",
      whyUsFr: "Stock neuf local + conversation bornes maison / travail.",
    },
    mustKnowFr: [
      "Toujours clarifier : autonomie réelle hiver QC < autonomie étiquette été.",
      "Parle recharge : Level 2 maison vs bornes publiques vs travail.",
      "One-pedal / regen = démo obligatoire en essai.",
      "Compare coût « plein » électricité vs essence sur trajet client.",
      "Si client a peur EV : propose essai 24–48h si politique concession le permet.",
    ],
    featureBenefitsFr: [
      { feature: "Coût d’énergie bas", benefit: "Hook rationnel sur trajet quotidien." },
      { feature: "Conduite one-pedal", benefit: "Wow en essai urbain." },
      { feature: "Taille compacte", benefit: "EV sans intimider." },
    ],
    trimLadderFr: ["Selon génération/année — lire l’étiquette stock"],
    competitiveSetFr: [
      { rival: "Hybrides (RAV4 Hybrid, etc.)", angle: "Pas de recharge vs autonomie essence — clarifie le use case." },
      { rival: "Autres EV compacts", angle: "Dispo + service Chevy local." },
    ],
    walkaroundFr: [
      {
        zone: "Port de charge",
        talk: "On explique la prise + temps de charge réaliste pour LEUR trajet.",
        question: "Tu peux installer une borne à la maison, ou tu charges au travail ?",
      },
    ],
    coldClimateFr: [
      "Hiver Gatineau : préconditionnement batterie/cabine branché = message clé.",
      "Autonomie baisse au froid — sois transparent, construis confiance.",
    ],
    objectionsFr: [
      {
        objection: "L’hiver ça marche pas les chars électriques.",
        reply: "Ça marche — avec une vraie planif recharge et précond. On calcule ton trajet maison-travail avec marge hiver.",
      },
    ],
    learnLinks: [
      { label: "Chevy.ca — véhicules électriques", url: "https://www.chevrolet.ca/fr/electric" },
    ],
  },
];

function normalizeModelKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Resolve a knowledge card for a stock unit (new-vehicle learning).
 */
export function lookupModelKnowledge(input: {
  make: string;
  model: string;
  year?: number;
}): ModelKnowledgeCard | null {
  const make = normalizeModelKey(input.make);
  const model = normalizeModelKey(input.model);

  const candidates = GM_MODEL_KNOWLEDGE.filter((card) => {
    const makeOk = normalizeModelKey(card.make) === make;
    if (!makeOk) return false;
    const names = [card.model, ...(card.aliases ?? [])].map(normalizeModelKey);
    return names.some((n) => model === n || model.includes(n) || n.includes(model));
  });

  if (candidates.length === 0) return null;
  if (input.year) {
    const yearMatch = candidates.find((c) => c.years.includes(input.year!));
    if (yearMatch) return yearMatch;
  }
  return candidates[0] ?? null;
}

export function listKnowledgeForInventory(
  vehicles: Array<{ make: string; model: string; year: number; condition: string }>,
): Array<{ vehicleCount: number; card: ModelKnowledgeCard }> {
  const counts = new Map<string, { card: ModelKnowledgeCard; vehicleCount: number }>();
  for (const v of vehicles) {
    if (v.condition !== "new") continue;
    const card = lookupModelKnowledge(v);
    if (!card) continue;
    const prior = counts.get(card.id);
    if (prior) prior.vehicleCount += 1;
    else counts.set(card.id, { card, vehicleCount: 1 });
  }
  return [...counts.values()].sort((a, b) => b.vehicleCount - a.vehicleCount);
}

export function formatKnowledgeStudySheet(card: ModelKnowledgeCard): string {
  return [
    `FORMATION — ${card.make} ${card.model}`,
    card.segmentFr,
    "",
    "Histoire en 3 lignes :",
    `1. ${card.threeLineStory.useCaseFr}`,
    `2. ${card.threeLineStory.vsCompetitorFr}`,
    `3. ${card.threeLineStory.whyUsFr}`,
    "",
    "À maîtriser :",
    ...card.mustKnowFr.map((x) => `• ${x}`),
    "",
    "Feature → bénéfice :",
    ...card.featureBenefitsFr.map((x) => `• ${x.feature} → ${x.benefit}`),
    "",
    "Walkaround :",
    ...card.walkaroundFr.map(
      (s, i) => `${i + 1}. [${s.zone}] ${s.talk}\n   Q: ${s.question}`,
    ),
    "",
    "Objections :",
    ...card.objectionsFr.map((o) => `• « ${o.objection} » → ${o.reply}`),
  ].join("\n");
}
