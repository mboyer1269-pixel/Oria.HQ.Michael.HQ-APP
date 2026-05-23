# Oria HQ — Surface de SOVRA Agentic Holding Company OS

> **Owner:** Michael Boyer (President / Capital Allocator)
> **Operating Partner:** Joris (L2)
> **Codename système d'exploitation:** SOVRA — Agentic Holding Company OS
> **Workspace de référence:** Michael HQ

Oria HQ est la **surface de travail** (cockpit, workspace, ledger viewer, approbations) qui matérialise **SOVRA** — le modèle d'exploitation qui permet à un Owner de créer, gouverner et faire croître des entreprises B2B et B2C **réelles, opérées à 80-90 % par agents IA**, sous gouvernance Owner + Risk Office + Operating Partner.

Ce n'est ni un assistant généraliste, ni un "GPT custom". C'est une **holding agentique** : chaque venture a sa Company Charter, son Agent CEO, son budget, ses KPI, ses gates de risque et son Ledger.

## Doctrine et documents fondateurs

Avant toute lecture du code, lire dans cet ordre :

| # | Document | Rôle |
|---|----------|------|
| 1 | [`docs/AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md`](docs/AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md) | Doctrine mère SOVRA : gouvernance, charters, autonomy 0-7, risk register, 30-day plan |
| 2 | [`docs/HOLDING_PORTFOLIO_V1.md`](docs/HOLDING_PORTFOLIO_V1.md) | Portfolio v1 ratifié : 3 ventures au Jour 1 sous 4 invariants |
| 3 | [`docs/SHARED_EXECUTION_ENGINE.md`](docs/SHARED_EXECUTION_ENGINE.md) | Stack technique unique, routage Joris ↔ Quinn/Depsy, catalogue de 14 skills atomiques |
| 4 | [`docs/JORIS_OPERATING_PROFILE.md`](docs/JORIS_OPERATING_PROFILE.md) | Operating Partner spec : mandat, limites, cadences de reporting |
| 5 | [`docs/CEO_REPORT_TEMPLATE.md`](docs/CEO_REPORT_TEMPLATE.md) | Template Daily Brief + Weekly Report + Monthly Audit + Incident Report |
| 6 | [`docs/STRATEGIC_ANALYSIS_CTO_2026Q2.md`](docs/STRATEGIC_ANALYSIS_CTO_2026Q2.md) | Analyse marché compagnon, top 3 industries B2B, repos OSS validés |
| 7 | [`docs/charters/`](docs/charters/) | Les 3 Company Charters draft (Suivia AP/AR, NOORKI Pro Suite, Dad School) |

## Portfolio v1 — Trois ventures au Jour 1

| Venture | Type | Pricing | Agent CEO | Budget cap | MRR cible M6 |
|---------|------|---------|-----------|:----------:|:------------:|
| **Suivia AP/AR** | B2B Finance Ops PMEs QC | 500 / 1 200 / 2 500 $/mois + usage | hermes-operator.suivia | 500 $/mois | 6 000 $ |
| **NOORKI Pro Suite** | B2B Real Estate Courtiers | 597 / 797 / 997 $/mois | hermes-closer.noorki | 400 $/mois | 4 776 $ |
| **Dad School** | B2C Digital + Communauté | 9-19 $/mois + one-shots 27-97 $ | hermes-builder.dadschool | 250 $/mois | 4 500 $ |

**Budget consolidé : 1 150 $/mois** (< plafond 1 500 $). **MRR cible consolidé M6 : ~15 K$**.

## Gouvernance — 5 couches

```
L0  Michael (Owner)              Capital + kill switch + ratification
L1  Risk Office                  Veto indépendant sur risk=high / autonomy >= 5
L2  Joris (Operating Partner)    Routing + planification + audit (Anthropic/OpenAI)
L3  Agent CEOs (un par venture)  Direction venture sous mandat Charter
L4  Sub-agents (Quinn/Depsy)     Exécution de masse à bas coût (Qwen/DeepSeek)
```

## Stack canonique (verrouillée)

- **Next.js App Router** + TypeScript strict + Tailwind + shadcn/ui (MIT)
- **Supabase** (Apache 2.0) — Auth, Postgres, RLS, pgvector multi-tenant
- **LangGraph** (MIT) — orchestration agents production
- **Trigger.dev** (Apache 2.0) — jobs async, retries, idempotence
- **Mem0** (Apache 2.0) — mémoire long-terme scoped par sub-agent et venture
- **Langfuse** (MIT core) — tracing tokens + coûts + dérive d'agents
- **Drizzle ORM** (Apache 2.0) — accès DB type-safe
- **Modèles IA** — Anthropic Claude (Sonnet) + OpenAI GPT-5 pour la planification ; Qwen + DeepSeek pour l'exécution de masse

**Composants explicitement interdits comme dépendances de production :** AutoGen (CC-BY-4.0), n8n (Sustainable Use), Phoenix (ELv2), Make / Zapier, SuperAGI. Patterns OK à étudier, dépendances NON.

## Structure du code

| Dossier | Rôle |
|---------|------|
| `src/app/` | Routes Next.js, API routes, shell applicatif (login, dashboard, hq) |
| `src/features/` | Modules produit front/back partagés par domaine (agents, hq, missions, skills, contact) |
| `src/server/` | Logique serveur : Joris (`joris/`), IA (`ai/`), permissions (`permissions/`), runtime (`runtime/`), brief (`brief/`), missions (`missions/`), Supabase (`supabase/`) |
| `src/lib/` | Utilitaires, environnement, clients |
| `src/scripts/smoke/` | Smoke tests (`joris-booking.mjs`, `runtime-health-echo.mjs`) |
| `db/` | Schéma Supabase initial + données seed |
| `docs/` | Doctrine, charters, schémas, plans, audits |
| `public/` | Assets PWA |

## Prototype actuel (Michael HQ)

Le prototype valide les fondations :

- Auth owner-only Michael HQ
- Command Center → Joris
- Joris Book (création de RDV simples)
- Agenda privé
- CEO Brief v0
- Documents / coffre privé
- Contact leads serveur
- Permissions + Action Ledger
- Routeur de modèles IA

**Prochaine fondation à coder (post-merge PR #52) :** câblage du Shared Execution Engine + premières skills atomiques (`doc.extract`, `content.generate`, `brief.compose`) + schéma multi-tenant Supabase (`ventures`, `tenants`, `missions`, `ledger` étendu).

## Modes métier (legacy v0)

Le concept de "modes métier installables" (personnel, professionnel, conseiller financier, immobilier) reste valable comme couche d'expertise verticale. Sous le modèle SOVRA, **chaque venture est un Mode Métier + une Company Charter** : le mode définit le contexte d'expertise, la charter définit la gouvernance et l'économique.

## Démarrage

```bash
npm install
npm run dev
```

Copier `.env.example` vers `.env.local` puis remplir les clés. **Aucune clé API côté client.**

## Validations

À exécuter avant tout merge :

```bash
npm run typecheck         # TypeScript strict
npm run lint              # ESLint
npm run build             # Build Next.js
npm run smoke:joris       # Smoke Joris
npm run smoke:runtime     # Smoke runtime
npm run check:supabase    # Audit config Supabase
```

5/5 attendu. Toute régression bloque le merge.

## Principes non-négociables

1. **Aucune clé API côté client.**
2. **Aucune mémoire partagée entre workspaces** sans permission explicite.
3. **Toutes les actions autonomes passent par les permissions.**
4. **Tous les appels modèles tracés au Ledger** (provider, modèle, tokens, coût en cents, venture_id, agent_id, validation schéma).
5. **Le Ledger est append-only.** Une correction = nouvelle entrée pointant l'originale.
6. **Joris parle en français québécois canadien par défaut.**
7. **Aucune Charter modifiée sans double signature** (Owner + Risk Office).
8. **Autonomy ≤ 3 (Recommend)** au Jour 1 pour toutes les ventures. Promotion via critères mesurables uniquement.
9. **Aucune skill `*.external`** sans gate Owner approval mission-par-mission tant que la venture est < autonomy 5.
10. **Kill switch portfolio J90** : si aucune venture n'a de client payant, 2 des 3 sont mises en pause.

## Réseau de documents

Cette plateforme est régie par un **réseau de documents** plus que par du code. Avant toute proposition technique :

- Lire la doctrine mère et le portfolio v1.
- Vérifier que l'action proposée respecte les invariants conditionnels.
- Si une décision dépasse une Charter, produire une **motion formelle** ratifiable par Owner + Risk Office.
- Toute nouvelle dépendance OSS = **Pattern Extraction Memo** (voir doctrine §8).

## Contact

Le formulaire de contact écrit dans `contact_leads` via Supabase service role, avec RLS active (aucune lecture/insertion publique). `CONTACT_NOTIFICATION_EMAIL` prépare la notification ; tant qu'aucun provider email n'est branché, retour `status=skipped`.
