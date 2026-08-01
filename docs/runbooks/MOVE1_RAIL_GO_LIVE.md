# Move 1 — Go-live du rail d'exécution (checklist CEO consolidée)

> Mandat : `docs/SAAS_TRANSFORMATION.md` (Move 1 du plan de rentabilité).
> Audit d'exécution : 2026-08-01. Ce document consolide les runbooks existants
> en UNE séquence ordonnée, et sépare ce qui est **déjà vérifié** de ce que
> **seul le CEO peut faire** (secrets, Supabase, n8n, Resend — jamais touchés
> par les agents, règle `AGENTS.md`).

## Constat d'audit — deux voies vers l'action réelle

**Voie A — Send Desk (courriel gouverné, SANS n8n).** Déjà codée et testée :
file outbound → revue CEO → clic « envoyer » (`/api/outbound/send`,
`ceo_single_send`) → adaptateur Resend live → ledger. C'est le chemin le plus
court vers un premier envoi réel : il ne manque QUE la config Resend.

**Voie B — Rail général (intents + n8n, pour toute action au-delà du
courriel).** Code complet (intents → approbation → chokepoint HMAC → ledger),
workflow n8n importable (`docs/n8n/oria-execution-rail.workflow.json`, vérifié
contre n8n 2.26.6 en dry-run). Il manque : migration 0024 appliquée + envs n8n.

Ordre recommandé : **A d'abord** (premier envoi réel cette semaine), B ensuite
(élargir aux autres actions).

## État vérifié ce jour (aucune action requise)

| Vérification | Résultat |
|---|---|
| `npm run smoke:revenue` | PASS — 1 cash action CEO-ready générée |
| `npm run smoke:agent-execute` | PASS — invariant `noExecutionAuthorized` tenu |
| `npm run smoke:n8n-slice` (mode local) | PASS — slice dry-run reproductible |
| Draft 0024 + `_verify` + `_revert` + smoke jetable | Présents (`db/migrations/`, `db/smoke/`) |
| Runbooks 0024 | `0024-execution-intents-preflight.md` + `0024-execution-intents-live-apply.md` |
| Parité schéma 0024 ↔ repository | Verrouillée en CI (`agent-execution-intents-migration.test.mjs`) |
| Send Desk + adaptateur Resend | Codé, testé, fail-closed sans env (`resend-email-adapter-env.ts`) |

## Voie A — Send Desk live (courriel réel)

Actions **CEO uniquement**, dans l'ordre :

- [ ] **A1. Resend** : vérifier le domaine d'envoi dans le dashboard Resend
      (DNS SPF/DKIM). Sans domaine vérifié, la délivrabilité est morte.
- [ ] **A2. Envs production** (Vercel → Settings → Environment Variables) :
      `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (adresse du domaine vérifié),
      `CONTACT_NOTIFICATION_EMAIL`. Recommandé au même moment :
      `UPSTASH_REDIS_REST_URL`/`_TOKEN` (rate-limit multi-instance).
- [ ] **A3. Test contrôlé** : file outbound → un SEUL envoi vers ta propre
      adresse via le Send Desk → vérifier réception + entrée ledger.
- [ ] **A4. Premier lot réel** : prospects Radar/Arena → brouillons → revue →
      envois un-par-un. Jamais de batch auto : c'est le design, pas une limite.

## Voie B — Rail général (0024 + n8n)

Actions **CEO uniquement**, dans l'ordre (détails : runbook live-apply 0024) :

- [ ] **B1. GO explicite** : l'apply exige la phrase fraîche
      `GO APPLY 0024 LIVE SUR ORIA.HQ` (jamais implicite).
- [ ] **B2. Préconditions du runbook** : répétition sur Postgres jetable verte,
      confirmation read-only du projet cible (0024 absent), backup/PITR
      restaurable confirmé.
- [ ] **B3. Apply + verify** : `0024_agent_execution_intents.sql` puis
      `0024_agent_execution_intents_verify.sql` — chaque « Expected » doit
      correspondre, sinon rollback (`_revert`).
- [ ] **B4. n8n** : importer `docs/n8n/oria-execution-rail.workflow.json`,
      définir côté n8n `ORIA_WEBHOOK_SIGNING_SECRET` et
      `ORIA_N8N_WEBHOOK_SECRET`.
- [ ] **B5. Envs production Oria** : `N8N_WEBHOOK_URL` (hostname dans
      l'allowlist du binding), `N8N_SECRET`, `AGENT_WEBHOOK_SIGNING_SECRET`
      (mêmes valeurs que côté n8n).
- [ ] **B6. Preuve E2E dry-run contre le vrai n8n** :
      `N8N_WEBHOOK_URL=… N8N_SECRET=… AGENT_WEBHOOK_SIGNING_SECRET=… npm run smoke:n8n-slice`
      — matrice complète (happy/dedup/secret/route/transient) verte.
- [ ] **B7. Première action réelle** : étendre le workflow n8n d'un node d'envoi
      réel (après le node « validate/route ») pour UN type d'action, puis
      intent → approbation → exécution → ledger. Un type d'action à la fois.

## Notes de sécurité (invariants, ne pas relâcher)

- L'approbation CEO est le SEUL déclencheur du dispatch n8n ; la green-lane
  automatique ne fait aucun appel externe.
- Le chokepoint refuse de dispatcher sans `N8N_WEBHOOK_URL` + `N8N_SECRET`,
  hors allowlist hostname, ou sans binding approuvé (`webhook-registry.ts`).
- HMAC : `x-orya-signature = HMAC_SHA256(secret, "<timestamp>.<body canonique>")`
  + `x-webhook-secret` statique. Les deux se vérifient côté n8n.
- Aucun secret dans le repo ; toutes les valeurs vivent dans Vercel/n8n/Resend.

## Blocages connus de la session agent (transparence)

Les connecteurs **Supabase** et **Stripe** de la session Claude ne sont pas
autorisés (OAuth requis dans les réglages claude.ai). Conséquence : l'agent
peut préparer et vérifier tout ce qui précède, mais ne peut ni confirmer l'état
live du projet Supabase (§B2) ni créer le Payment Link Stripe (Move 2). Ces
étapes restent CEO-only tant que les connecteurs ne sont pas autorisés — ce qui
est cohérent avec la doctrine (secrets et actions irréversibles côté humain).

## Après le go-live

Premier envoi réel confirmé (Voie A) → Move 2 : Stripe Payment Link dans les
courriels d'outreach. Première action non-courriel réelle (Voie B) → Move 3 :
boucle complète sur une seule venture (`docs/SAAS_TRANSFORMATION.md`).
