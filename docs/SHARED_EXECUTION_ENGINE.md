# Shared Execution Engine — Stack Unique pour Toutes les Ventures

> **Branch:** `claude/agentic-holding-company-operating-model`
> **Parent:** [`HOLDING_PORTFOLIO_V1.md`](HOLDING_PORTFOLIO_V1.md)
> **Status:** Specification — **architecture cible, pas l'implémentation actuelle** (docs-only). État réel : [`ORIA_HQ_CURRENT_STATE.md`](ORIA_HQ_CURRENT_STATE.md). Aujourd'hui le chemin conversationnel de Joris utilise le provider JSON partagé (Anthropic → OpenAI, modèle par défaut bas coût) ; les sub-agents (Quinn/Depsy) et le routage par modèle ci-dessous ne sont **pas** implémentés.
> **Last updated:** 2026-05-22

---

## 1. Pourquoi un moteur unique

Trois ventures différentes (Suivia AP/AR, NOORKI Pro Suite, Dad School) **doivent** partager le même moteur d'exécution sous le capot. Sinon, la holding meurt en 90 jours par dispersion technique.

Une seule stack signifie :

- une seule courbe d'apprentissage,
- une seule surface d'observabilité,
- une seule infra à monitorer,
- une seule base de skills réutilisables,
- un seul vocabulaire pour Joris.

**Ce qui diffère par venture** : la Charter, les prompts métier, les schémas de données métier, le tenant Supabase, la copy marketing.

**Ce qui est commun** : tout le reste.

---

## 2. Stack canonique (verrouillée)

| Couche | Composant | Licence | Provider | Justification |
|--------|-----------|---------|----------|---------------|
| **Orchestration agents** | LangGraph | MIT | LangChain | State machine + human-in-the-loop interrupts — pattern central SOVRA |
| **Prototypage rapide** | CrewAI | MIT | crewAIInc | Spike rapide de nouvelles skills avant intégration LangGraph |
| **UI design system** | shadcn/ui + Tailwind | MIT | shadcn | Réutilisable cross-tenant ; déjà adopté dans HQ-APP |
| **Backend + DB + Auth** | Supabase | Apache 2.0 | Supabase | Multi-tenant, pgvector natif, RLS, déjà connecté |
| **ORM** | Drizzle | Apache 2.0 | Drizzle Team | Type-safe TS, simple, déjà adopté |
| **Observabilité agents** | Langfuse | MIT (core) | Langfuse | Tracing tokens + coûts + dérive, par tenant |
| **Mémoire long-terme** | Mem0 | Apache 2.0 | Mem0 | Mémoire scoped par sub-agent et par venture |
| **Orchestration async** | Trigger.dev | Apache 2.0 | Trigger.dev | Jobs long-running, retries, idempotence |

### 2.1 Composants explicitement **interdits**

| Composant | Raison |
|-----------|--------|
| **AutoGen (Microsoft)** | Licence CC-BY-4.0 — non adaptée au code commercial |
| **n8n** | Licence Sustainable Use — interdit la revente SaaS |
| **Phoenix (Arize)** | Licence ELv2 — interdit la revente SaaS |
| **Make.com / Zapier** | Pas open source, dépendance critique, pas dans le runtime SOVRA |
| **SuperAGI / ChatDev / OpenAgents** | Patterns OK à voler (cf. SOVRA §8), mais pas comme dépendances de production |

---

## 3. Doctrine de routage Joris ↔ Sub-agents

Le coût d'API est la première bombe à retardement d'une holding agentique. La règle :

> Joris pense, route, valide. Les sub-agents exécutent en masse.

### 3.1 Matrice de routage par provider

| Acteur | Provider primaire | Provider secondaire | Quand l'utiliser |
|--------|-------------------|---------------------|------------------|
| **Joris** | Anthropic Claude Sonnet 4.5 | OpenAI GPT-5 | Planification, ratification de plans, audit cross-venture, communication Owner |
| **Hermes Auditor** | OpenAI GPT-5 mini | Anthropic Claude Haiku | Audit, red team, validation de schémas, **read-only** |
| **Agent CEO Suivia** | Anthropic Claude Sonnet 4.5 | — | Décisions venture, escalade exceptions |
| **Agent CEO NOORKI** | Anthropic Claude Sonnet 4.5 | — | Décisions venture, scoring leads |
| **Agent CEO Dad School** | OpenAI GPT-5 | Anthropic Claude Sonnet 4.5 | Direction éditoriale, planning content |
| **Quinn (sub-agent)** | Qwen 2.5 (via DeepInfra ou self-host) | DeepSeek V3 | Extraction de masse : factures, fiches MLS, parsing documents |
| **Depsy (sub-agent)** | DeepSeek V3 | Qwen 2.5 | Matching, scoring, classification, génération content batch |

### 3.2 Règle 80/20

**80 % des appels** doivent passer par Quinn ou Depsy (bas coût).
**20 % des appels** peuvent passer par OpenAI/Anthropic (Joris, Agent CEOs, validation).

Hermes Money émet une alerte si ce ratio s'inverse pendant > 48 h pour une venture.

### 3.3 Estimation de coût par mission type

| Mission type | Appels | Provider mix | Coût estimé |
|--------------|:------:|--------------|:----------:|
| Suivia : parsing 100 factures | 100 extract + 5 validations | 100× Quinn + 5× Sonnet | ~0,40 $ |
| NOORKI : 1 listing complet (descriptif + 3 social + script vidéo + email) | 6 generations + 1 validation | 6× Depsy + 1× Sonnet | ~0,08 $ |
| Dad School : 1 article + 5 posts social | 6 generations + 1 review | 6× Depsy + 1× GPT-5 | ~0,06 $ |
| Joris : daily brief consolidé | 1 read 3 ventures + 1 synthesis | 1× Sonnet | ~0,02 $ |

**Conclusion :** un client Suivia à 1 200 $/mois consomme ~12-20 $/mois d'API. Un client NOORKI à 597 $/mois consomme ~5-8 $/mois. Un abonné Dad School à 9 $/mois consomme < 0,30 $/mois (content engine mutualisé).

---

## 4. Skills atomiques — Catalogue partagé

Les **skills** sont les capacités atomiques réutilisables entre ventures. Chaque skill a une SOP, un schéma d'entrée, un schéma de sortie, et un coût estimé.

| Skill ID | Description | Utilisée par | Provider recommandé |
|----------|-------------|--------------|---------------------|
| `doc.extract` | Extrait données structurées d'un PDF/image (facture, PO, MLS, contrat) | Suivia, NOORKI | Quinn (Qwen) |
| `doc.match` | Match deux datasets structurés (ex: factures ↔ POs) | Suivia | Depsy (DeepSeek) |
| `signal.collect.public` | Collecte signaux marché publics (news, comparables, tendances) | Suivia, NOORKI | Quinn |
| `signal.synthesize` | Synthétise N signaux en briefing structuré | Suivia, NOORKI | Sonnet (Agent CEO) |
| `brief.compose` | Compose un briefing client formaté (PDF/markdown/HTML) | Suivia, NOORKI | Sonnet (Agent CEO) |
| `content.generate` | Génère contenu marketing (descriptif, post, article) | NOORKI, Dad School | Depsy |
| `content.optimize` | Optimise copy existante (SEO, conversion, ton) | NOORKI, Dad School | Depsy |
| `lead.qualify` | Score un lead entrant selon critères Charter | NOORKI | Depsy |
| `lead.triage` | Distribue un lead vers une séquence de follow-up | NOORKI | Depsy |
| `followup.sequence` | Génère une séquence d'emails/SMS de relance (drafts internes) | Suivia, NOORKI | Depsy |
| `email.draft.external` | Rédige un email destiné à un humain externe (DRAFT ONLY — pas d'envoi) | toutes | Sonnet |
| `report.compose.weekly` | Compose le rapport hebdo d'une venture pour Joris | toutes | Sonnet (Agent CEO) |
| `audit.review` | Audit Red Team d'une décision/output | toutes | GPT-5 mini (Auditor) |
| `ledger.write` | Écrit une entrée Ledger (append-only) | toutes | déterministe (pas d'IA) |

### 4.1 Règles d'évolution du catalogue

- Toute nouvelle skill = entrée au Ledger + Pattern Extraction Memo + validation Hermes Auditor.
- Une skill ne peut JAMAIS être plus permissive que les `skillsAllowed` de la Charter qui l'invoque.
- Une skill `*.external` (qui touche un tiers réel) est interdite tant que la venture est < autonomy 5.

---

## 5. Infra partagée — Schéma Supabase

Multi-tenant strict. Une seule base Supabase, séparation par `venture_id`.

```sql
-- Schéma high-level (specs seulement, pas de migration introduite ici)

create table ventures (
  id text primary key,                    -- "suivia.ap-ar", "noorki.pro-suite", "dadschool.digital"
  name text not null,
  status text not null,                   -- 'draft' | 'ratified' | 'active' | 'paused' | 'wound-down'
  agent_ceo_id text not null,
  autonomy_level int not null,            -- 0..7
  budget_cap_cents int not null,
  created_at timestamptz default now()
);

create table tenants (
  id uuid primary key default gen_random_uuid(),
  venture_id text references ventures(id) not null,
  customer_name text,
  pricing_tier text,
  status text not null,                   -- 'pilot' | 'active' | 'churned'
  created_at timestamptz default now()
);

create table missions (
  id uuid primary key default gen_random_uuid(),
  venture_id text references ventures(id) not null,
  tenant_id uuid references tenants(id),
  agent_id text not null,                 -- agent qui exécute
  parent_mission_id uuid references missions(id),
  intent text not null,
  autonomy_level int not null,
  risk_level text not null,               -- 'low' | 'medium' | 'high'
  status text not null,                   -- 'open' | 'pending-gate' | 'running' | 'done' | 'failed' | 'cancelled'
  budget_allocated_cents int,
  budget_consumed_cents int default 0,
  started_at timestamptz,
  finished_at timestamptz
);

create table ledger (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz default now() not null,
  venture_id text references ventures(id) not null,
  mission_id uuid references missions(id),
  agent_id text not null,
  action_type text not null,              -- 'api.call' | 'tool.invoke' | 'client.promise' | 'spend' | 'charter.change' | ...
  provider text,                          -- 'anthropic' | 'openai' | 'qwen-deepinfra' | 'deepseek' | ...
  model text,
  input_tokens int,
  output_tokens int,
  cost_cents int,
  schema_valid bool,
  payload jsonb not null,
  signature text                          -- hash de l'entrée précédente pour append-only verifiable
);

-- RLS : chaque venture voit uniquement ses propres tenants/missions/ledger
-- Joris voit tout (cross-venture)
-- Risk Office voit tout (cross-venture, read-only)
```

---

## 6. Ledger — règles renforcées pour le portfolio

Chaque appel API génère **une entrée obligatoire** au Ledger :

- timestamp précis
- venture_id et agent_id
- provider + modèle
- input tokens / output tokens
- coût en cents (calculé via tarifs déclarés au démarrage)
- validation du schéma de sortie (bool)
- payload (jsonb)
- signature de chaînage (hash sur l'entrée précédente)

Trois invariants Ledger non-négociables :

1. **Append-only.** Pas d'update, pas de delete. Une correction = nouvelle entrée `action_type=correction` pointant l'entrée corrigée.
2. **Per-call.** Pas de batching qui masque le détail des coûts.
3. **Per-venture.** Pas de coût "holding mutualisé non attribué". Tout coût trace à une venture (ou à `venture_id=holding` pour Joris en mode cross-venture).

---

## 7. Critères de succès du moteur

À J60, l'engine est validé si :

- ✅ Les 3 ventures tournent sur cette stack sans déviation.
- ✅ < 5 % des appels génèrent une erreur de schéma de sortie.
- ✅ < 200 ms p50 d'overhead Joris sur une mission complète (hors temps modèle).
- ✅ Coût API total mensuel toutes ventures < 500 $.
- ✅ 100 % des appels tracés au Ledger (audit aléatoire mensuel).
- ✅ 0 incident de dérive d'agent non détecté par Langfuse.

Si un seul critère casse, l'engine entre en revue Risk Office et les ventures correspondantes passent en `paused` jusqu'à correction.
