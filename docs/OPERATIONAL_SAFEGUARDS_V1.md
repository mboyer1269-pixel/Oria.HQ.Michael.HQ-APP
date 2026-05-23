# Operational Safeguards v1 — SOVRA Agentic Holding Company

**Statut:** Spec docs-only. Mécanismes non-négociables à câbler dans le runtime SOVRA avant la première venture en mode autonome (niveau 4+).

**Origine:** Cristallise les 8 garde-fous critiques identifiés dans l'analyse froide *AI Venture HQ* (avril 2026, cf. `LESSONS_LEARNED_AI_VENTURE_HQ.md`). Sans ces mécanismes, l'étude MIT NANDA *The GenAI Divide* (Challapally, Pease, Raskar, Chari, juillet 2025) prédit 95% de probabilité d'échec.

**Lié à:**
- `docs/AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md` (doctrine SOVRA)
- `docs/SHARED_EXECUTION_ENGINE.md` (engine commun aux 3 ventures)
- `docs/JORIS_OPERATING_PROFILE.md` (Operating Partner L2)
- `docs/CEO_REPORT_TEMPLATE.md` (format Daily Brief / Weekly Report)
- `docs/HQ_SIGNAL_WIRING.md` (captation externe)

---

## TL;DR

Huit mécanismes opérationnels obligatoires :

| # | Garde-fou | Couche | Critère de "vert" |
|---|-----------|--------|-------------------|
| GF1 | **Table `revenues` Supabase dès J1** | L0 grounding | Chaque venture a ≥1 entrée `revenues` dans les 30 jours ou est paused |
| GF2 | **Prompt caching mandaté** | L4 cost | Cache hit rate ≥60% (Langfuse) sur tout prompt système >1024 tokens |
| GF3 | **JSON schema sur chaque appel LLM** | L3/L4 quality | 0 sortie free-form sauf champ `summary` explicite |
| GF4 | **Champ `sources_cited` obligatoire** | L1 risk | Tout claim factuel sans source → REJECT auto |
| GF5 | **Stop-loss par venture (cost_today > $4)** | L0 capital | Halt agent + Telegram, exige ratification L0 pour reprendre |
| GF6 | **Anti-sycophancy prompt sur tout gate IA→IA** | L1 risk | Évaluateur doit lister ≥3 modes d'échec avant approbation |
| GF7 | **Rubrique 0-100 LLM-as-judge** | L1 risk | <70 reject auto, 70-85 Michael, 85+ archive |
| GF8 | **Kill switch J21 par venture** | L0 governance | Score moyen ≥80 AND coût/run <$1.50 AND ≥1 entrée `revenues` sinon pause |

**Aucune venture ne passe au niveau d'autonomie 4 (Act) sans les 8 garde-fous verts pendant 7 jours consécutifs.**

---

## GF1 — Table `revenues` Supabase dès J1

### Pourquoi non-négociable

Sans table `revenues`, "venture" = research-bot. La MIT NANDA *GenAI Divide* identifie comme cause racine du 95% d'échec le fait que les pilotes optimisent "AI productivity" au lieu de P&L. Si "Suivia AP/AR a généré un beau rapport ce mois" ne se traduit pas en une ligne dans `revenues`, la venture est en mode théâtre.

### Schéma cible

```sql
create table sovra.revenues (
  id              uuid primary key default gen_random_uuid(),
  venture_id      text not null,          -- 'suivia-ap-ar' | 'noorki-pro-suite' | 'dadschool-digital'
  amount_cad      numeric(10,2),          -- montant en CAD
  hours_saved     numeric(6,2),           -- équivalent heures sauvées
  source          text not null,          -- 'paid_customer' | 'pilot' | 'consulting' | 'savings'
  customer_ref    text,                   -- ref client (sans PII brute)
  recorded_at     timestamptz default now(),
  attributable_to text,                   -- agent CEO concerné (hermes-operator.suivia, etc.)
  notes           text,
  evidence_url    text                    -- lien Stripe, facture, ou log
);
```

### Règle de gouvernance

- **J0 + 30 jours**: chaque venture doit avoir ≥1 entrée `revenues` (même un pilote gratuit avec horaire mesuré)
- **J0 + 60 jours**: chaque venture doit avoir ≥1 client payant OU être paused par décision L0
- **J0 + 90 jours**: kill switch portfolio — si <2 ventures sur 3 ont du MRR, on coupe le portefeuille à 1 venture

### Action immédiate

Créer la table dans la première migration Drizzle, **avant** toute autre table métier.

---

## GF2 — Prompt caching mandaté

### Pourquoi non-négociable

Anthropic caching: lecture en cache à 0.1× le prix de base (90% de réduction sur l'input répété). Pour un système avec prompts systèmes stables (charters venture, role agent CEO, format Joris), le différentiel mensuel se chiffre en centaines de dollars.

**Calcul concret pour SOVRA v1:**

| Scénario | Prompt système | Calls/jour | Coût mensuel uncached | Cached | Économie |
|----------|---------------|------------|----------------------|--------|----------|
| Sonnet 4.5 Chair | 50K tokens | 30 | ~$135 | ~$13.50 | $121.50 |
| Sonnet 4.5 Auditor par venture | 30K tokens | 60 | ~$162 | ~$16.20 | $145.80 |
| Gemini Flash scout | 20K tokens | 120 | ~$10.80 | ~$1.08 | $9.72 |
| **Total mensuel** | | | **~$308** | **~$31** | **~$277/mo** |

### Règle de gouvernance

Tout prompt système >1024 tokens DOIT être envoyé avec :
- Anthropic: `cache_control: { type: "ephemeral" }` sur le bloc système
- Gemini: context caching API
- OpenAI: prefix caching automatique (vérifier headers de réponse)

### Métrique de contrôle

- **Cache hit rate ≥60%** (mesuré via Langfuse)
- Alerte Langfuse si hit rate <50% pendant 24h

---

## GF3 — JSON schema sur chaque appel LLM

### Pourquoi non-négociable

Free-form prose = porte ouverte aux hallucinations silencieuses et au parsing fragile côté n8n/Trigger.dev. Schema enforced = validation côté LLM + côté workflow.

### Schéma cible `venture_output_v1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://sovra.local/schemas/venture_output_v1.json",
  "type": "object",
  "required": ["venture_id", "task_type", "summary", "confidence", "sources_cited", "next_action"],
  "properties": {
    "venture_id": {
      "type": "string",
      "enum": ["suivia-ap-ar", "noorki-pro-suite", "dadschool-digital", "shared-engine"]
    },
    "task_type": {
      "type": "string",
      "enum": ["scout", "audit", "synthesis", "outreach_draft", "pricing_analysis", "competitor_scan"]
    },
    "summary": {
      "type": "string",
      "maxLength": 1200,
      "description": "Résumé exécutif, max 1200 chars, ton Joris (Objectif→Étapes→Actions→Validation→Prochaine action)"
    },
    "confidence": {
      "type": "integer",
      "minimum": 0,
      "maximum": 100
    },
    "sources_cited": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["url", "quote"],
        "properties": {
          "url": { "type": "string", "format": "uri" },
          "quote": { "type": "string", "maxLength": 500 },
          "verified": { "type": "boolean", "default": false }
        }
      }
    },
    "next_action": {
      "type": "string",
      "maxLength": 200
    },
    "escalate": {
      "type": "boolean",
      "default": false
    },
    "escalation_reason": {
      "type": "string"
    },
    "cost_usd": {
      "type": "number",
      "minimum": 0
    }
  }
}
```

### Règle de gouvernance

- Anthropic: `tool_use` avec schema strict
- Gemini: `responseSchema` dans `generationConfig`
- OpenAI: `response_format: { type: "json_schema", json_schema: {...}, strict: true }`

Tout output non-conforme = **REJECT auto + retry 1×** (avec critique dans le prompt) puis halt.

---

## GF4 — Champ `sources_cited` obligatoire sur claims factuels

### Pourquoi non-négociable

Hallucination = client perdu en B2B (Suivia AP/AR, NOORKI). Tolérance zéro sur les claims chiffrés (taux, prix concurrent, statistique de marché).

### Règle de gouvernance

L'Auditor Sonnet 4.5 (L1 Risk Office) applique cette règle systématiquement :

1. Si `summary` contient un nombre, un % ou une affirmation présentée comme factuelle
2. ET `sources_cited.length === 0`
3. → REJECT auto avec failure_mode: `"factual claim without source"`

Si l'agent ne peut pas sourcer, il DOIT mettre `escalate: true` + `escalation_reason: "need web search or human input for source"`.

### Outils autorisés pour sourcer

- Anthropic web search ($10/1000 searches) — par défaut
- Gemini grounding (gratuit dans Flash)
- Perplexity Pro on-demand seulement sur sujets >$200 d'impact

---

## GF5 — Stop-loss par venture (cost_today > $4)

### Pourquoi non-négociable

Anthropic *Building Effective Agents* (avril 2025) + analyse AI Venture HQ : sans stop-loss, un agent en boucle peut consommer 10× le budget en quelques heures (token blow-up multi-agent).

### Schéma cible

```sql
create table sovra.cost_ledger (
  id           uuid primary key default gen_random_uuid(),
  venture_id   text not null,
  agent_id     text not null,            -- 'hermes-operator.suivia', 'joris', etc.
  task_id      uuid references sovra.tasks(id),
  model        text not null,            -- 'claude-sonnet-4-5', 'gemini-2.5-flash', ...
  input_tokens integer not null,
  output_tokens integer not null,
  cached_tokens integer default 0,
  cost_usd     numeric(8,4) not null,
  created_at   timestamptz default now()
);

create index idx_cost_ledger_venture_day on sovra.cost_ledger (venture_id, date_trunc('day', created_at));
```

### Règle de gouvernance

Avant chaque appel LLM, n8n/Trigger.dev exécute :

```sql
select sum(cost_usd) as today_cost
from sovra.cost_ledger
where venture_id = $1
  and created_at >= date_trunc('day', now() at time zone 'America/Toronto');
```

| Seuil today_cost | Action |
|------------------|--------|
| < $2 | Continue normalement |
| $2–$4 | Continue + warning dans Langfuse |
| $4–$6 | **HALT agent** + Telegram à Michael "Suivia hit $4 cap, ratification requise" |
| > $6 | **HALT venture entière** + escalade L0 obligatoire |

Caps mensuels par venture :

| Venture | Cap mensuel | Cap journalier |
|---------|-------------|----------------|
| Suivia AP/AR | $120 | $4 |
| NOORKI Pro Suite | $100 | $3.30 |
| Dad School | $80 | $2.65 |
| Joris (orchestrateur) | $50 | $1.65 |
| **Total** | **$350/mo** | **$11.60/jour** |

Réserve disponible: $800/mo sur le cap portefeuille de $1,150/mo (Opus 4.7 ponctuel, Perplexity on-demand, batch jobs).

---

## GF6 — Anti-sycophancy prompt sur tout gate IA → IA

### Pourquoi non-négociable

Yao et al. *Peacemaker or Troublemaker* (arXiv:2509.23055, sept 2025): sycophancy effondre les débats multi-agents en-dessous des baselines single-agent. Notre L1 Risk Office (Hermes Auditor évalue Hermes Operator/Closer/Builder) est exactement ce gate IA→IA.

### Template anti-sycophancy obligatoire

```
You are the SOVRA L1 Risk Office Auditor. Your job is NOT to approve.
Your job is to find failure modes.

The previous agent ({agent_id}) produced this output: {output_json}

Before you can mark this output APPROVE, you MUST:
1. List AT LEAST 3 specific failure modes (factual error, logic gap,
   missing context, unverifiable claim, scope creep, hallucination risk)
2. For each failure mode, cite the exact field/sentence in the output
3. Rate severity: BLOCKER | MAJOR | MINOR

If you cannot list 3 specific failure modes, you MUST default to REJECT
with reason "insufficient critical analysis".

The previous agent IS allowed to be wrong. Confidence scores of the
previous agent are NOT evidence of correctness.

Output a venture_output_v1 JSON with task_type="audit" and the score
breakdown per the rubric (GF7).
```

### Métrique de contrôle

Si l'Auditor approve >80% des outputs sans lister de failure modes → sycophancy détectée → escalade L0 + recalibration prompt.

---

## GF7 — Rubrique 0-100 LLM-as-judge

### Pourquoi non-négociable

Sans rubrique chiffrée, "ça a l'air bon" = approbation aveugle le vendredi soir. La rubrique force la cohérence entre les évaluations et permet le routage automatique.

### Rubrique standard SOVRA v1

| Critère | Poids | Définition |
|---------|-------|------------|
| Factual accuracy | 40 | Aucune affirmation factuelle non-sourcée ou contredite par les sources citées |
| Source quality | 20 | Sources primaires/officielles ≥1 ; pas de circular reasoning (LLM citant LLM) |
| Actionability | 20 | `next_action` est exécutable en <2h par Michael ou un agent défini |
| Brevity | 10 | `summary` ≤1200 chars, pas de remplissage |
| Schema compliance | 10 | venture_output_v1 strictement valide, tous champs requis présents |
| **Total** | **100** | |

### Règle de routage

| Score | Action |
|-------|--------|
| 0–69 | **REJECT auto** + re-queue avec critique structurée (max 1 retry, sinon halt) |
| 70–84 | **Telegram à Michael** avec boutons /approve /reject /revise |
| 85–94 | **Auto-archive** dans `sovra.tasks` + inclus dans Daily Brief |
| 95–100 | **Auto-archive HIGHLIGHT** + remonté en tête du Weekly Report |

Exceptions (force Telegram même si 85+) :
- `cost_usd > $1.00` sur un seul output
- `next_action` implique paiement, signature, ou communication client externe
- `escalate: true`
- Tag `high_stakes: true` dans la config venture

---

## GF8 — Kill switch J21 par venture

### Pourquoi non-négociable

L'ancien plan AI Venture HQ recommandait "build Alpha first, run 7 days, prove ROI". On adopte une version durcie pour SOVRA : **21 jours** parce qu'on lance 3 ventures simultanément et qu'on a besoin d'un signal plus stable avant ratification de la suite.

### Critères de survie à J21 (par venture)

Toutes ces conditions DOIVENT être vraies sinon la venture est **paused** (pas killed — reprise possible sur ratification L0) :

1. **Score moyen Auditor ≥80** sur les 21 derniers jours
2. **Coût moyen par run <$1.50** (cible: $0.50–1.00)
3. **≥1 entrée `revenues`** (pilote gratuit avec heures mesurées compte)
4. **≥1 conversation client externe** documentée (email, appel, pilote)
5. **0 incident L0** (pas d'escalade critique non-résolue)

### Procédure de pause

Si une venture rate ≥2 critères à J21 :

1. Joris envoie un rapport de fin de cycle (Weekly Report étendu)
2. Michael ratifie pause/continue/kill dans les 48h
3. Si pause: agent CEO mis en mode "lecture seule", crons désactivés, prompts archivés
4. Reprise possible mais seulement après plan de remediation L1-approved

### Procédure de kill (irréversible)

Trois conditions cumulatives :
- Venture paused depuis ≥30 jours
- Aucun plan de remediation approuvé
- Décision L0 explicite + log dans `sovra.decisions_log`

### Effet domino prévu

Réaliste à J21 sur 3 ventures simultanées :
- **Suivia AP/AR**: forte probabilité de survie (consulting B2B, network Michael existant)
- **NOORKI Pro Suite**: dépend du closing avec le broker warm prospect (binaire)
- **Dad School**: probable pause (B2C nécessite plus de runway audience)

Plan de fallback réaliste : **2 ventures actives à J90**, 1 paused.

---

## Câblage runtime (résumé)

| Garde-fou | Implémentation | Owner |
|-----------|----------------|-------|
| GF1 revenues | Migration Drizzle `001_revenues.sql` | Build sprint |
| GF2 caching | Wrapper LLM `lib/llm/cached-call.ts` | Build sprint |
| GF3 schema | `schemas/venture_output_v1.json` + zod validator | Build sprint |
| GF4 sources | Règle dans prompt Auditor + validator côté n8n | Build sprint |
| GF5 stop-loss | Migration `cost_ledger` + middleware `lib/llm/cost-guard.ts` | Build sprint |
| GF6 anti-sycophancy | Prompt template L1 Risk Office | Doctrine (ce PR) |
| GF7 rubrique | Prompt Auditor + parser score | Build sprint |
| GF8 kill switch J21 | Cron Trigger.dev + Joris report | Build sprint |

---

## Validation 7-jours avant niveau 4 (Act autonome)

Une venture ne passe au niveau 4 (Act sans approbation Michael par action) que si **les 8 garde-fous sont verts 7 jours consécutifs** :

- [ ] GF1: ≥1 entrée `revenues` enregistrée
- [ ] GF2: cache hit rate ≥60% (Langfuse)
- [ ] GF3: 100% des outputs conformes au schema (0 fallback retry)
- [ ] GF4: 0 claim factuel sans source dans les 7 derniers jours
- [ ] GF5: 0 halt par stop-loss
- [ ] GF6: Auditor a listé ≥3 failure modes sur ≥90% des audits
- [ ] GF7: Score moyen ≥85
- [ ] GF8: Critères J21 sur trajectoire verte

Si ≥1 critère rouge → venture reste au niveau 3 (Recommend, approbation Michael par action).

---

## Référentiel externe

- Anthropic, *How we built our multi-agent research system* (juin 2025) — 15× token multiplier
- Walden Yan / Cognition AI, *Don't Build Multi-Agents* (12 juin 2025) — Principle 2
- Yao et al., *Peacemaker or Troublemaker* (arXiv:2509.23055, sept 2025) — sycophancy collapse
- Challapally, Pease, Raskar, Chari, *The GenAI Divide: State of AI in Business 2025* (MIT NANDA, juillet 2025) — 95% failure root cause
- Anthropic, *Building Effective Agents* (avril 2025) — "simple composable patterns"

---

**Statut docs:** Spec uniquement, aucun code, aucune migration, aucun secret introduits dans ce PR. Implémentation runtime = sprint séparé après ratification L0 Michael.
