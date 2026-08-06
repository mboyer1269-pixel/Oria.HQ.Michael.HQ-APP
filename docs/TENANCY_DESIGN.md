# Tenancy multi-clients — conception et chemin de migration (S2)

> Phase S2 de `docs/SAAS_TRANSFORMATION.md`, sur mandat CEO explicite
> (2026-08-04). Ce document est la note de conception de la tenancy : le
> contrat d'accès, le stockage, et surtout **le chemin de migration** depuis le
> modèle mono-propriétaire actuel.
>
> État : **S2a livré** (domaine + migration draft + ce document). S2b (identité
> de session) et S2c (onboarding) attendent leurs propres mandats.

---

## 1. Le point de départ (constat d'audit)

| Élément | État actuel |
|---|---|
| Identité | `MICHAEL_HQ_OWNER_ID` (variable d'env), `src/server/auth/user-context.ts` |
| Workspace | Constante de config unique, `src/core/workspaces/registry.ts` |
| Autorisation | `isOwnerUser()` — comparaison à l'owner d'env (`src/server/auth/owner.ts`) |
| Contexte requête | `getActiveWorkspaceContext()` — **synchrone**, **99 sites d'appel** |
| `workspace_id` en base | Colonnes **`text`** contenant un slug (`'michael-hq'`) |

Deux contraintes dominent toute la conception :

1. **`getActiveWorkspaceContext()` est synchrone et appelé 99 fois.** Dériver
   l'identité d'une session Supabase est intrinsèquement asynchrone
   (`supabase.auth.getUser()`). Basculer la signature en `async` casse 99 sites
   d'un coup — inacceptable en une PR.
2. **Le `workspace_id` persisté est un slug `text`, pas un uuid.** Toute table
   de workspaces doit s'articuler avec ce monde existant sans le convertir à
   chaud.

---

## 2. Le contrat d'accès (livré — `src/core/workspaces/membership.ts`)

Couche de domaine **pure** : aucune I/O, aucun env, aucune horloge. Elle répond
à deux questions et rien d'autre : *dans quel workspace cet utilisateur peut-il
agir ?* et *qu'a-t-il le droit d'y faire ?*

### Rôles et capacités

| Capacité | owner | admin | operator | viewer |
|---|:--:|:--:|:--:|:--:|
| `workspace.read` | ✅ | ✅ | ✅ | ✅ |
| `missions.write` | ✅ | ✅ | ✅ | — |
| `agents.run` | ✅ | ✅ | ✅ | — |
| `workspace.manage` | ✅ | ✅ | — | — |
| `members.manage` | ✅ | ✅ | — | — |
| `execution.approve` | ✅ | — | — | — |

**`execution.approve` est owner-only par conception.** Approuver un execution
intent est la seule action qui transforme une sortie d'agent en effet réel ; le
modèle de gouvernance (`humanOnTheLoop`) exige **un seul humain responsable**.
Un `admin` opère le workspace au quotidien mais n'hérite jamais du sceau
d'approbation. Les rôles sont strictement emboîtés (vérifié par test).

### Fail-closed, sans exception

Toute branche non nominale rend « aucun accès » — jamais un workspace par
défaut :

- adhésion `invited` ou `revoked` → aucun accès (seul `active` compte) ;
- rôle inconnu → **zéro** capacité ;
- liste d'adhésions vide → `no_membership` ;
- **workspace demandé dont l'utilisateur n'est pas membre → `not_a_member`,
  jamais un repli silencieux.** C'est le point critique : un repli
  transformerait une URL erronée en lecture cross-tenant.

17 tests adverses couvrent ces chemins (`membership.test.mjs`), écrits du point
de vue de l'attaquant.

---

## 3. Le stockage (livré en **draft** — migration 0026, non appliquée)

`db/migrations/0026_workspaces_and_members.sql` (+ `_revert`, `_verify`).

### Articulation avec l'existant — le point le plus important

```
  workspaces.slug  (text, unique)  ←── clé de jointure avec le monde existant
        │                               (action_ledger.workspace_id = 'michael-hq', etc.)
  workspaces.id    (uuid)          ←── clé interne pour les relations futures
        │
        └── workspace_members.workspace_id (uuid, FK, ON DELETE CASCADE)
```

**0026 ne touche AUCUNE colonne `workspace_id text` existante et n'y ajoute
aucune clé étrangère.** Convertir ces colonnes est une migration séparée, plus
risquée, qui aura son propre mandat. Appliquer 0026 seule ne change **aucun**
comportement : rien dans le produit ne lit ces tables tant que le resolver n'est
pas câblé.

### Invariants forcés au niveau du stockage

Comme 0024 force `requires_ceo_approval = true` dans la table plutôt que de
faire confiance à l'application :

- **Au plus un owner actif par workspace** — index unique partiel sur
  `(workspace_id) WHERE role='owner' AND status='active'`.
- Rôles et statuts **whitelistés par CHECK**, alignés mot pour mot sur
  `membership.ts`.
- **Une adhésion par (workspace, user)** — contrainte unique.
- **Cascade** à la suppression du workspace (aucun grant orphelin).
- **RLS activée, 8 policies restrictives par table** — accès service-role
  uniquement, comme 0013/0024/0025. Aucun accès client direct.

### Répétition sur base jetable — exécutée (2026-08-04)

Postgres 16 local, miroir fidèle de la cible (rôles `anon`/`authenticated` +
helper `set_updated_at()` recréés). Résultats :

| Test | Attendu | Résultat |
|---|---|---|
| Apply | succès | ✅ |
| `_verify` (11 checks) | tous conformes | ✅ |
| Deuxième owner actif | REJET | ✅ index partiel |
| Rôle inventé (`superadmin`) | REJET | ✅ CHECK |
| Statut inventé (`pending`) | REJET | ✅ CHECK |
| Double adhésion même user | REJET | ✅ unique |
| Workspace inexistant | REJET | ✅ FK |
| Passation d'owner (révoque + nouveau) | SUCCÈS | ✅ |
| Trigger `updated_at` | se déclenche | ✅ |
| Cascade suppression | 0 adhésion restante | ✅ |
| Cycle apply → revert → apply | complet | ✅ 16 policies restaurées |

**Constat opérationnel** : un ré-apply par-dessus un état déjà appliqué échoue
au bloc `create policy` (PostgreSQL n'offre pas `create policy if not exists`).
C'est le comportement des migrations 0013/0024/0025 — convention conservée
volontairement. Si un apply est interrompu au milieu du bloc de policies :
**jouer le `_revert` puis ré-appliquer** (chemin testé et vert).

---

## 4. Chemin de migration des 99 sites d'appel (S2b — non commencé)

Le cœur du problème : `getActiveWorkspaceContext()` est synchrone partout.

**Stratégie retenue — introduction parallèle, jamais de big-bang :**

1. Ajouter `resolveActiveWorkspaceContext(): Promise<WorkspaceContext>`
   **à côté** de la fonction synchrone existante. Elle dérive l'identité de la
   session Supabase, résout l'adhésion via `membership.ts`, et échoue closed.
2. Migrer les sites **par surface**, en commençant par les routes API
   (`src/app/api/*`, déjà `async`, coût quasi nul), puis les pages serveur
   (déjà `async` également), enfin les rares appels synchrones profonds.
3. Chaque lot est une PR avec sa validation complète ; la fonction synchrone
   reste le fallback mono-propriétaire tant qu'un site l'utilise encore.
4. Quand le compteur atteint zéro, `getServerUserContext()` devient l'unique
   chemin dev/local et la fonction synchrone est supprimée.

**Le fallback dev doit survivre** : `isDevUserFallbackAllowed()` garde le HQ
utilisable sans Supabase hors production, et la production reste fail-closed
(`ORIA_ALLOW_DEV_USER_FALLBACK` non défini → refus). Ce comportement ne change
pas.

**Garde anti-régression à ajouter en S2b** : un compteur de sites synchrones
dans `scripts/architecture/check-layering.mjs` (même mécanique que la dette #2 —
TRACKED, puis ENFORCED quand le compteur atteint zéro).

---

## 5. Ce qui reste, et sous quel mandat

| Étape | Contenu | Statut |
|---|---|---|
| **S2a** | Domaine membership + migration 0026 draft + ce document | ✅ livré |
| **Apply 0026** | Live-apply sur `Oria.hq` | ⛔ mandat CEO dédié (`GO APPLY 0026 LIVE SUR ORIA.HQ`) |
| **S2b** | `resolveActiveWorkspaceContext` async + migration des 99 sites par lots | ⛔ mandat |
| **S2c** | Onboarding signup → création workspace → seed du roster | ⛔ mandat |
| **Conversion `workspace_id`** | text slug → uuid sur les tables existantes | ⛔ mandat séparé, le plus risqué |

**Critère de sortie de S2 (mesurable)** : deux comptes de test, deux
workspaces, aucune fuite cross-workspace démontrée par des tests d'isolation
dédiés, et le parcours signup → cockpit vert de bout en bout.

---

## 6. Hypothèses explicites

- **H1** — Un owner unique par workspace suffit au lancement (pas de
  co-propriété). Un transfert de propriété reste possible : révoquer puis
  nommer, chemin testé.
- **H2** — Pas d'organisations imbriquées (un utilisateur peut être membre de
  plusieurs workspaces, mais les workspaces ne forment pas de hiérarchie).
- **H3** — L'accès aux tables reste exclusivement service-role. Des policies
  RLS scopées par membre ne seront ajoutées que si un accès client direct est
  un jour introduit — ce n'est pas le cas aujourd'hui.
- **H4** — Sans workspace demandé explicitement, la première adhésion active
  gagne. Un « dernier workspace utilisé » persistant sera nécessaire dès que
  l'UI multi-workspace existera (S2c).
