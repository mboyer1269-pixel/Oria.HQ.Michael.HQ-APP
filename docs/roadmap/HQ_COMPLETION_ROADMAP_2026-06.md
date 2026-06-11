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

### P1 — Le Pont (Vague A+) — EN COURS
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

## Matrice de décision

| Pièce | Impact revenue | Effort | Dépend de |
|---|---|---|---|
| P1 Pont | ★★★★★ direct | 1-2 j | rien — EN COURS |
| P2 Durabilité | ★★★★ (confiance) | 1 j + GO migrations | P1 |
| P3 Decision Spine | ★★★★★ (cadence) | 2 j | P1 (signaux pipeline) |
| P4 Cost Ladder + Watch | ★★ (échelle) | 1-2 j | rien |
| P5 RAG | ★★★★ (qualité = levier #1) | 2-3 j | P2 (pgvector) |
| P6 Boucle fermée | ★★★★ (vitesse réponse) | 2 j | P1, config Resend/Twilio |
| P7 Proactifs | ★★★ (constance) | 1 j | P3, P4 |

**Chemin critique : P1 → P2 → P3 → P6, avec P4/P5/P7 en intercalaire.**
Horizon réaliste : ~2 semaines de build discipliné, livré par vagues mergeables.

## Garde-fous inchangés

Aucune pièce ne modifie les invariants : `requiresManualSend` et
`noExecutionAuthorized` forcés à `true`, clic CEO = seul déclencheur d'envoi,
ledger avant dispatch, SMS froid Red structurel, promotions de modèles manuelles.
Le HQ devient proactif dans la **préparation et la suggestion** — jamais dans
l'exécution externe.
