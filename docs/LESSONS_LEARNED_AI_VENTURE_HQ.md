# Lessons Learned — AI Venture HQ (avril 2026) → SOVRA

**Statut:** Annexe historique. Préserve l'analyse froide d'avril 2026 sur le plan conceptuel "AI Venture HQ" et trace ce qui a été retenu vs rejeté dans la doctrine SOVRA.

**Lié à:**
- `docs/AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md` (doctrine SOVRA, version actuelle)
- `docs/OPERATIONAL_SAFEGUARDS_V1.md` (cristallise les retenus)
- `docs/VPS_HOSTINGER_SETUP.md` (substrat runtime décidé)

---

## 1. Contexte historique

En avril 2026, Michael avait esquissé un premier plan conceptuel appelé **"AI Venture HQ"** :
- **Board de 5 IA** : ChatGPT (Chair), Claude (CTO), Gemini (Scout), Perplexity (Validator), + un 5e seat
- **4 Venture Agents** non-nommés : Alpha, Bravo, Charlie, Delta (Greek-letter pattern)
- **Stack proposée** : Manus + Genspark Super Agent + Genspark Claw comme "operators" autonomes
- **Budget cible** : $80–120/mo
- **Outils complémentaires envisagés** : Lovable, v0, LangSmith Pro, Claude Max, Replit Agent, Devin, Cursor Ultra

Une analyse froide a été produite (~700 lignes, ~30 sources primaires) avec verdict net : **architecture théâtrale, budget incompatible, opérateurs autonomes (Manus/Claw) inadaptés**.

Ce document préserve les conclusions et trace leur intégration dans SOVRA.

---

## 2. Décisions retenues dans SOVRA

| Recommandation AI Venture HQ | Statut SOVRA | Localisation doctrine |
|------------------------------|--------------|----------------------|
| Drop "Board de 5 IA" théâtral | ✅ **Retenu** | SOVRA = 5 layers governance (L0–L4), pas un debate multi-agent |
| Routing tiered cheap-first | ✅ **Retenu** | Quinn (Qwen) + Depsy (DeepSeek) = 80% des calls, Anthropic/OpenAI = 20% |
| Claude Sonnet 4.5 comme Auditor | ✅ **Retenu** | L1 Risk Office utilise Sonnet 4.5 (lowest hallucination rate parmi modèles practical-priced) |
| Gemini Flash comme volume worker | ✅ **Retenu (avec variante)** | Quinn (Qwen) + Depsy (DeepSeek) jouent ce rôle; Gemini Flash reste option de fallback |
| JSON schema obligatoire | ✅ **Retenu** | GF3 dans `OPERATIONAL_SAFEGUARDS_V1.md` |
| Citation field obligatoire | ✅ **Retenu** | GF4 |
| Stop-loss per agent (cost cap) | ✅ **Retenu** | GF5 (cap $4/jour par venture, $11.60/jour portefeuille) |
| Prompt caching mandaté | ✅ **Retenu** | GF2 (cache hit rate ≥60%) |
| Anti-sycophancy sur gate IA→IA | ✅ **Retenu** | GF6 (Auditor doit lister ≥3 failure modes) |
| Rubrique 0-100 LLM-as-judge | ✅ **Retenu** | GF7 (Factual 40 / Sources 20 / Actionability 20 / Brevity 10 / Schema 10) |
| Table `revenues` Supabase dès J1 | ✅ **Retenu** | GF1 (chaque venture doit avoir ≥1 entrée à J30) |
| Kill switch validation 7-jours | ✅ **Retenu (durci à J21)** | GF8 (3 ventures simultanées → besoin signal stable plus long) |
| Telegram bot pour approbation gate | ✅ **Retenu** | Spec dans `CEO_REPORT_TEMPLATE.md` (signaux Michael) |
| Self-hosted Langfuse | ✅ **Retenu** | Stack lockée + cf. `VPS_HOSTINGER_SETUP.md` |
| n8n comme workflow engine v1 | ✅ **Retenu (avec extension)** | n8n + Trigger.dev (le second pour code-driven workflows critiques) |
| Anthropic Batch API pour non-urgent | ✅ **Retenu** | Weekly Report + Monthly Audit via batch (50% off) |
| Drop Manus comme "operator autonome" | ✅ **Retenu** | SOVRA n'a aucune dépendance Manus |
| Drop Genspark Claw comme fleet | ✅ **Retenu** | Claw reste use-on-demand uniquement (intern personnel) |
| Drop CrewAI/AutoGen/LangGraph framework-driven | ⚠️ **Partiellement** | SOVRA utilise LangGraph (MIT) pour orchestration mais pas comme multi-agent debate framework. Anthropic warning respectée: "simple composable patterns, not complex frameworks" |
| Hostinger VPS au lieu de Hetzner | ✅ **Retenu** | KVM 4 déjà possédé, économie ~$30/mo (cf. `VPS_HOSTINGER_SETUP.md`) |
| Claude Code Pro comme build channel | ✅ **Retenu** | Outil de build, pas runtime |
| Drop Perplexity API routine | ✅ **Retenu** | Use-on-demand seulement |

---

## 3. Décisions rejetées (et pourquoi)

| Recommandation AI Venture HQ | Statut SOVRA | Raison du rejet |
|------------------------------|--------------|-----------------|
| "Build Alpha seule, prouve 7 jours, clone" | ❌ **Rejeté** | Michael a tranché: 3 ventures Day 1 avec engine partagé. Compensation: GF8 kill switch J21 + governance 5 layers + budget cap par venture |
| Greek-letter naming (Alpha/Bravo/Charlie/Delta) | ❌ **Rejeté** | Ventures nommées avec hypothèses business réelles: Suivia AP/AR, NOORKI Pro Suite, Dad School. Naming = signal d'intentionnalité business |
| 2-model Council strict (Sonnet + Flash uniquement) | ❌ **Rejeté** | SOVRA opère Quinn (Qwen) + Depsy (DeepSeek) pour le volume + Anthropic Sonnet pour le critique + OpenAI ponctuel. Diversité multi-vendor recherchée |
| Budget $80–120/mo strict | ❌ **Rejeté** | SOVRA cap = $1,150/mo (3 ventures × engine partagé). Justifié par hypothèse de revenu nommée par venture (cible $15K MRR consolidé M6) |
| "Aucune venture nommée, aucune hypothèse de revenu" | ❌ **Inversé** | C'est précisément ce que SOVRA corrige Day 1 (cf. `HOLDING_PORTFOLIO_V1.md`) |

---

## 4. Citations préservées (source primaire)

Les citations clés de l'analyse froide qui guident la doctrine SOVRA :

### 4.1 Sur les multi-agents

> *"In our data, agents typically use about 4× more tokens than chat interactions, and multi-agent systems use about 15× more tokens than chats. For economic viability, multi-agent systems require tasks where the value of the task is high enough to pay for the increased performance."*
>
> — Anthropic, *How we built our multi-agent research system* (juin 2025)

**Application SOVRA:** GF5 stop-loss + cap budget par venture + Quinn/Depsy en première ligne (low-cost) pour absorber le multiplicateur.

> *"Actions carry implicit decisions, and conflicting decisions carry bad results."*
>
> — Walden Yan, *Don't Build Multi-Agents* (Cognition AI, 12 juin 2025)

**Application SOVRA:** Un seul Agent CEO par venture. Pas de débat multi-agent au sein d'une venture. Joris L2 coordonne, ne débat pas.

### 4.2 Sur la sycophancy

> *"Sycophancy is a core failure mode that amplifies disagreement collapse before reaching a correct conclusion in multi-agent debates, yields lower accuracy than single-agent baselines."*
>
> — Yao et al., *Peacemaker or Troublemaker* (arXiv:2509.23055, AWS AI Labs + UW-Madison, sept 2025)

**Application SOVRA:** GF6 force le L1 Risk Office (Auditor) à lister ≥3 failure modes avant approbation. Anti-consensus by design.

### 4.3 Sur la simplicité

> *"Consistently, the most successful implementations use simple, composable patterns rather than complex frameworks."*
>
> — Anthropic, *Building Effective Agents* (avril 2025)

**Application SOVRA:** Shared Execution Engine = un seul code path paramétré, pas 3 stacks distincts. n8n pour orchestration simple, LangGraph uniquement pour les flows complexes nécessitant état persistant.

### 4.4 Sur le P&L

> *"Pilots that lack a clear human checkpoint and a workflow-integrated value loop fail; the 5% that succeed are domain-specific, workflow-integrated, with named owners."*
>
> — Challapally, Pease, Raskar, Chari, *The GenAI Divide: State of AI in Business 2025* (MIT NANDA, juillet 2025; 52 interviews exec + 153 surveys + 300 reviews)

**Application SOVRA:** GF1 table `revenues` dès J1 + L0 Michael comme approval gate + 3 ventures domain-specific (B2B finance ops PME QC, B2B real estate, B2C digital) avec Agent CEO nommé par venture.

### 4.5 Sur les modèles

> *"GPT-5.5 — 86% hallucination rate vs Claude Opus 4.7 at 36% and Gemini 3.1 Pro at 50%"*
>
> — Artificial Analysis, AA-Omniscience benchmark (avril 2026)

**Application SOVRA:** L1 Risk Office (Auditor) = Claude Sonnet 4.5 ou Opus 4.7 sur les décisions critiques. GPT-5.x reste utile pour tool-orchestration et secondary critic, jamais final synthesizer.

> *"We went from 9% error rate on Sonnet 4 to 0% on our internal code editing benchmark. Higher tool success at lower cost is a major leap for agentic coding."*
>
> — Michele Catasta, President of Replit, dans Anthropic Sonnet 4.5 launch post

**Application SOVRA:** Build channel = Claude Code (Sonnet 4.5/Opus 4.7) pour développer le shared engine et les workflows n8n.

---

## 5. Outils tranchés (verdict final SOVRA)

### 5.1 KEEP (dans la stack ou utilisée régulièrement)

| Outil | Rôle SOVRA | Coût mensuel estimé |
|-------|-----------|---------------------|
| VPS Hostinger KVM 4 | Substrat n8n + Langfuse + Postgres + Caddy | $0 marginal (déjà payé) |
| Supabase cloud (free → Pro) | DB métier SOVRA (tables revenues, tasks, costs, etc.) | $0–25 |
| n8n self-host | Workflow engine principal | $0 |
| Langfuse self-host | Observability LLM, traces, scoring | $0 |
| Anthropic API (Sonnet 4.5 + Opus 4.7 ponctuel) | L1 Auditor + L2 Joris + synthèse critique | $80–150 |
| OpenAI API (GPT-5 Mini + ponctuel) | Secondary critic + outils spécifiques | $30–60 |
| Google AI Studio (Gemini Flash) | Volume scout (fallback Quinn/Depsy) | $5–20 |
| Qwen API (via DashScope ou self-host) | Quinn — volume worker primaire | $20–60 |
| DeepSeek API | Depsy — code/raisonnement low-cost | $15–40 |
| Telegram Bot | Approval gate Michael (L0) | $0 |
| Claude Code Pro (build channel) | Développement workflows + code | $20 (ou Max $100 si volume) |
| OneDrive (déjà connecté) | Backups Postgres + archives | $0 marginal |
| **Total cible mensuelle** | | **~$170–375** (selon volume) |

Vs cap budgétaire $1,150/mo → **headroom de $775–980/mo** pour Opus 4.7 strategic, Perplexity on-demand, Genspark Claw mois spécifique, Trigger.dev paid si croissance.

### 5.2 USE-ON-DEMAND (subscribe et cancel par projet)

| Outil | Trigger d'activation | Trigger de désactivation |
|-------|---------------------|--------------------------|
| Genspark Claw ($40/mo Standard) | Deliverable multi-jours nécessitant WhatsApp/Slack triggers | Project ends → cancel |
| Perplexity Pro ($20/mo) | Décision avec claim regulatory/légal/competitor revenue, impact >$200 | Décision shipped → cancel |
| Claude Opus 4.7 (API) | Synthèse stratégique mensuelle OU décision venture >$500 | Per-call |
| Anthropic Batch API | Job non-urgent >100 LLM calls | Per-job (50% discount auto) |
| Manus (free tier ponctuel) | Research-burst single-shot <24h | Per-task, jamais subscribe |
| ChatGPT Plus ($20/mo) | Usage personnel ideation/writing | Personal choice, hors budget SOVRA |

### 5.3 BANNED (v1)

| Outil | Raison du ban |
|-------|---------------|
| Manus subscription paid | Credit unpredictability + Meta acquisition uncertainty (NDRC block avril 2026) |
| Genspark Super Agent paid | Session-based, incompatible multi-week workflows |
| Genspark Claw comme fleet | $40/user/mo × N agents = blow le budget |
| ChatGPT Plus/Team comme "Board Chair" | Rôle attribué à Claude Sonnet/Opus (hallucination rate plus bas) |
| Lovable / v0 / Bolt pour dashboard v1 | Notion + Supabase Studio gratuits suffisent |
| LangSmith paid tier | Langfuse self-host couvre 90% du besoin à $0 |
| Replit Agent / Devin / Cursor Ultra | Build channel = Claude Code; Devin 13.86% SWE-bench fin-to-end insuffisant |
| AutoGen / CrewAI au runtime | Multi-agent framework risk; SOVRA = simple composable patterns |
| n8n (CC-BY-4.0 license fail), Make/Zapier | Licence ou pricing incompatible; SOVRA = n8n Sustainable Use OK + Trigger.dev (Apache 2.0) |

---

## 6. Différentiel architectural net

### Ancien plan AI Venture HQ (avril 2026)
```
[Board 5 IA]
    │
    ├── ChatGPT (Chair / final decision)   ← REJETÉ (86% halluc)
    ├── Claude (CTO / auditor)             ← retenu pour Auditor
    ├── Gemini (Scout)                     ← retenu pour fallback
    ├── Perplexity (Validator)             ← use-on-demand only
    └── [5e seat]                          ← jamais défini
    │
    └── 4 Venture Agents Alpha/Bravo/Charlie/Delta
        (autonomes via Manus/Claw)          ← REJETÉ
```

### Nouvelle doctrine SOVRA (mai 2026)
```
[L0 Michael Boyer]  — Owner, capital, kill switch, ratification
       │
[L1 Risk Office]    — Hermes Auditor (Sonnet 4.5) + Michael "risk hat"
       │
[L2 Joris]          — Operating Partner (Sonnet 4.5 + GPT-5)
       │
[L3 Agent CEOs]     — Un par venture nommée
   ├── hermes-operator.suivia      → Suivia AP/AR (B2B PME QC)
   ├── hermes-closer.noorki        → NOORKI Pro Suite (B2B real estate)
   └── hermes-builder.dadschool    → Dad School (B2C digital)
       │
[L4 Sub-agents]     — Quinn (Qwen) + Depsy (DeepSeek) — volume execution
```

**Différences clés:**
- 5 layers governance > flat board (chaîne de responsabilité)
- 3 ventures nommées avec hypothèse revenu > 4 agents abstraits
- Sub-agents low-cost (Quinn/Depsy) > Manus/Claw burn
- Shared Execution Engine > 3 stacks dupliqués

---

## 7. Ce que SOVRA doit prouver à 90 jours

Le test décisif que l'ancien plan recommandait à 7 jours (sur Alpha seule), SOVRA le passe à 90 jours sur portefeuille :

| Critère J90 | Cible | Conséquence si raté |
|-------------|-------|---------------------|
| ≥1 venture avec MRR récurrent | $500+/mo | Si 0: pause portefeuille, retour mono-venture (Suivia seule) |
| 2 ventures sur 3 actives (non-paused) | 2/3 | Si <2: kill switch portefeuille déclenché |
| Budget consommé vs cap | <$1,150/mo | Si dépassement >20%: governance review L0 obligatoire |
| Score moyen Auditor portefeuille | ≥80 | Si <70: prompts/rubrique reviewed |
| Cache hit rate moyen | ≥60% | Si <40%: caching strategy revue |
| 0 incident L0 critique | 0 | Si ≥1: post-mortem + GF supplémentaire |

---

## 8. Conclusion

L'ancien plan AI Venture HQ était **opérationnellement juste, business vide**. SOVRA est **business défini, opérationnellement à câbler** — et les 8 garde-fous de `OPERATIONAL_SAFEGUARDS_V1.md` ferment l'écart.

Cette annexe préserve la rigueur de l'analyse froide pour qu'aucune leçon ne soit perdue dans la transition.

---

**Statut docs:** Annexe historique. Aucun engagement runtime. Référence pour audits futurs et décisions de governance L0.
