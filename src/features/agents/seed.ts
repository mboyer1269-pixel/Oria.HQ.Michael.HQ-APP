import type { AgentProfile } from "./types";

/**
 * Canonical Oria agent registry. Single source of truth.
 *
 * Naming v1 — "un visage, des modules" : Joris est la seule persona nommée
 * (seul agent conversationnel) ; tous les autres agents portent un nom de
 * module fonctionnel, un mot, lisible en français et en anglais. Les IDs
 * sont stables et ne se renomment jamais (ledger, licenses, webhooks, DB) ;
 * les noms d'affichage se résolvent via `naming.ts`. Voir
 * `docs/AGENT_NAMING.md` pour la matrice ancien → nouveau.
 */
export const agentRegistry: AgentProfile[] = [
  {
    id: "joris",
    lore:
      "Le majordome du HQ. Il comprend, il route, il orchestre — et rien ne part sans le sceau du patron.",
    name: "Joris",
    role: "orchestrator",
    tagline: "Chef d'orchestre — intention, routage cerveau, missions, approbation",
    description:
      "Cerveau central du HQ. Comprend l'intention, choisit le cerveau IA, crée les missions, route vers les agents et écrit au ledger. Ne délègue jamais sans approbation. Dry-run par défaut.",
    status: "active",
    autonomyLevel: 2,
    skillIds: ["mission.plan", "calendar.book", "board.consult", "brief.generate"],
    constraints: [
      "Ne jamais exécuter en live sans MissionApprovalRecord vérifié",
      "Ne jamais dépenser, publier ou livrer sans niveau 5 confirmé",
      "approvalConfirmed: false dans toute réponse",
    ],
    ventures: ["global"],
    reviewCadence: "Chaque sprint",
  },
  {
    id: "hermes",
    lore:
      "Le relais d'exécution du HQ : il prépare SOPs, messages et actions — la transmission se fait toujours sous mandat, jamais en solo.",
    name: "Relay",
    role: "operator",
    tagline: "Opérateur exécutif contrôlé — SOPs, workflows, exécution gouvernée",
    description:
      "Exécute les missions validées (niveaux 1-3), documente les SOPs et cartographie les workflows. Aucun accès credentials prod, aucune modif de schéma DB sans approbation.",
    status: "standby",
    autonomyLevel: 2,
    skillIds: ["sop.draft", "workflow.map"],
    constraints: [
      "Aucun accès credentials production",
      "Aucune action externe (niveau 4-5) sans approbation",
      "Aucune modification de schéma DB sans approbation CEO",
    ],
    ventures: ["hq", "suivia", "mcl"],
    reviewCadence: "Hebdomadaire",
  },
  {
    id: "orion",
    lore:
      "Le balayage continu du marché : signaux, leads, fenêtres qui s'ouvrent — détection seulement, jamais de contact.",
    name: "Radar",
    role: "scout",
    tagline: "Recherche marché — opportunités, leads, signaux",
    description:
      "Scanne le marché, triage les leads et identifie les opportunités monétisables. Lecture seule — aucun contact externe.",
    status: "standby",
    autonomyLevel: 1,
    skillIds: ["opportunity.scan", "lead.triage"],
    constraints: [
      "Lecture seule — aucun envoi, aucun contact externe",
      "Aucune décision sans validation Joris",
    ],
    ventures: ["suivia", "mcl"],
    reviewCadence: "Hebdomadaire",
  },
  {
    id: "sentinel",
    lore:
      "La sentinelle du HQ : chaque action passe sous sa pesée — Green, Yellow ou Red, la règle avant le geste.",
    name: "Sentinel",
    role: "auditor",
    tagline: "Red Team — risque, sécurité, conformité, guardrails",
    description:
      "Évalue les risques, valide les guardrails et conduit les red team reviews. Rôle bloquant : son sign-off est requis avant déverrouillage de l'exécution live.",
    status: "locked",
    autonomyLevel: 1,
    skillIds: ["risk.review", "redteam.pass"],
    constraints: [
      "Rôle purement évaluatif — aucune exécution propre",
      "Sign-off requis avant live executor unlock",
    ],
    ventures: ["global"],
    reviewCadence: "À chaque déblocage live",
  },
  {
    id: "scribe",
    lore:
      "Le greffier du HQ : décisions, leçons, preuves — rien de ce que le HQ apprend ne se perd.",
    name: "Scribe",
    role: "memory",
    tagline: "Mémoire — décisions, journal quotidien, résumés (n'écrit pas le ledger)",
    description:
      "Sauve et indexe les décisions importantes, produit les daily logs et résume les missions. Complète le ledger (il le résume/indexe), ne le duplique pas.",
    status: "standby",
    autonomyLevel: 1,
    skillIds: ["memory.save", "daily.log", "summary.generate"],
    constraints: [
      "Lecture/écriture mémoire interne uniquement",
      "Ne jamais ré-écrire ni altérer le ledger d'actions",
    ],
    ventures: ["global"],
    reviewCadence: "Mensuelle",
  },
  {
    id: "finops",
    lore:
      "La vigie financière : chaque dollar qui entre et sort est compté — le profit est la seule preuve finale.",
    name: "FinOps",
    role: "money",
    tagline: "ROI & runway — cash, coûts IA, budget",
    description:
      "Suit le cash, le runway et les coûts IA, produit les snapshots financiers du CEO Brief. Lecture seule — aucune transaction.",
    status: "planned",
    autonomyLevel: 1,
    skillIds: ["cash.snapshot", "runway.calc"],
    constraints: [
      "Lecture seule — aucune transaction, aucun virement",
      "Aucune communication avec institutions financières sans niveau 5",
    ],
    ventures: ["global"],
    reviewCadence: "Mensuelle",
  },
  {
    id: "builder",
    lore:
      "La forge du HQ : specs, plans et prototypes — rien n'en sort sans être solide.",
    name: "Forge",
    role: "builder",
    tagline: "Construction MVP — specs, plans, prototypes (brouillons internes)",
    description:
      "Produit specs techniques et plans MVP. Brouillons internes uniquement. Aucune publication ni déploiement sans approbation CEO.",
    status: "standby",
    autonomyLevel: 2,
    skillIds: ["mvp.plan", "spec.draft"],
    constraints: [
      "Aucune publication ni déploiement sans approbation CEO",
      "Brouillons internes uniquement",
    ],
    ventures: ["hq"],
    reviewCadence: "Par projet",
  },
  {
    id: "closer",
    lore:
      "La voix qui transforme l'intérêt en signature — gelée tant que les garde-fous ne sont pas durcis.",
    name: "Closer",
    role: "closer",
    tagline: "Vente & conversion — GELÉ (comm. externe = trop tôt)",
    description:
      "Prépare scripts d'appel et séquences de suivi. GELÉ jusqu'au durcissement de Sentinel + approval gates. Toute communication externe = niveau 5.",
    status: "planned",
    autonomyLevel: 3,
    skillIds: ["script.call", "followup.sequence"],
    constraints: [
      "Aucun envoi direct sans confirmation CEO niveau 5",
      "Jamais de promesses financières non validées",
      "Agent gelé — ne pas activer avant PR6",
    ],
    ventures: ["suivia", "mcl"],
    reviewCadence: "Gelé",
  },

  // ── Studio -- Content & Campaigns ────────────────────────────────────────
  {
    id: "marketing",
    lore:
      "Le studio de contenu du HQ : campagnes, posts, messages — là où Relay parle à un, Studio parle à tous. La visibilité se construit, message par message.",
    name: "Studio",
    role: "operator",
    tagline: "Contenu, campagnes, social — zone verte autonome pour contenu interne",
    description:
      "Produit contenus, brouillons de campagnes et posts planifiés en interne. Zone verte pour tout ce qui reste interne / non listé. Zone jaune pour publication publique, courriel réel et publicités. Ne dépense jamais sans approbation CEO niveau 4.",
    status: "standby",
    autonomyLevel: 2,
    skillIds: [
      "content.generate",
      "campaign.draft",
      "social.post.schedule",
      "email.draft",
      "brief.content",
    ],
    constraints: [
      "Zone verte : contenu interne / non listé uniquement",
      "Zone jaune : publication publique, campagnes courriel réelles, publicités",
      "Aucune dépense publicitaire sans approbation CEO niveau 4",
      "Aucune promesse légale/financière non validée",
    ],
    ventures: ["hq", "suivia", "mcl"],
    reviewCadence: "Hebdomadaire",
  },

  // ── Lab -- Opportunity & MVP Design ──────────────────────────────────────
  {
    id: "inventor",
    lore:
      "Le laboratoire d'idées : concepts, MVP, opportunités de demain — tout reste interne tant que le CEO n'a pas tranché.",
    name: "Lab",
    role: "scout",
    tagline: "Opportunités, concepts, MVP — zone verte large pour l'idéation",
    description:
      "Score les opportunités, génère des concepts de produits/offres, brouillons de MVP et specs. Zone verte très large car tout output reste interne. Ne publie ni ne contacte personne sans zone jaune approuvée.",
    status: "standby",
    autonomyLevel: 2,
    skillIds: [
      "opportunity.score",
      "mvp.design",
      "concept.generate",
      "market.signal.read",
      "spec.draft",
    ],
    constraints: [
      "Zone verte : tout output reste interne",
      "Zone jaune : publication publique, contact partenaire, lancement externe",
      "Aucun engagement financier sans approbation CEO niveau 5",
      "Aucune promesse contractuelle non validée",
    ],
    ventures: ["hq", "suivia", "mcl", "personal"],
    reviewCadence: "Bimensuelle",
  },
];
