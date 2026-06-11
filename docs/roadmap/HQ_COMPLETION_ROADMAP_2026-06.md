# HQ Completion Roadmap — « Solide, on part »

**Statut :** Direction ratifiée par le CEO (session 2026-06-11). Docs-only.
**Critère de fin global :** la boucle revenue loi96 tourne de bout en bout DANS le HQ,
et le système pousse le CEO (suggestions, alertes, relances) au lieu d'attendre.

Fondé sur l'audit des ponts du 2026-06-11 : squelette sain (Send Desk, Joris→calendrier,
router, assets — connectés et testés), mais modules proactifs orphelins
(`hermes-prep-tick` appelé par personne, crons en stub 501, daily-direction manuelle)
et pont prepared-actions → Send Desk manquant.

---

## Les 7 pièces maîtresses (ordre d'exécution)

### P1 — Le Pont (Vague A+) — LIVRÉ (PR #296, merge en attente)
Le flux cible → préparation → envoi devient 100 % in-app.
- Store de cibles loi96 (import `ventures/loi96/pipeline.json`), workspace-scoped.
- **Brancher `hermes-prep-tick` → Send Desk** : action « Préparer » sur une cible →
  Hermès génère le courriel d'audit → file d'envoi, prêt au clic CEO.
- Page `/hq/ventures/loi96` refaite en pipeline : cibles, statuts
  (à_vérifier → audit_prêt → envoyé → relancé → répondu → appel → signé → perdu),
  bouton Préparer, bouton « Réponse reçue » (v1 manuel).
- Daily direction pointe la prochaine action revenue.
**Done quand :** Leetwo part du Send Desk sans qu'aucun fichier soit ouvert à la main.

### P2 — Durabilité
Fini l'in-memory fragile. Migrations Supabase (drafts, GO CEO requis pour appliquer) :
- `0024_outbound_send_desk.sql` (candidats, outcomes, compteurs, suppression)
- `0025_ceo_notes.sql`
- `0026_venture_assets.sql` + `0027_loi96_targets.sql`
Pattern dual-mode existant (0012/0013). Aucun changement de comportement.
**Done quand :** un restart ne perd rien.

### P3 — Decision Spine (le « cerveau » des prochaines actions)
Un moteur de suggestion d'actions **déterministe et auditable** — règles d'abord,
LLM seulement pour la formulation. Pas une boîte noire.
- Entrées : ledger (dernières actions), pipeline loi96 (relances dues J+4/J+9,
  réponses en attente < 2 h), file Send Desk (vide → préparer), readiness des ventures,
  kill metrics (compteurs vs seuils).
- Sortie : `NextBestAction[]` priorisées avec justification trois lignes
  (signal → règle → action) + UNE action mise en avant au cockpit.
- Chaque suggestion est journalisée (decision event) : on peut auditer pourquoi
  le cerveau a suggéré quoi, et mesurer son taux d'adoption.
- Le Revenue Heartbeat (streak d'actions revenue/jour) vit ici.
**Done quand :** ouvrir `/hq` répond à « quelle est LA prochaine action ? » sans réfléchir.

### P4 — Cost Ladder + Model Market Watch
Routage token-smart sans lock-in (décision CEO 2026-06-11) :
- **Cost Ladder** dans `model-router.ts` : étage FREE-FIRST (Kimi K2.6 rédaction,
  Qwen3 Coder structuré, DeepSeek V4 Flash raisonnement), planchers de qualité par
  tâche — classification/brouillons/relances = free ; **audit client personnalisé =
  premium obligatoire** (levier corr. +0,41 profit) ; budget guard/jour par agent.
- **Model Market Watch** (idée CEO) : cron quotidien qui interroge l'API publique
  OpenRouter (`/api/v1/models`), diff vs snapshot précédent :
  - nouveau modèle gratuit ou baisse de prix significative → **alerte** (cockpit,
    puis SMS interne en P6) ;
  - la **promotion** d'un modèle dans la ladder est **manuelle** (clic CEO, jamais auto) ;
  - la **rétrogradation** est **automatique** : modèle disparu, rate-limited à répétition
    ou dégradé → éjection de la ladder + fallback payé, événement ledger. Zéro lock-in.
**Done quand :** le HQ profite des gros modèles gratuits quand ils passent, sans
qu'on y pense, et s'en détache seul quand ils tombent.

### P5 — Mémoire RAG réelle (context engineering)
Le visuel du flux existe ; le retrieval derrière n'existe pas. Le Memory Vault est
un contrat sans moteur. La fiabilité des agents vient du contexte qu'on leur sert :
- pgvector sur Supabase (déjà dans la stack) : embeddings des résumés ledger,
  golden examples loi96 (`ventures/loi96/golden/`), SOPs, décisions.
- Retrieval pour Hermès au moment de préparer : les 3 meilleurs audits passés +
  le contexte de la cible → qualité d'audit qui monte avec chaque livraison.
- C'est la pièce qui transforme « 15 audits/semaine » en « 15 audits/semaine
  qui s'améliorent tout seuls ».
**Done quand :** un audit généré cite des patterns des golden examples sans qu'on les colle.

### P6 — Boucle fermée outbound (Vague C)
- Webhooks Resend (delivered/bounced → statut + suppression auto sur bounce).
- Relances J+4/J+9 auto-draftées dans la file (jamais auto-envoyées).
- Adapter Twilio : alerte SMS interne « réponse reçue » (le levier < 2 h) +
  SMS sortant leads chauds uniquement (Red structurel sur cold, déjà codé).
**Done quand :** une réponse de prospect te rejoint sur ton téléphone en < 1 minute.

### P7 — Réveil des proactifs
- Cron daily-direction (chaque matin, branché sur le Decision Spine P3).
- Cron ceo-brief réel (remplace le stub 501).
- Cron Market Watch (P4) — même infra.
Infra : Vercel cron ou le VPS Hostinger (son premier vrai rôle).
**Done quand :** le HQ a déjà travaillé quand tu te lèves.

---

### P6 — élargie : Canal CEO (addendum 2026-06-11, idée CEO)
Le SMS n'est pas qu'une alerte — c'est le canal de commandement mobile :
- **Notifications Joris par SMS (Twilio)** : réponse de prospect, approbation
  requise (la chaîne ne bloque jamais parce que tu n'es pas devant l'écran),
  brief du matin avec l'ordre de la journée, alerte kill-metric, alerte Market Watch.
- **Approbation par lien profond sécurisé** : le SMS notifie avec contexte clair
  (« Relance J+4 prête pour Wavo — approuver : [lien] »), le clic se fait dans le
  HQ. Jamais d'approbation par réponse texto en v1 (SIM swap ; l'invariant
  « clic CEO dans le HQ » reste le seul déclencheur). Pattern validé par la
  littérature human-in-the-loop 2026 : SMS pour l'urgent/high-value, contexte
  explicite, tout journalisé.
- **Centre de préférences** (`/hq/settings/notifications`) — décision CEO
  2026-06-11 : pas de profils abstraits, des **interrupteurs simples et
  explicites**, un par fonction :
  | Interrupteur | Défaut |
  |---|---|
  | 📱 Texto — briefing du matin | OFF |
  | 📱 Texto — alerte (réponse prospect, kill metric, Market Watch) | ON |
  | 📱 Texto — autorisation requise (lien d'approbation) | ON |
  | 📱 Texto — rapport de veille Argus | OFF (cockpit par défaut) |
  Chaque bascule = événement ledger.
- **Économie SMS structurelle** (exigence CEO « toujours penser à économiser ») :
  cap dur de SMS/jour (constante), regroupement en digest quand plusieurs alertes
  tombent dans la même heure, et fallback cockpit-seulement quand le cap est
  atteint — l'information n'est jamais perdue, juste le canal change.

### P8 — Venture Launch Kit (idée CEO 2026-06-11)
Quand une venture passe candidate → approved_for_validation, le HQ prépare
automatiquement le kit de lancement — **tout en prepared actions à approuver,
rien d'exécuté seul** :
- 5 noms d'entreprise candidats (LLM, étage premium) + **vérification de
  disponibilité de domaine** (RDAP — gratuit, sans clé API) pour chaque nom ;
- courriel dédié suggéré + entrée pré-remplie au registre d'actifs ;
- brief de landing page (structure, copy hero, CTA) prêt pour exécution ;
- checklist d'actifs par étape (le stage-readiness existant fait le suivi).
**Boucle d'apprentissage** (exigence CEO : « des employés qui apprennent ») :
chaque livrable approuvé/rejeté/édité par le CEO est enregistré via
`agent-outcome-repository` (existe déjà) et nourrit les golden examples (P5 RAG).
L'édition CEO d'un brouillon EST le signal d'apprentissage : les agents
convergent vers ton goût sans réglage manuel.

### P10 — Argus, l'agent de veille IA (idée CEO 2026-06-11)
Nommé d'après le gardien aux cent yeux de la mythologie — celui qui ne dort
jamais. Les choses bougent trop vite en IA pour qu'un humain suive seul ;
Argus est l'agent-employé dont c'est le métier.
- **Mandat** : surveiller ce qui sort — nouveaux modèles (absorbe le Model
  Market Watch de P4), outils agentiques, techniques (context engineering,
  patterns d'orchestration), changements d'API et de prix — et filtrer par
  UN critère : « est-ce que ça rend le HQ ou ses agents meilleurs ? »
- **Livrable** : rapport de veille hebdomadaire structuré (Top 3 opportunités
  actionnables · Menaces/dépréciations · À tester · À ignorer et pourquoi),
  déposé au cockpit + notification selon les interrupteurs. Chaque
  recommandation = prepared action approuvable (ex. « tester Kimi K3 sur les
  relances »), jamais d'adoption automatique.
- **Économie** : scanning avec modèles FREE de la Cost Ladder (c'est de la
  classification/résumé), synthèse hebdo seule en premium. Sources gratuites :
  API OpenRouter, flux RSS/changelogs des labs, HN/arXiv.
- **Autonomie** : domaine research/market-scanning = Green selon ta doctrine
  d'autonomie existante — Argus peut être ton premier agent réellement
  autonome de bout en bout, parce que son output est de l'information, pas
  de l'action externe. Le cron market-scout (stub 501) devient son moteur.
**Done quand :** lundi matin, le rapport Argus t'attend et au moins une
recommandation par mois se transforme en amélioration mesurable du HQ.

### P9 — Réorganisation du dashboard
Refonte information-architecture + user-friendly. **Séquencée APRÈS P3
volontairement** : l'architecture d'information doit suivre le modèle de
décision (le cockpit s'organise autour de « quelle est LA prochaine action »),
sinon on réorganise deux fois. S'exécute avec la commande de direction
artistique Claude Code déjà ratifiée (3 actes : direction → système → moments
signature).
**Principe directeur ratifié (feedback CEO 2026-06-11) : les voix typographiques.**
Aujourd'hui tout le texte se lit pareil — une seule voix, donc une page uniforme.
Chaque type de contenu reçoit sa voix distincte, reconnaissable avant lecture :
- **Tâches / checklists** : compactes, casse haute condensée, cases d'état — se
  scannent, ne se lisent pas ;
- **Commandes & réponses Joris** : voix « terminal » — monospace, préfixe
  d'invite, fond distinct — on voit que c'est un dialogue machine ;
- **Preuves (ids ledger, hashs, compteurs)** : monospace tabulaire, ton froid —
  la donnée judiciaire ;
- **Narration / descriptions** : sans-serif lisible, la seule voix « prose » ;
- **Métriques** : chiffres display bold tabulaires, libellés discrets.
Règle : si deux types de contenu différents ont le même traitement typographique,
c'est un bug de design.

### P11 — Graphe d'orchestration exécutable (décision CEO 2026-06-11)
Le visuel runtime actuel lit le ledger réel mais reste une *projection*. P11 fait
du graphe LA structure d'exécution elle-même — LangGraph-adjacent, mais
gouvernance-native (notre différenciation, personne n'a ça) :
- **Node = invocation de skill sous policy** (Thémis évalue chaque nœud avant
  exécution — Green passe, Yellow attend le clic, Red bloque) ;
- **Edge = transition journalisée** (le ledger est le checkpointer : reprise
  exacte après crash, replay auditable — ce que LangGraph fait avec ses
  checkpoints, nous on l'a déjà en hash-chain) ;
- **Économie de tokens structurelle** : routage Cost Ladder par nœud (chaque
  nœud déclare son plancher de qualité), cache des sorties de nœuds
  (un sous-graphe déjà exécuté avec les mêmes entrées ne se re-paie pas),
  et contexte minimal par nœud (chaque nœud reçoit SES entrées, pas tout
  l'historique — fini le contexte qui enfle) ;
- **La carte runtime devient live** : SSE/polling sur le ledger — on regarde
  les nœuds s'allumer pendant que la mission s'exécute. Pas du bla-bla :
  chaque pulsation à l'écran correspond à un événement ledger réel ;
- Fondations existantes : MISSION_STATE_MACHINE.md, execution-guard,
  green-lane-ledger, skill-dispatcher — P11 les compose en graphe, il ne
  réécrit rien.
Séquence : après P3 (le Decision Spine fournit les graphes à exécuter).
**Done quand :** une mission multi-étapes s'exécute comme graphe visible en
direct, reprenable après interruption, avec coût par nœud affiché.

## Matrice de décision

| Pièce | Impact revenue | Effort | Dépend de |
|---|---|---|---|
| P1 Pont | ★★★★★ direct | 1-2 j | rien — LIVRÉ (PR #296) |
| P2 Durabilité | ★★★★ (confiance) | 1 j + GO migrations | P1 |
| P3 Decision Spine | ★★★★★ (cadence) | 2 j | P1 (signaux pipeline) |
| P4 Cost Ladder + Watch | ★★ (échelle) | 1-2 j | rien |
| P5 RAG | ★★★★ (qualité = levier #1) | 2-3 j | P2 (pgvector) |
| P6 Boucle fermée | ★★★★ (vitesse réponse) | 2 j | P1, config Resend/Twilio |
| P7 Proactifs | ★★★ (constance) | 1 j | P3, P4 |
| P6+ Canal CEO (SMS Joris + préférences) | ★★★★ (mobilité, chaîne jamais bloquée) | +1 j sur P6 | P6, A2P Twilio |
| P8 Venture Launch Kit | ★★★ (poids mental, apprentissage) | 2 j | P5 (outcomes→RAG) |
| P9 Réorg dashboard | ★★★ (adoption quotidienne) | 2-3 j | P3 |
| P10 Argus (veille IA) | ★★★ (avantage informationnel composé) | 1-2 j | P4 (ladder), P7 (cron) |
| P11 Graphe d'orchestration exécutable | ★★★★ (différenciation + tokens) | 3-4 j | P3 |

**Chemin critique : P1 → P2 → P3 → P6/P6+ , avec P4/P5/P7 en intercalaire, puis P8/P9.**
Horizon réaliste : ~2 semaines de build discipliné, livré par vagues mergeables.

## Garde-fous inchangés

Aucune pièce ne modifie les invariants : `requiresManualSend` et
`noExecutionAuthorized` forcés à `true`, clic CEO = seul déclencheur d'envoi,
ledger avant dispatch, SMS froid Red structurel, promotions de modèles manuelles.
Le HQ devient proactif dans la **préparation et la suggestion** — jamais dans
l'exécution externe.
