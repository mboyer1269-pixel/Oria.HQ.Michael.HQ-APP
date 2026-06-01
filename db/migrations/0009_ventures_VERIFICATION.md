# Runbook — Appliquer & vérifier la migration `0009_ventures`

Procédure pour **activer** la persistance Supabase des cartes ventures en
production. Tant que la migration n'est pas appliquée, le repository
(`src/server/ventures/venture-repository.ts`) tourne en **fallback in-memory**
(dev/test) ou **throw « loud »** (prod sans Supabase). Une fois appliquée +
Supabase configuré, les ventures sont persistées durablement dans
`public.ventures`.

> ⚠️ **C'est le CEO (Michael) qui applique la migration.** Les commentaires des
> migrations du repo disent « Do NOT apply without an explicit CEO GO ».
> Claude **prépare et vérifie**, mais n'applique rien sur la base live.
>
> ℹ️ Ce PR (PR148) livre la **fondation** : migration gated + repository +
> fallback. **Aucune UI n'écrit encore** dans ce store ; le câblage en écriture
> viendra dans un PR ultérieur.

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
  - Migration : [`0009_ventures.sql`](0009_ventures.sql)
  - Vérif (lecture seule) : [`0009_ventures_verify.sql`](0009_ventures_verify.sql)

---

## 1. Pré-flight (avant d'appliquer)

Confirme que la table n'existe pas encore (migration jamais appliquée) :

```sql
select to_regclass('public.ventures') is not null as already_applied;
```

- `already_applied = false` → continue à l'étape 2.
- `already_applied = true` → la migration est **déjà** appliquée ; saute à
  l'étape 3 (vérification) — `create table if not exists` la rend idempotente,
  donc ré-exécuter ne casse rien, mais inutile.

Aucun backup nécessaire : c'est une **table neuve**, additive, sans impact sur
les tables existantes.

---

## 2. Appliquer la migration

Copie l'intégralité de [`0009_ventures.sql`](0009_ventures.sql) dans le SQL
editor Supabase et exécute. (Ou via le MCP : `apply_migration` avec le nom
`0009_ventures` et le contenu du fichier.)

La migration est idempotente : `create table if not exists`, `create index if
not exists`. Les `create policy` ne sont **pas** idempotents — si tu réappliques
sur une base où les policies existent déjà, droppe-les d'abord (voir le bloc
rollback en fin de migration) ou ignore l'erreur « policy already exists ».

---

## 3. Vérifier (lecture seule — OBLIGATOIRE)

Exécute [`0009_ventures_verify.sql`](0009_ventures_verify.sql). Résultats
attendus :

| # | Contrôle | Attendu |
|---|----------|---------|
| 1 | `table_exists` | `true` |
| 2 | `rls_enabled` | `true` |
| 3 | Policies | **8 lignes**, `permissive = RESTRICTIVE`, rôles ∈ {anon, authenticated}, couvrant select/insert/update/delete |
| 3b | `permissive_open_policies` | `0` (aucune policy ouvrante) |
| 3c | `service_role_policies` | `0` (service_role jamais nommé) |
| 4 | CHECK | `ventures_workspace_id_check`, `ventures_status_check` (whitelist des 12 statuts), `ventures_source_check` (whitelist des 5 sources) présents |
| 5 | Index | `workspace_id`, `(workspace_id, status)`, `(workspace_id, updated_at desc)`, `updated_at` + la PK |
| 6 | `ventures_rowcount` | un nombre (`0` sur table fraîche) |

❌ Si un seul contrôle dévie → **ne pas déployer** ; investiguer (souvent : RLS
non activée, ou une policy permissive ajoutée par erreur).

---

## 4. Audit de sécurité Supabase (advisors)

Lance les advisors sécurité (Dashboard → Advisors, ou MCP Supabase
`get_advisors` avec `type: "security"`).

- Attendu : **aucune** nouvelle alerte du type « RLS disabled on public table »
  ou « policy allows public access » concernant `ventures`.
- La table doit apparaître avec RLS activée et accès anon/authenticated bloqué.

---

## 5. Rollback

Si besoin de revenir en arrière, exécute le **bloc rollback** documenté en fin
de [`0009_ventures.sql`](0009_ventures.sql) (drop des policies → index → table).
Sans config Supabase, l'app repasse automatiquement en fallback in-memory —
aucune action code requise.

---

## Checklist de sign-off

- [ ] Migration `0009` appliquée (étape 2).
- [ ] `verify.sql` : les 6 contrôles passent (étape 3).
- [ ] Advisors sécurité : aucune alerte RLS sur `ventures` (étape 4).
- [ ] `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` présents au runtime prod.
- [ ] (Plus tard) Câblage UI en écriture livré dans un PR dédié.
- [ ] GO déploiement.
