# Hermès — Iterative Prep Agent (plan stratégique)

> Statut : **proposition / direction validée à affiner**. Document d'architecture.
> Aucun code applicatif n'est modifié par ce fichier. Toute implémentation suit
> le plan de livraison staggé (§9) et exige le go explicite de Michael, palier
> par palier (cf. `AGENTS.md` — pas de nouvelle phase sans mandat).

## 0. Invariant produit (non négociable)

> **Hermès prépare. Michael approuve et envoie manuellement. Aucune action
> externe automatique.**

Quel que soit le modèle, le runtime ou le déploiement :
- jamais d'email / DM / contact prospect automatique ;
- jamais de Gmail / SMTP / Resend en envoi ;
- jamais de scraping agressif ;
- jamais d'exécution externe ni de contournement de l'approbation CEO ;
- les locks `requiresCeoApproval` / `requiresManualSend` / `noExecutionAuthorized`
  restent à `true` littéral, et sont enforce par tests de scan statique + CHECK SQL.

Hermès devient un **opérateur de préparation proactif**, pas un émetteur.

---

## 1. Diagnostic du repo (état réel)

**Déjà présent et réutilisable :**

| Brique | Fichier | Réutilisation |
|--------|---------|---------------|
| Pattern persistance dual-mode (Supabase + fallback in-memory dev), append-only, workspace-scoped | `src/server/ventures/cash-signal-intake-repository.ts` | Modèle exact du nouveau store |
| Précédent « file de revue CEO » avec invariants forcés | `db/migrations/0011_agent_review_approval_packets.sql` | CHECK `approval_required/human_on_the_loop/no_execution_authorized = true` |
| Migrations versionnées | `db/migrations/0001 → 0012` | Continue avec `0013` |
| **Passerelle OpenRouter** (200+ modèles, 1 clé, compat OpenAI SDK) | `src/server/ai/model-config.ts` (`OPENROUTER_PREFIX`) | **Qwen / Kimi / DeepSeek / Gemma via 1 clé** |
| Routeur de modèles tiers + classif difficulté + fallback dispo + log routing | `src/server/ai/model-router.ts` | Étendre avec cascade coût + budget |
| Abstraction provider JSON + fallback chain | `src/server/ai/llm-json-provider.ts` | Ajouter le provider OpenRouter + Ollama |
| Registre de profils de modèles | `src/features/hq/seed.ts` (`ModelProfile`) | Ajouter profils + métadonnées de coût |
| Générateurs / composers purs | `llm-cash-action-packet-generator.ts`, `venture-council-cash-run-composer.ts`, `hermes-outreach-plan.ts` | Réutilisés tels quels par le tick |

**Le gap réel :**
- ❌ Aucun **store d'actions préparées** : la page `/hq/ventures/cash-actions` génère tout
  à la volée à chaque ouverture (`force-dynamic` + appel Anthropic par render). Pas
  d'historique, pas de dédup, pas de file.
- ❌ Aucun **worker itératif**.
- ⚠️ Supabase prod / migrations **probablement pas appliqués**. En prod le fallback
  in-memory est **désactivé** (`NODE_ENV=production`) → sans Supabase, le store *throw*.

---

## 2. Principe directeur : INVERSER le flux

Aujourd'hui : `page ouverte → appel LLM → affichage jetable`.

Cible : `worker prépare en continu → écrit une file durable → la page LIT`.

Gains : historique + dédup + priorisation gratuits ; coût/latence LLM retirés de
l'ouverture de page ; quand Michael ouvre `oria-hq.cloud` sur son cell, **le travail
est déjà prêt**. C'est l'objectif final.

```
                 ┌──────────────────────────────┐
   cron (pm2) ──▶│  hermes-prep-worker (node)   │  wrapper mince
                 └───────────────┬──────────────┘
                                 │ appelle
                 ┌───────────────▼──────────────┐
                 │  hermesPrepTick()  (pur)     │  testable, réutilisable
                 │  scan ventures → packets →   │  par worker ET API on-demand
                 │  council → hermes plan →     │
                 │  prioriser → dédup → enqueue │
                 └───────────────┬──────────────┘
                                 │ append-only, workspace-scoped
                 ┌───────────────▼──────────────┐
                 │ prepared_actions repository  │  clone de 0011/0012
                 │ CHECK no_execution = true …  │
                 └───────────────┬──────────────┘
                                 │ lit seulement
                 ┌───────────────▼──────────────┐
   oria-hq.cloud │  Next.js app (pm2 oria-hq)   │  page = READER pur
   (Nginx+TLS)   │  /hq/ventures/cash-actions   │  + copy / manual-send only
                 └──────────────────────────────┘
```

---

## 3. L'Iterative Prep Agent (le « cerveau » de boucle)

Pas un daemon `setInterval`. Un **tick idempotent** déclenché par cron, robuste :

- **Lock** : un seul tick à la fois (verrou en base ou fichier de lock). Pas de
  chevauchement.
- **Budget / cooldown par venture** : ne retravaille pas une venture avant un délai
  minimal ; respecte une enveloppe de tokens (cf. §6).
- **Dédup par hash de contenu** : `hash(ventureId + offer + targetBuyer + channel)`.
  Si une action équivalente est déjà en file → **supersede** (rafraîchit) au lieu de
  dupliquer.
- **Append-only events + projection « file courante »** : tout l'historique est gardé ;
  l'UI lit la projection.
- **Priorisation** : score par `expectedCashImpact × confiance ÷ coût`, réutilisant
  `venture-cash-score.ts` / `executive-selection-index.ts` existants.

Pseudo-cycle d'un tick :

```
hermesPrepTick():
  if !acquireLock(): return            # un tick à la fois
  budget = loadTokenBudget()           # enveloppe restante (§6)
  ventures = listActiveVentures()
  for v in prioritize(ventures):
    if onCooldown(v) or budget.exhausted(): continue
    packet  = generateOrRefreshPacket(v, router, budget)   # cascade modèles §5
    council = composeVentureCouncilCashRun(packet)         # pur, no LLM
    plan    = buildHermesOutreachPlanFromCashActionPacket(packet)  # pur
    h = contentHash(packet)
    if queueHas(h): supersede(h, packet, council, plan)
    else:           enqueue(prepared_action{packet, council, plan, status:"ready_for_ceo_review"})
    recordSpend(budget)
  releaseLock()
  writeLastRunStamp()
```

---

## 4. Store durable des actions préparées (`prepared_actions`)

Calqué sur `0011`/`0012`. Migration `0013`. Append-only, RLS owner-only, workspace-scoped.

Champs clés :
- `id`, `workspace_id`, `user_id`, `venture_id`
- `content_hash` (dédup), `supersedes_id` (chaîne d'historique)
- `packet` jsonb, `council` jsonb, `hermes_plan` jsonb
- `priority` (`critical|high|medium|low`), `priority_score` numeric
- `status` (`prepared|ready_for_ceo_review|approved_for_manual_send|rejected|superseded`)
- `model_trace` jsonb (quels modèles/coûts ont produit l'action — observabilité §6)
- `created_at`, `expires_at?`
- **Invariants forcés (CHECK = true)** : `requires_ceo_approval`, `requires_manual_send`,
  `no_execution_authorized`.

Repository dual-mode identique au pattern existant (Supabase service-role + fallback
in-memory dev + garde prod stricte + seam `__clientFactory` pour tests).

---

## 5. Stratégie multi-modèles (Qwen / Kimi / DeepSeek / Gemma / Ollama / Claude)

### 5.1 Comment ils se branchent (sans réécrire de clients)

- **OpenRouter (1 clé)** → Qwen, Kimi K2, DeepSeek, Gemma, Llama, + Claude/GPT/Gemini en
  secours. Compatible SDK OpenAI : il suffit d'un client OpenRouter (swap `baseURL`)
  ajouté à `llm-json-provider.ts`, et de profils dans `seed.ts`.
- **Ollama (local VPS)** → modèles ouverts en coût marginal nul. ⚠️ **Réalité VPS
  Hostinger = CPU, pas de GPU** : viable seulement pour **petits** modèles (Gemma 2 2B,
  Qwen2.5 3B, Phi-3). **Décision produit (verrouillée)** : Ollama **ne remplace jamais**
  Anthropic/OpenAI. Il sert **uniquement de T0 local** pour tâches légères :
  - ✅ déduplication, classification, résumé court, pré-filtrage, scoring léger,
    nettoyage de texte, préparation **non critique** ;
  - ❌ jamais : décision ROI finale, plan Hermès final, outreach final, décision CEO,
    cash-impact high-risk.

  Activation conditionnée au **viability spike** (Annexe A) et à un **GO explicite**.
- **Anthropic / OpenAI directs** → déjà en place (#205/#207), gardés comme tier premium
  et secours fiable.

### 5.2 Tiers de modèles (rôle, pas marque)

| Tier | Usage | Modèles candidats | Coût marginal |
|------|-------|-------------------|---------------|
| **T0 — Local** | Churn de fond : classif, dédup, pré-tri, brouillons jetables | Ollama : Gemma 2 2B, Qwen2.5 3B, Phi-3 | ~0 (CPU VPS) |
| **T1 — Cheap API** | Volume de prep itérative : génération/refresh packets, brouillons outreach | DeepSeek V3, Qwen2.5 72B, Kimi K2, Gemma 27B (via OpenRouter) | très bas |
| **T2 — Premium** | Composition finale haute qualité, ventures à fort cash-impact, escalade après échec | Claude Sonnet/Opus, GPT-4o | élevé |

### 5.3 Cascade coût-conscient (le cœur de la stratégie)

Pour chaque tâche de génération :

```
1. Choisir le tier le moins cher adapté à l'enjeu (router §5.4).
2. Générer en JSON structuré.
3. VALIDER avec les validateurs STRICTS existants
   (validateCashActionPacket, validateHermesOutreachPlan).
4. Si valide → on garde (le moins cher qui passe gagne).
   Si invalide → escalade au tier supérieur (max 1–2 sauts).
5. Tracer modèle + coût estimé dans model_trace + ledger budget.
```

Règles d'escalade vers T2 (premium = « meilleure attention ») :
- venture dans le **top-N par cash-score** (priorité Michael, §7) ;
- `expectedCashImpact ≥ seuil` ;
- échec de validation répété sur T0/T1 ;
- demande explicite de Michael sur une action.

### 5.4 Extension du routeur existant

`model-router.ts` fait déjà tiers + classif difficulté + fallback dispo + log. On ajoute :
- les **profils** T0/T1 (Qwen/Kimi/DeepSeek/Gemma/Ollama) avec métadonnées de coût ;
- une **politique cascade** (valider→escalader) au lieu d'un seul choix ;
- un **garde budget** (stop quand l'enveloppe est épuisée) ;
- la **persistance du log de routing** (déjà « ledger-ready » dans le code).

---

## 6. Gouvernance des coûts de tokens

### 6.1 Enveloppe budgétaire

- **Plafond mensuel : modéré, 50–200 $/mois** (décision Michael). Répartition de départ
  proposée : **~70 % T1** (DeepSeek/Qwen/Kimi/Gemma pour le volume), **~20 % T2** (Claude
  pour top-N + escalades), **~10 % marge** ; **T0 hors budget** (local). Configurable en env,
  le code lit le plafond et la répartition.
- **Ledger de dépense durable** (table ou réutilisation du pattern ledger existant) :
  chaque appel logue modèle, tokens in/out, coût estimé, tâche, venture.
- **Garde dur** : quand l'enveloppe restante < seuil, le tick **n'escalade plus vers T2**
  puis **bascule T0 only**, puis **se met en pause** (jamais de dépassement silencieux).

### 6.2 Table de coûts (ordres de grandeur — **à vérifier au déploiement**, les prix bougent)

| Modèle | ~$/Mtok in | ~$/Mtok out | Tier |
|--------|-----------|------------|------|
| Ollama local (Gemma 2B / Qwen 3B) | 0 | 0 | T0 |
| DeepSeek V3 | ~0,27 | ~1,10 | T1 |
| Qwen2.5 72B | ~0,35 | ~0,40 | T1 |
| Kimi K2 | ~0,15–0,60 | ~0,15–2,50 | T1 |
| Gemma 27B | ~0,06–0,20 | ~0,06–0,20 | T1 |
| GPT-4o-mini | ~0,15 | ~0,60 | T1/T2 |
| Claude Sonnet 4.x | ~3 | ~15 | T2 |
| Claude Opus 4.x | ~15 | ~75 | T2 |

> Ces chiffres sont indicatifs (connaissance ~jan 2026) et **doivent être reconfirmés**
> via OpenRouter au moment d'implémenter. Le code lit le coût depuis les profils, donc
> mettre à jour un nombre = éditer un profil, pas du code.

### 6.3 Leviers d'économie

- Cascade « cheapest-that-validates » (§5.3).
- T0 local pour tout ce qui ne mérite pas un appel payant.
- Dédup → on ne régénère pas l'identique.
- Cooldown par venture → pas de re-travail inutile.
- **Page = reader** → fin des appels LLM à chaque ouverture (gros poste aujourd'hui).
- Prompt caching côté providers compatibles.

---

## 7. « Michael priorisé — toujours la meilleure attention »

Interprétation produit :
1. **File priorisée** : la projection trie par `priority_score` ; Michael voit
   d'abord les meilleurs moves cash, pas un flux brut.
2. **Lane premium** : les actions du **top-N par cash-score** passent par le tier T2
   (meilleure qualité) ; le reste utilise T0/T1 pour préserver le budget.
3. **CEO review queue** : statut `ready_for_ceo_review`, avec, par action, le *pourquoi*
   (recommandation Council), le plan d'outreach, le risque, le signal attendu, la preuve
   à capturer — bouton copy / manual-send uniquement.
4. **« Last prep run »** visible : Michael sait que Hermès a bien tourné.

---

## 8. Déploiement VPS Hostinger (contrôlé)

- **Étape 0 (prérequis dur) — ops DB séparé, forward-only** : provisionner **Supabase
  prod**, puis appliquer **uniquement** la migration **`0013_prepared_actions.sql`**, et
  seulement **après un GO explicite séparé du CEO**. Ne **jamais rejouer** les migrations
  précédentes en bloc — elles ne sont pas dans le périmètre de ce travail. Sans Supabase +
  0013 appliquée, le store *throw* en prod et Hermès « prépare dans le vide » ; en
  local/dev le fallback in-memory suffit (aucune migration requise pour les tests).
- **Nginx + certbot/Let's Encrypt** : `oria-hq.cloud` → `localhost:3000`.
- **pm2** :
  - `oria-hq` : `next build && next start`.
  - `hermes-prep-worker` : node script déclenché en cron (pm2 `cron_restart` ou cron système).
  - `pm2 startup` + `pm2 save` (survie au reboot).
- **Ollama** : service local pour T0 (petits modèles ; valider la RAM/CPU du plan « Mature »).
- **Secrets** : `ecosystem.config.js` + `env_file` en `chmod 600`, **jamais commité**
  (AGENTS.md règle #1). Service-role key & clés API **server-side only**, jamais client.
- **Durcissement** : `ufw` (22/80/443), SSH par clé, fail2ban. Node 22+ / npm 10+.
- **Observabilité** : chaque tick logue (ventures scannées / créées / rafraîchies /
  dédupées / profondeur file / coût) ; pm2 logs ; healthcheck ; stamp « last prep run ».
- **Rollback** :
  ```
  ssh root@<vps> "pm2 stop hermes-prep-worker && pm2 delete hermes-prep-worker"   # worker
  ssh root@<vps> "pm2 stop oria-hq && pm2 delete oria-hq"                          # app
  ```
  L'app reste debout même si le worker tombe (découplés par le store).

---

## 9. Plan de livraison staggé (petites PR, chacune verte avant la suivante)

| PR | Contenu | Touche | Dépend de | Statut |
|----|---------|--------|-----------|--------|
| **A** | `prepared_actions` : model + migration `0013` + repository dual-mode + tests (clone 0011/0012) | DB + server | — | ✅ mergé (#211) |
| **B** | `hermesPrepTick()` pur + dédup + priorisation + tests (sans LLM réel : injecté) | server | A | en cours |
| **C** | Stratégie modèles : client OpenRouter + profils T0/T1 + cascade coût + garde budget + ledger + tests | server/ai | B | à venir |
| **D** | Page cash-actions → **lit la file** au lieu de générer au load | UI | A | à venir |
| **E** | Worker entrypoint + `ecosystem.config.js` pm2 + runbook VPS + Ollama setup | scripts + docs | B,C | à venir |
| **Ops DB** (séparé) | Appliquer **uniquement** `0013_prepared_actions.sql` sur Supabase prod, **après GO explicite CEO**. Forward-only. **Ne pas** rejouer `0001→0012` en bloc. | infra | A mergé | bloqué sur GO |

Chaque PR de code : `typecheck` + `lint` + `build` + `smoke:joris` + tests ciblés verts, puis PR.
Le code (PR A→E) ne dépend **pas** de l'application prod de `0013` : tests et dev tournent
sur le fallback in-memory. L'ops DB est un acte distinct, déclenché seulement par un GO CEO.

---

## 10. Garde-fous & enforcement (par construction)

- **Scan statique d'imports** (même pattern que les modules purs actuels) sur le worker,
  le tick et le store : interdiction de `resend / nodemailer / smtp / gmail`, d'exécution
  runtime, d'auto-send.
- **CHECK SQL** : invariants `= true` en base (impossible de persister une action exécutable).
- **Validateurs stricts** réutilisés dans la cascade (une sortie LLM invalide n'entre
  jamais dans la file).
- **Aucune capacité d'envoi dans le bundle worker** : Hermès ne *peut* pas envoyer.

---

## 11. Décisions (état)

1. ✅ **Plafond budgétaire** : modéré **50–200 $/mois**, split ~70 % T1 / ~20 % T2 / ~10 % marge.
2. ✅ **Premier palier d'impl** : doc en PR, puis **PR A (store `prepared_actions`)**.
3. ✅ **Ollama** : strictement T0, hors produit sans GO ; soumis au **viability spike** (Annexe A).
4. ⏳ **Specs du VPS « Mature »** (vCPU / RAM / swap / disque / GPU) → à fournir pour le spike.
5. ⏳ **Cadence du tick** (15 / 30 / 60 min) et **top-N** premium → à trancher en PR B/C.
6. ⏳ **Compte OpenRouter** : 1 clé à provisionner (couvre Qwen/Kimi/DeepSeek/Gemma) → PR C.
7. ⏳ **Domaine** `oria-hq.cloud` : DNS déjà pointé sur le VPS ? → PR E.

---

## Annexe A — Ollama viability spike (runbook)

**But** : décider si Ollama vaut la peine comme couche **T0 locale** sur le VPS Mature.
**Hors produit** : aucune intégration code, aucun GO implicite. Résultat = recommandation
**GO T0 local** / **NO-GO maintenant** / **WAIT (VPS plus gros / GPU)**.

### Garde-fous du spike
- `localhost` only (`OLLAMA_HOST=127.0.0.1`), **aucun port Ollama exposé Internet**.
- Ne remplace pas Anthropic/OpenAI. Pas de branchement produit sans nouveau GO.
- Pas de changement DB, pas de migration, pas de runtime externe, pas d'auto-send, pas de scraping.

### Étape 1 — Diagnostic VPS (lecture seule)
```bash
nproc                                   # vCPU
free -h                                 # RAM totale/dispo + swap
df -h /                                 # disque libre
lscpu | grep -i 'model name'            # CPU
(command -v nvidia-smi && nvidia-smi) || lspci | grep -iE 'vga|3d|nvidia'   # GPU ?
uptime                                  # charge CPU
ss -tulpn                               # ports ouverts
pm2 list                                # process actuels (oria-hq ?)
```

### Étape 2 — Matrice de décision
| Specs | Décision |
|-------|----------|
| GPU présent | Ollama potentiellement utile → PoC |
| CPU-only + RAM ≥ 16 Go | PoC avec petit modèle 1B–3B |
| CPU-only + RAM 8–15 Go | PoC très limité seulement |
| RAM < 8 Go | **Pas d'Ollama maintenant** (NO-GO) |

### Étape 3 — PoC (si specs acceptables)
```bash
# Install (binaire officiel)
curl -fsSL https://ollama.com/install.sh | sh
export OLLAMA_HOST=127.0.0.1            # localhost only

ollama pull gemma2:2b                   # ou qwen2.5:3b — UN petit modèle seulement

# Mesure : temps de réponse + ressources sur 5–10 appels courts
for i in $(seq 1 8); do
  /usr/bin/time -v ollama run gemma2:2b "Classe ce texte en 1 mot: pipeline reconciliation" 2>> /tmp/ollama_spike.log
done
free -h ; uptime                        # RAM utilisée + charge après les appels
```
Mesurer : temps de réponse, tokens/sec approx, RAM utilisée, CPU load, **impact sur le
Next.js (`pm2 list` / latence app)**, stabilité après 5–10 appels.

### Étape 4 — Résultat attendu
Recommandation nette : **GO T0 local** / **NO-GO Ollama maintenant** / **WAIT (VPS plus gros/GPU)**,
chiffres à l'appui.

### Stop & désinstallation propre (si PoC installé)
```bash
sudo systemctl stop ollama 2>/dev/null; sudo systemctl disable ollama 2>/dev/null
sudo rm -f /usr/local/bin/ollama
sudo rm -rf /usr/share/ollama /usr/lib/ollama
rm -rf ~/.ollama                         # modèles téléchargés
sudo userdel ollama 2>/dev/null || true  # si l'install a créé un user dédié
```
> Recommandation par défaut si VPS Mature = CPU-only avec RAM modeste : **commencer
> sans Ollama** (full OpenRouter T1, déjà très bon marché), ajouter T0 local seulement
> après un spike GO.

---

## 12. Résumé exécutif

On transforme Hermès d'une « page intelligente » en **opérateur de préparation
proactif, durable et économe** :
- flux inversé (worker prépare → file durable → page lit) ;
- tick idempotent (lock + budget + dédup + priorisation) ;
- store append-only avec invariants de sécurité forcés ;
- stratégie multi-modèles en **cascade coût-conscient** (Ollama local → OpenRouter
  cheap → premium), Michael toujours servi par la meilleure attention sur les meilleurs
  moves ;
- gouvernance de budget tokens avec garde dur ;
- déploiement VPS découplé (app + worker) sous pm2/Nginx/TLS ;
- **zéro envoi automatique**, garanti par construction.
