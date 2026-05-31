# Runbook — Appliquer & vérifier la migration `0008_governance_decisions`

Procédure pour **activer** la persistance Supabase des décisions de gouvernance
en production. Tant que la migration n'est pas appliquée, le repository
(`src/server/joris/governance-decision-repository.ts`) tourne en **fallback
in-memory** (dev/test) ou **throw « loud »** (prod sans Supabase). Une fois
appliquée + Supabase configuré, les décisions sont persistées durablement dans
`public.governance_decisions`.

> ⚠️ **C'est le CEO (Michael) qui applique la migration.** Les commentaires des
> migrations du repo disent « Do NOT apply without an explicit CEO GO ».
> Claude **prépare et vérifie**, mais n'applique rien sur la base live.

---

## 0. Pré-requis

- Accès au projet Supabase (SQL editor, ou le MCP Supabase `apply_migration` /
  `execute_sql`).
- Pour que l'app utilise réellement Supabase (et pas le fallback), ces variables
  d'environnement serveur doivent être présentes au runtime (ne **pas** les
  committer, ne pas toucher `.env` ici) :
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Fichiers concernés :
  - Migration : [`0008_governance_decisions.sql`](0008_governance_decisions.sql)
  - Vérif (lecture seule) : [`0008_governance_decisions_verify.sql`](0008_governance_decisions_verify.sql)

---

## 1. Pré-flight (avant d'appliquer)

Confirme que la table n'existe pas encore (migration jamais appliquée) :

```sql
select to_regclass('public.governance_decisions') is not null as already_applied;
```

- `already_applied = false` → continue à l'étape 2.
- `already_applied = true` → la migration est **déjà** appliquée ; saute à
  l'étape 3 (vérification) — `create table if not exists` la rend idempotente,
  donc ré-exécuter ne casse rien, mais inutile.

Aucun backup nécessaire : c'est une **table neuve**, additive, sans impact sur
les tables existantes.

---

## 2. Appliquer la migration

Copie l'intégralité de [`0008_governance_decisions.sql`](0008_governance_decisions.sql)
dans le SQL editor Supabase et exécute. (Ou via le MCP : `apply_migration` avec
le nom `0008_governance_decisions` et le contenu du fichier.)

La migration est idempotente : `create table if not exists`, `create index if
not exists`. Les `create policy` ne sont **pas** idempotents — si tu réappliques
sur une base où les policies existent déjà, droppe-les d'abord (voir le bloc
rollback en fin de migration) ou ignore l'erreur « policy already exists ».

---

## 3. Vérifier (lecture seule — OBLIGATOIRE)

Exécute [`0008_governance_decisions_verify.sql`](0008_governance_decisions_verify.sql).
Résultats attendus :

| # | Contrôle | Attendu |
|---|----------|---------|
| 1 | `table_exists` | `true` |
| 2 | `rls_enabled` | `true` |
| 3 | Policies | **8 lignes**, `permissive = RESTRICTIVE`, rôles ∈ {anon, authenticated}, couvrant select/insert/update/delete |
| 3b | `permissive_open_policies` | `0` (aucune policy ouvrante) |
| 3c | `service_role_policies` | `0` (service_role jamais nommé) |
| 4 | CHECK | `outcome_check` (whitelist des 5 outcomes), `human_on_the_loop_check`, `no_execution_check` présents |
| 5 | Index | `workspace_id`, `(workspace_id, work_order_id)`, `(workspace_id, decided_at desc)`, `created_at` + la PK |
| 6 | `governance_decisions_rowcount` | un nombre (`0` sur table fraîche) |

❌ Si un seul contrôle dévie → **ne pas déployer** ; investiguer (souvent : RLS
non activée, ou une policy permissive ajoutée par erreur).

---

## 4. Audit de sécurité Supabase (advisors)

Lance les advisors sécurité (Dashboard → Advisors, ou MCP Supabase
`get_advisors` avec `type: "security"`).

- Attendu : **aucune** nouvelle alerte du type « RLS disabled on public table »
  ou « policy allows public access » concernant `governance_decisions`.
- La table doit apparaître avec RLS activée et accès anon/authenticated bloqué.

---

## 5. (Optionnel) Smoke applicatif end-to-end

Pour confirmer que le **chemin Supabase dual-mode** fonctionne réellement
(au-delà du schéma), avec `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
définis, déclenche un cycle preview → « Approuve pour le plan » via Joris dans un
workspace de test, puis vérifie l'insertion :

```sql
-- Lecture seule : confirme qu'une décision a bien été écrite côté Supabase.
select id, workspace_id, work_order_id, outcome, human_on_the_loop,
       no_execution_authorized, decided_at
from public.governance_decisions
order by created_at desc
limit 5;
```

- Attendu : la décision rendue apparaît, `human_on_the_loop = true`,
  `no_execution_authorized = true`, `outcome` cohérent (`approved_to_plan`, …).

Nettoyage du smoke (ne supprime QUE le workspace de test) :

```sql
delete from public.governance_decisions where workspace_id = '<ton-workspace-de-test>';
```

> Le smoke écrit dans la table : fais-le sur un workspace jetable, puis nettoie.

---

## 6. Rollback

Si besoin de revenir en arrière, exécute le **bloc rollback** documenté en fin
de [`0008_governance_decisions.sql`](0008_governance_decisions.sql) (drop des
policies → index → table). Sans config Supabase, l'app repasse automatiquement
en fallback in-memory — aucune action code requise.

---

## Checklist de sign-off

- [ ] Migration `0008` appliquée (étape 2).
- [ ] `verify.sql` : les 6 contrôles passent (étape 3).
- [ ] Advisors sécurité : aucune alerte RLS sur `governance_decisions` (étape 4).
- [ ] (Optionnel) Smoke applicatif : décision visible côté Supabase puis nettoyée (étape 5).
- [ ] `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` présents au runtime prod.
- [ ] GO déploiement.
