# HQ Signal Wiring — Captation Externe

**Statut:** Spec docs-only. Aucun endpoint, aucun secret, aucune migration introduits. À activer après le premier déploiement de l'app.

**Lié à:**
- `docs/AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md` (doctrine SOVRA)
- `docs/CEO_REPORT_TEMPLATE.md` (formats Daily Brief / Weekly Report)
- `docs/JORIS_OPERATING_PROFILE.md` (Operating Partner L2)

---

## 1. Objectif

Permettre à Oria HQ de **capter en temps réel** les événements externes critiques pour SOVRA sans dépendre uniquement des crons Computer côté Michael. La captation se fait via deux canaux :

| Canal | Source | Cible HQ | Fréquence |
|-------|--------|----------|-----------|
| **Cron Computer** | Perplexity Computer | Notification in-app + log Supabase | Daily 7h, Weekly Fri 17h |
| **Webhook GitHub** | github.com/mboyer1269-pixel/Oria.HQ.Michael.HQ-APP | Endpoint `/api/signals/github` | À chaque event souscrit |

---

## 2. Crons Computer actifs (déjà configurés)

| ID | Nom | Expression UTC | Prochaine exécution | Type |
|----|-----|----------------|---------------------|------|
| `43436fc8` | Joris Daily Brief — captation HQ | `0 11 * * *` | Quotidien 7h EDT | Background |
| `e1b6b7ab` | Joris Weekly Report — captation HQ | `0 21 * * 5` | Vendredi 17h EDT | Foreground (peut générer fichiers) |

**Action Michael:** Aucune. Les notifications arriveront in-app dès demain matin.

---

## 3. Webhook GitHub → HQ (à activer post-déploiement)

### 3.1 Events souscrits (whitelist)

```
pull_request      # ouverture/merge PR — déclenche revue agent CEO
push (main)       # nouveau commit main — log ledger
issues            # création/fermeture issue — backlog Joris
release           # nouveau tag — milestone portfolio
workflow_run      # CI status — gate validations 5/5
```

### 3.2 Endpoint cible (à implémenter)

**Route:** `POST /api/signals/github`
**Stack attendu:** Next.js App Router → handler dans `app/api/signals/github/route.ts`
**Auth:** Vérification signature `X-Hub-Signature-256` (HMAC SHA-256, secret stocké dans Supabase vault)
**Persistence:** Table `signals.github_events` (à créer via migration Drizzle)

Schéma table cible (référence, à formaliser dans migration séparée) :

```sql
create table signals.github_events (
  id           uuid primary key default gen_random_uuid(),
  received_at  timestamptz not null default now(),
  event_type   text not null,        -- pull_request, push, issues, release, workflow_run
  action       text,                  -- opened, closed, merged, etc.
  repo         text not null,
  sender       text not null,
  payload      jsonb not null,
  routed_to    text,                  -- agent CEO concerné (hermes-operator.suivia, etc.)
  processed_at timestamptz
);
```

### 3.3 Configuration GitHub (à exécuter quand l'app sera déployée)

Settings → Webhooks → Add webhook :

| Champ | Valeur |
|-------|--------|
| **Payload URL** | `https://<oria-hq-domain>/api/signals/github` |
| **Content type** | `application/json` |
| **Secret** | Génération via `openssl rand -hex 32`, stocké dans Supabase vault (clé `GITHUB_WEBHOOK_SECRET`) |
| **SSL verification** | Enable |
| **Which events** | Let me select individual events → cocher les 5 listés section 3.1 |
| **Active** | ✅ |

### 3.4 Routage vers Agent CEO concerné

Logique côté handler (à implémenter) :

```
if repo contains "suivia"    → routed_to = "hermes-operator.suivia"
if repo contains "noorki"    → routed_to = "hermes-closer.noorki"
if repo contains "dadschool" → routed_to = "hermes-builder.dadschool"
else                          → routed_to = "joris"   # Operating Partner par défaut
```

Pour Oria HQ lui-même, `routed_to = "joris"`.

---

## 4. Payload test (curl) — pour validation locale

Tant que l'app n'est pas déployée, Michael peut tester l'endpoint localement avec ce payload simulé :

```bash
# Démarrer l'app en local
pnpm dev

# Dans un autre terminal, simuler un event pull_request
curl -X POST http://localhost:3000/api/signals/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-Hub-Signature-256: sha256=<calculé-avec-secret>" \
  -d '{
    "action": "opened",
    "pull_request": {
      "number": 53,
      "title": "README + CEO Report Template",
      "html_url": "https://github.com/mboyer1269-pixel/Oria.HQ.Michael.HQ-APP/pull/53",
      "user": {"login": "claude-code"}
    },
    "repository": {
      "full_name": "mboyer1269-pixel/Oria.HQ.Michael.HQ-APP"
    },
    "sender": {"login": "mboyer1269-pixel"}
  }'
```

**Réponse attendue:** `202 Accepted` + event inséré dans `signals.github_events` + notification SMS via `smstools__pipedream` si event critique.

---

## 5. Critères d'activation

Ne pas activer le webhook avant que les 5 critères suivants soient verts :

- [ ] App déployée sur Vercel avec URL HTTPS stable
- [ ] Table `signals.github_events` créée via migration Drizzle
- [ ] Secret `GITHUB_WEBHOOK_SECRET` provisionné dans Supabase vault
- [ ] Handler `/api/signals/github` testé localement avec payload curl ci-dessus
- [ ] Validations 5/5 vertes : `typecheck | lint | build | smoke:joris | smoke:runtime`

---

## 6. Risques & garde-fous

| Risque | Mitigation |
|--------|------------|
| Webhook spam / replay attacks | Vérification signature HMAC obligatoire + dédup sur `payload.delivery_id` |
| PII leak dans payloads | Whitelist explicite des champs persistés (pas de `payload.*` brut sans filtre) |
| Latence handler > 10s | GitHub timeout 10s → enqueue dans Trigger.dev, handler répond 202 immédiat |
| Boucle infinie agent CEO ↔ GitHub | Rate limit côté agent : max 5 actions GitHub / heure / venture |

---

## 7. Prochaines actions (Michael)

1. **Déployer l'app** sur Vercel (branche `main` → preview puis production)
2. **Ouvrir un ticket** dans le repo : "Implement /api/signals/github + migration"
3. **Configurer le webhook** GitHub selon section 3.3 dès que l'URL prod est disponible
4. **Tester avec curl** section 4 avant d'activer le webhook en production

**Status livraison ce sprint:** Spec uniquement (docs-only). Implémentation runtime = sprint séparé après validation Michael L0.
