# 0024 — Vérification live post-apply (2026-08-04)

> Artefact de confirmation exigé par `ARCHITECTURE.md` (« Current state of the
> rail ») et par le runbook
> [`0024-execution-intents-live-apply.md`](./0024-execution-intents-live-apply.md).
> Exécutée sur mandat CEO explicite « GO APPLY 0024 LIVE SUR ORIA.HQ »
> (2026-08-04), via le connecteur Supabase officiel (lecture seule — aucun
> write n'a été nécessaire).

## Constat principal

**La migration `agent_execution_intents` était DÉJÀ appliquée sur le projet
live `Oria.hq`** (`cpwerynafcszwagroeek`, us-east-1) : version
`20260619022503`, appliquée le **2026-06-19**, avec `security_hardening`
(0025, `20260619023056`) dans la foulée. Aucun apply n'a donc été exécuté ce
jour — le mandat GO a été satisfait par la **vérification formelle** ci-dessous.

## Résultats du verify (`0024_agent_execution_intents_verify.sql`)

Exécuté en lecture seule le 2026-08-04, projet `ACTIVE_HEALTHY` (restauré de
pause le même jour sur mandat CEO « GO restore Oria.hq »).

| Check | Attendu | Constaté | Verdict |
|---|---|---|---|
| 1. Table `public.agent_execution_intents` | 1 ligne | 1 | ✅ |
| 2. CHECK statut | pending/executing/executed/failed | conforme, mot pour mot | ✅ |
| 3. CHECK gouvernance | `requires_ceo_approval = true` | conforme | ✅ |
| 4. RLS activée | `true` | `true` | ✅ |
| 5. Policies RESTRICTIVE | 8 (anon+authenticated × CRUD) | 8 | ✅ |
| 6. Unicité workspace+intent | `…_unique_per_workspace` | présent | ✅ |
| 7. Index | workspace_id, workspace_status, workspace_created, created_at | tous présents (+ pkey, unique) | ✅ |
| Volume | — | 0 ligne (rail jamais utilisé en live) | ℹ️ |

**Conclusion : le rail d'exécution est persisté et conforme au contrat en
production.** Le paragraphe « treat it as not applied until confirmed » de
`ARCHITECTURE.md` est caduc — mis à jour dans le même commit.

## Observations annexes (aucune action ce jour)

- **Advisor sécurité Supabase** : 1 seul WARN — « Leaked Password Protection
  Disabled » (réglage Auth, à activer au dashboard :
  [remédiation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)).
  Aucune alerte RLS, aucune table exposée.
- **Dérive repo ↔ DB des migrations** : la DB live liste 14 migrations ; le
  repo en numérote 25. Absentes du live notamment : 0007 (calendar workspace
  scope), 0020 (ledger workspace scope), 0021 (mission persistence),
  0022/0023 (hash-chain — attendu, en shadow par mandat). À trancher une par
  une lors de leurs propres GO — rien n'indique une anomalie, mais la dérive
  doit rester consciente.
- Le projet était en pause (`INACTIVE`) avant le 2026-08-04 ; toute future
  pause de Supabase (inactivité plan gratuit) recassera la persistance
  production — à surveiller, ou passer le projet en plan payant avant le
  go-live commercial.

## Prochaine étape du rail

Le stockage est prêt ; il reste la config d'exécution (Voie B du runbook
[`MOVE1_RAIL_GO_LIVE.md`](./MOVE1_RAIL_GO_LIVE.md)) : import du workflow n8n
+ secrets (`N8N_WEBHOOK_URL`, `N8N_SECRET`, `AGENT_WEBHOOK_SIGNING_SECRET`)
côté Vercel et n8n, puis preuve E2E `npm run smoke:n8n-slice` contre le vrai
n8n.
