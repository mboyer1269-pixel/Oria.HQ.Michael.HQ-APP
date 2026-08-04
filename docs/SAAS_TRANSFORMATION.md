# Transformation SaaS — Audit, Architecture cible, Roadmap

> Mandat CEO (2026-07-31) : transformer Oria HQ en application SaaS complète
> pour entrepreneurs opérant des activités assistées par agents IA — inspirée
> de l'expérience « entreprise opérée par agents » (référence fonctionnelle :
> Polsia.com, sans reprise de marque, code, textes ou éléments propriétaires).
>
> Ce document est le livrable des étapes 1–5 du mandat : audit, tri
> conserver/corriger/reconstruire, architecture cible, roster d'agents,
> roadmap par phases. Chaque phase d'implémentation reste soumise aux règles
> `AGENTS.md` (validation complète avant complétion, migrations gated,
> aucune action irréversible sans approbation humaine).

---

## 1. Audit du repository (2026-07-31)

### Stack et état général

| Dimension | État constaté |
|---|---|
| Framework | Next.js 16 (App Router + Turbopack), monolithe, TypeScript 6 strict |
| UI | React 19, Tailwind 4, design system interne (`src/features/*/components`) |
| Persistance | Supabase (Postgres + RLS), 25 migrations numérotées avec `_revert`/`_verify` ; fallback in-memory hors production (fail-closed en prod) |
| Auth | Supabase session (proxy middleware) + owner unique via `MICHAEL_HQ_OWNER_ID` |
| Jobs | Inngest (signature vérifiée) + crons (`ceo-brief`, `market-scout`) |
| Exécution externe | Chokepoint unique n8n (HMAC + secret statique + allowlist hostname + rate-limit + timeout), gated par approbation CEO |
| Gouvernance | Action ledger append-only (+ hash-chain en shadow), autonomy tiers, work-orders, execution intents approve/reject |
| Tests | **3418 tests / 29 suites — 0 échec** ; 6 smokes E2E sans clés API ; typecheck 0, lint 0, build OK (vérifié ce jour) |
| CI | typecheck, lint, build, tests, smokes, `map:check`, `check:layering`, guards ledger/mission |
| Layering | `app → features → server → core/lib` ; dette #2 trackée (~49 imports server→features seed/ventures) |

### Verdict d'audit

La base n'est **pas** un prototype : c'est déjà un cockpit opérateur gouverné,
avec le rail d'exécution (intent → approbation humaine → n8n → ledger), un
moteur de classement d'opportunités (Arena + WRA), une mémoire structurée
(Memory Vault + memory graph + learning loop), un routeur de modèles à échelle
de coûts, et 10 agents avec chartes, contraintes et autonomie bornée.

**Le manque structurel pour devenir un SaaS est unique et précis : la
mono-tenance.** L'identité vient d'une variable d'environnement
(`MICHAEL_HQ_OWNER_ID`, `src/server/auth/user-context.ts`) et le workspace
d'une constante de config unique (`src/core/workspaces/registry.ts`, dont le
commentaire prévoit déjà : « replace this single-config constant with a map or
DB resolver when multiple workspaces are supported »).

### Conserver / corriger / supprimer / reconstruire

**Conserver tel quel (cœur de valeur, ne pas réécrire) :**
- Le rail d'exécution gouverné et son chokepoint n8n unique.
- L'action ledger + hash-chain (shadow), les autonomy tiers, les work-orders.
- L'Arena (génération, évaluation, classement, verdicts d'opportunités).
- Le Memory Vault et le learning loop.
- Le model router / cost ladder.
- La discipline de migrations (`_revert`/`_verify`, live-apply gated).
- Le layering et ses guards CI.

**Corriger / généraliser (sans réécriture) :**
- `user-context.ts` : dériver l'identité de la session Supabase (multi-user)
  au lieu de l'env — avec le fallback dev conservé.
- `core/workspaces/registry.ts` : passer de la constante unique à un resolver
  multi-config (fait dans cette phase, comportement par défaut inchangé),
  puis à un resolver DB.
- Dette #2 (imports server→features seed/ventures) : payer au fil des phases,
  jamais opportunistement.
- Roster d'agents : 8/10 rôles demandés couverts ; **manquent support client
  et contrôleur qualité** (fait dans cette phase).

**Supprimer : rien.** Aucun module mort identifié ; les modules INCUBATION
(~43 fichiers) sont des échafaudages testés, conformes à la politique du repo.

**Reconstruire : rien.** Aucune partie fonctionnelle ne justifie une
réécriture. La transformation est une *généralisation* (tenancy), pas un
rebuild.

---

## 2. Architecture cible SaaS

### Principe directeur

Un tenant = un **workspace**. Tout ce qui existe (agents, missions, ledger,
arena, mémoire, budgets) est déjà « workspace-first » dans les contrats de
domaine — la transformation consiste à rendre la résolution du workspace
dynamique (session → user → workspace(s)) sans toucher aux contrats.

```
Utilisateur (entrepreneur)
   │  signup / login (Supabase Auth — existant)
   ▼
Workspace resolver (session → workspace)        ← à généraliser (env → DB)
   │
   ├─ Roster d'agents du workspace (seed par défaut + activations)
   ├─ Ventures du workspace (profils marché génériques — existant)
   ├─ Arena : pipeline d'opportunités du workspace (existant)
   ├─ Missions + approbations + ledger (workspace-scoped — migrations 0007/0020 déjà appliquées à ce scope)
   └─ Cockpit : brief CEO, métriques financières, file d'approbation (existant)
```

### Les six capacités demandées et leur état

| Capacité demandée | Support existant | Reste à faire |
|---|---|---|
| Agents employés (rôles, objectifs, mémoire, outils, budgets, permissions) | Registry + chartes + skills + autonomy tiers + learning loop | Budgets par agent (Money Cockpit, phase S4) ; roster complété (cette phase) |
| Équipe chercheurs d'opportunités | Radar (scout) + Lab (inventor) + cron `market-scout` | Cadence + volume multi-tenant (S3) |
| Validation, classement, suivi des opportunités | Arena complète (candidats → évaluation → verdicts → batch ranking) | Surface produit self-serve (S3) |
| Planification et exécution autonome | Missions + drafts + work-orders + rail n8n | Live-apply 0024 (gated, mandat CEO) ; exécuteurs par skill (S5) |
| Supervision humaine, audit, approbations | Ledger + intents approve/reject + Sentinel + hash-chain shadow | Hash-chain live (mandat dédié) |
| Dashboards, métriques financières, performance | Cockpit + CEO brief + agent scorecards + ROI arena | Money Cockpit par workspace (S4) |

### Sécurité et garde-fous (invariants non négociables)

1. Aucun paiement, contrat, dépense ou action irréversible sans approbation
   humaine explicite (`humanOnTheLoop` absolu — déjà câblé dans le rail).
2. Un seul chemin sortant (chokepoint n8n) — jamais de second canal.
3. RLS workspace-scoped sur toute nouvelle table ; migrations toujours
   drafted + preflighted, live-apply sur mandat explicite.
4. Fail-closed en production (identité, persistance, document store).
5. Secrets jamais touchés par les agents (règle AGENTS.md).

---

## 3. Roster d'agents — mapping mandat → registre

| Rôle demandé | Agent Oria | Statut |
|---|---|---|
| CEO (orchestrateur) | **Joris** (`joris`) — l'humain reste le CEO ; Joris orchestre | actif |
| Chercheur marché | **Radar** (`orion`) | standby |
| Analyste | **Lab** (`inventor`) + Arena (scoring) | standby |
| Développeur | **Forge** (`builder`) | standby |
| Marketing | **Studio** (`marketing`) | standby |
| Ventes | **Closer** (`closer`) | gelé (déblocage gated) |
| Support | **Concierge** (`support`) | **ajouté cette phase** (planned) |
| Finance | **FinOps** (`finops`) | planned |
| Conformité | **Sentinel** (`sentinel`) | locked (rôle bloquant) |
| Contrôleur qualité | **Checkpoint** (`quality`) | **ajouté cette phase** (planned) |
| Opérateur exécutif | **Relay** (`hermes`) | standby |
| Mémoire | **Scribe** (`scribe`) | standby |

Les nouveaux agents naissent `planned`, autonomie 1, sorties internes
uniquement (brouillons), aucune communication externe sans niveau 5 — même
doctrine que le reste du registre. Les budgets par agent (plafond de dépense
IA mensuel + seuil d'approbation) arrivent avec le Money Cockpit (S4),
adossés au cost ladder existant.

---

## 4. Roadmap SaaS par phases

Chaque phase = PR(s) dédiée(s), validation complète (`typecheck`, `lint`,
`build`, `test`, `smoke:joris`, `map:check`) avant de déclarer terminé.
Aucune phase ne démarre sans mandat explicite (règle AGENTS.md).

### S1 — Fondation roster + design SaaS (cette PR)
- Audit + architecture cible + roadmap (ce document).
- Roster complété : agents `support` (Concierge) et `quality` (Checkpoint),
  rôles, skills, chartes, contraintes.
- Registre workspace prêt pour multi-config (resolver par slug, comportement
  par défaut inchangé).
- **Critères mesurables : baseline verte intégrale, 0 régression, nouveaux
  agents visibles sur `/hq/agents` avec chartes validées.**

### S2 — Tenancy réelle
- Identité dérivée de la session Supabase (`resolveUserContext` async),
  fallback dev conservé, fail-closed prod conservé.
- Table `workspaces` + `workspace_members` (migration drafted + preflight ;
  live-apply sur mandat). RLS par membre.
- Onboarding : signup → création workspace → seed du roster par défaut.
- **Critères : deux comptes de test isolés (aucune fuite cross-workspace,
  vérifiée par tests RLS), parcours signup→cockpit vert.**

### S3 — Pipeline d'opportunités self-serve
- Surface Arena par workspace : générer, évaluer, classer, décider
  (Kill/Hold/Research/Build/Launch — modèle Venture Lab existant).
- Cron market-scout multi-tenant (quota par workspace).
- **Critères : un entrepreneur peut lancer une chasse d'opportunités et
  obtenir un classement scoré avec evidence, sans intervention manuelle.**

### S4 — Money Cockpit + budgets d'agents
- Snapshot financier par workspace (manuel + coûts IA mesurés via cost ladder).
- Budget par agent : plafond mensuel, seuil d'approbation, coupure douce.
- ROI par agent/mission (scorecards existants, agrégés par workspace).
- **Critères : chaque dépense IA attribuée à un agent+mission ; dépassement
  de budget bloque en pending-approval, jamais silencieux.**

### S5 — Exécution live gouvernée
- Live-apply 0024 (`agent_execution_intents`) sur mandat CEO (runbook existant).
- Exécuteurs par skill via le chokepoint n8n (un binding approuvé par skill).
- Hash-chain ledger : passage de shadow à live (mandat dédié).
- **Critères : intent → approbation → exécution réelle → ledger vérifiable
  par hash-chain, smoke E2E dédié.**

### S6 — Monétisation du SaaS
- Billing (Stripe) : abonnement par workspace, metering des coûts IA.
- Plans (limites d'agents actifs, de missions, de chasses Arena).
- **Critères : aucun paiement déclenché par un agent ; billing 100 %
  hors du rail d'exécution des agents.**

### Hypothèses explicites (faute d'information)
- H1 : Supabase reste le backend (aucun signal contraire dans le repo).
- H2 : le modèle « un owner par workspace + membres » suffit au lancement
  (pas d'orgs imbriquées).
- H3 : la référence Polsia est traitée comme inspiration d'expérience
  (entreprise pilotée par agents avec supervision humaine), aucune
  intégration ou capacité non vérifiée n'est présumée.
- H4 : le billing (S6) attend que S2–S5 soient stables — pas de monétisation
  d'un produit non isolé par tenant.

### Risques principaux
- **RLS multi-tenant** : la migration S2 est le point de plus grand risque ;
  mitigé par la discipline `_revert`/`_verify` + tests d'isolation dédiés.
- **Dette #2** (server→features seed) : devient bloquante en S2 quand le seed
  devient par-workspace ; payer à ce moment-là, pas avant.
- **Dérive d'autonomie** : chaque nouvel exécuteur (S5) passe le gate
  Sentinel + approbation CEO — jamais d'auto-activation.
