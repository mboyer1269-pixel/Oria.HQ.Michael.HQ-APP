# Holding Portfolio v1 — Trois Ventures au Jour 1

> **Historical context only.** This document does not define the canonical Venture Engine model. The canonical direction is [`VENTURE_ENGINE_RECALIBRATION.md`](VENTURE_ENGINE_RECALIBRATION.md).
>
> **Branch:** `claude/agentic-holding-company-operating-model`
> **Status:** Draft — soumis à ratification Owner + Risk Office
> **Parent doctrine:** [`AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md`](AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md)
> **Compagnon stratégique:** [`STRATEGIC_ANALYSIS_CTO_2026Q2.md`](STRATEGIC_ANALYSIS_CTO_2026Q2.md)
> **Last updated:** 2026-05-22

---

## 1. Décision d'Owner

Le portfolio initial de la holding SOVRA est composé de **trois Company Charters ratifiées au Jour 1**, opérées sur un **moteur d'exécution unique**.

| # | Venture | Type | Pricing | Time-to-first-revenue |
|:--:|---------|------|---------|------------------------|
| 1 | **Suivia AP/AR** | B2B Finance Ops PMEs QC | $500 / $1 200 / $2 500 + usage caps | 30-60 jours |
| 2 | **NOORKI Pro Suite** | B2B Real Estate Courtiers | 597-997 $/mois | 30-45 jours (prospect chaud) |
| 3 | **Dad School** | B2C Digital + Communauté | 9-19 $/mois + produits 27-97 $ | 30-90 jours |

Cette décision **dévie** de la recommandation du CTO compagnon ("un seul vertical à la fois") mais **respecte** sa contrainte structurante : *les ventures peuvent coexister uniquement si elles partagent le même moteur d'exécution sous le capot*.

### 1.1 Pourquoi trois et pas une

| Argument | Validation |
|----------|------------|
| Diversification de risque marché | 3 marchés non corrélés (finance B2B / immo B2B / B2C produit digital) → un échec n'efface pas la holding |
| Avantage de domaine déjà payé | Suivia (services PME) + NOORKI (immo) + DADZCO/Dad School (parents) sont déjà des marques/territoires connus de Michael |
| Test de scalabilité du modèle SOVRA | Le doctrine n'a de valeur que si elle gère plus d'une venture simultanément |
| Une stack unique = un seul coût d'apprentissage | Si Joris + Quinn/Depsy + Langfuse + Supabase tournent, ils tournent pour les 3 |
| Différents canaux d'acquisition testés en parallèle | LinkedIn (Suivia), réseau direct (NOORKI), TikTok/SEO/email (Dad School) — pas de canal unique au paris |

### 1.2 Pourquoi pas plus de trois

- Bande passante Owner + Risk Office finie.
- Joris ne peut pas tenir un comité opérationnel sur plus de 3 ventures en parallèle sans dégrader la qualité d'audit.
- Quatre marchés = Owner devient routeur de tickets, pas allocateur de capital.

### 1.3 Conditions strictes attachées à la décision

Cette ratification est **conditionnée à 4 invariants** :

1. **Stack unique sous le capot** — voir [`SHARED_EXECUTION_ENGINE.md`](SHARED_EXECUTION_ENGINE.md). Aucune venture n'a le droit d'introduire un framework ou un provider hors stack sans re-ratification.
2. **Aucune venture n'a d'autonomy ≥ 4 au Jour 1.** Toutes démarrent à **autonomy 3 (Recommend)**. Promotions individuelles selon critères mesurables (`AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md` §6).
3. **Budget cap mensuel total des 3 ventures ≤ 1 500 $/mois (API + outils + spend) au Jour 1.** Tout dépassement = pause automatique de la venture en burst.
4. **Kill switch portfolio** — si à J90 aucune venture n'a signé son 1er client payant, le portfolio entre en revue forcée et 2 des 3 ventures sont mises en pause.

---

## 2. Cartographie du portfolio

```
┌─────────────────────────────────────────────────────────────────┐
│                    Michael HQ (Owner)                            │
│                Capital + Kill Switch + Ratification              │
└─────────────────────────┬────────────────────────────────────────┘
                          │
                ┌─────────┴──────────┐
                │   Risk Office      │  veto indépendant
                │   (Hermes Auditor) │  + Michael "risk hat"
                └─────────┬──────────┘
                          │
                ┌─────────┴──────────┐
                │      Joris         │  routeur + planificateur
                │ (Operating Partner)│  OpenAI / Anthropic
                └────┬────┬─────┬────┘
                     │    │     │
        ┌────────────┘    │     └────────────┐
        ▼                 ▼                  ▼
┌───────────────┐  ┌──────────────┐  ┌─────────────────┐
│ Suivia AP/AR  │  │ NOORKI Pro   │  │   Dad School    │
│ Agent CEO:    │  │ Agent CEO:   │  │  Agent CEO:     │
│ hermes-       │  │ hermes-      │  │  hermes-builder │
│ operator      │  │ closer       │  │  .dadschool     │
│ .suivia       │  │ .noorki      │  │                 │
└──────┬────────┘  └──────┬───────┘  └────────┬────────┘
       │                  │                   │
       └──────────────────┼───────────────────┘
                          ▼
              ┌──────────────────────┐
              │   Shared Execution   │
              │       Engine         │
              │                      │
              │  Sub-agents:         │
              │  • Quinn (Qwen)      │
              │  • Depsy (DeepSeek)  │
              │                      │
              │  Skills atomiques :  │
              │  • doc.extract       │
              │  • brief.compose     │
              │  • signal.collect    │
              │  • content.generate  │
              │  • lead.qualify      │
              │  • copy.optimize     │
              │                      │
              │  Infra :             │
              │  • LangGraph         │
              │  • Supabase          │
              │  • Langfuse          │
              │  • Trigger.dev       │
              │  • Mem0              │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │       Ledger         │
              │  (append-only,       │
              │   per-call,          │
              │   per-venture)       │
              └──────────────────────┘
```

---

## 3. Le pari de chaque venture en une phrase

| Venture | Pari |
|---------|------|
| **Suivia AP/AR** | Les PMEs québécoises 11-200 employés paient 1 200 $/mois pour automatiser le matching factures/POs avec un agent qui escalade les exceptions, parce qu'aucun acteur FR-CA ne le fait. |
| **NOORKI Pro Suite** | Un courtier immo individuel paie 597-997 $/mois pour avoir en 2 minutes ce que sa concurrence met 4 heures à produire : descriptifs MLS, fiches réseaux sociaux, scripts vidéo, scoring de leads et briefing de marché hebdo. |
| **Dad School** | Les nouveaux papas francophones (25-40 ans, primo-parents) paient 9-19 $/mois pour une newsletter + bibliothèque de mini-cours pratiques au ton décontracté (sommeil bébé, finances famille, road trips, gear), avec une marge brute > 90 % et un content engine 100 % agentique. |

---

## 4. Matrice de partage des ressources

| Ressource | Suivia | NOORKI | Dad School | Réutilisation |
|-----------|:------:|:------:|:----------:|:-------------:|
| **Joris (orchestrateur)** | ✅ | ✅ | ✅ | 100 % |
| **Quinn (Qwen — bas coût)** | ✅ extract factures | ✅ extract MLS | ✅ génère content | 100 % |
| **Depsy (DeepSeek — bas coût)** | ✅ matching | ✅ scoring leads | ✅ copy optimize | 100 % |
| **Hermes Auditor** | ✅ | ✅ | ✅ | 100 % |
| **Langfuse observabilité** | ✅ | ✅ | ✅ | 100 % |
| **Supabase DB+Auth** | ✅ tenant 1 | ✅ tenant 2 | ✅ tenant 3 | 100 % |
| **Trigger.dev jobs** | ✅ | ✅ | ✅ | 100 % |
| **Mem0 mémoire** | ✅ par client | ✅ par courtier | ✅ par abonné | 100 % |
| **shadcn/ui design system** | ✅ dashboard | ✅ dashboard | ✅ landing+portail | 100 % |
| **Skill `doc.extract`** | ✅ factures | ✅ fiches MLS | — | 66 % |
| **Skill `content.generate`** | — | ✅ descriptifs | ✅ articles newsletter | 66 % |
| **Skill `lead.qualify`** | — | ✅ | — | 33 % |
| **Skill `brief.compose`** | ✅ rapports mensuels | ✅ briefing marché hebdo | — | 66 % |
| **Domain-specific prompts** | propre | propre | propre | 0 % |

**Lecture :** ~85 % de la stack est partagée. Ce qui est propre à chaque venture = prompts métier, schémas de données spécifiques, et la copy marketing du landing.

---

## 5. Économique consolidée (Mois 1 à 6)

### 5.1 Coûts variables (API + infra) consolidés

| Mois | Suivia clients | NOORKI clients | Dad School abos | Coût API total | Coût infra | Coût total |
|:----:|:--:|:--:|:---:|:-----:|:-----:|:------:|
| M1 | 0 | 0 | 0 | ~30 $ (tests) | 70 $ | ~100 $ |
| M2 | 1 pilote | 1 | 20 | ~120 $ | 80 $ | ~200 $ |
| M3 | 2 | 2 | 80 | ~280 $ | 90 $ | ~370 $ |
| M4 | 4 | 4 | 180 | ~480 $ | 110 $ | ~590 $ |
| M5 | 6 | 6 | 320 | ~720 $ | 130 $ | ~850 $ |
| M6 | 9 | 8 | 500 | ~1 080 $ | 150 $ | ~1 230 $ |

> **Hypothèses :** prix moyen API par mission ~0,005-0,02 $ grâce au routage Quinn/Depsy ; ~70 % des appels passent par sub-agents bas coût ; Joris (OpenAI/Anthropic) ne touche que la planification et la validation.

### 5.2 Revenus consolidés (scénario central)

| Mois | Suivia MRR | NOORKI MRR | Dad School MRR | Total MRR | Total ARR |
|:----:|:----:|:----:|:----:|:-----:|:-------:|
| M1 | 0 | 0 | 0 | 0 | 0 |
| M2 | 0 (pilote gratuit) | 597 | 180 | 777 | 9 324 |
| M3 | 1 200 | 1 194 | 720 | 3 114 | 37 368 |
| M4 | 2 400 | 2 388 | 1 620 | 6 408 | 76 896 |
| M5 | 3 600 | 3 582 | 2 880 | 10 062 | 120 744 |
| M6 | 6 000 | 4 776 | 4 500 | 15 276 | 183 312 |

> **Hypothèses :** Suivia pilote gratuit M2 → payant M3 à 1 200 $ + 1 client/mois ; NOORKI premier client M2 à 597 $, +1/mois en moyenne ; Dad School croissance organique TikTok/SEO 60 → 100 % MoM les 3 premiers mois puis ralentit. **Ces chiffres sont des objectifs ambitieux, pas des projections de banquier.**

### 5.3 Marge brute consolidée

À M6 : ~15 276 $ MRR / ~1 230 $ COGS ≈ **92 % gross margin consolidée**. La marge < 85 % uniquement si Suivia ou NOORKI a un client avec volume API anormalement haut (déclenche un audit Hermes Money).

### 5.4 Point mort holding

Couvrir 1 500 $/mois (cap budget) + ~3 000 $/mois "salaire minimum Owner" = **4 500 $/mois MRR consolidé**. Atteint au **Mois 4** dans le scénario central. **Conservativement, mois 5-6.**

---

## 6. Plan d'exécution 30 jours — réécrit pour le portfolio

### Semaine 1 — Infrastructure partagée + Charters

| Jour | Livrable | Owner |
|:--:|----------|-------|
| J1 | PR #52 mergée (cette PR : doctrine SOVRA + portfolio v1 + 3 Charters + Joris + Engine) | Owner + Risk Office |
| J2 | Update README → pointer Portfolio v1 | Joris |
| J3 | Supabase : projet créé, schéma multi-tenant initial (`tenants`, `ventures`, `missions`, `ledger`) | Owner |
| J4 | Langfuse self-hosted ou cloud branché ; Joris écrit ses 5 premières traces | Owner |
| J5 | Trigger.dev compte créé + 1 job hello-world signé Joris | Owner |
| J6-7 | Skills atomiques `doc.extract`, `brief.compose`, `content.generate` — specs écrites (pas code) | Joris |

### Semaine 2 — Skills + Premiers pilotes

| Jour | Livrable | Owner |
|:--:|----------|-------|
| J8-10 | `doc.extract` implémentée (LangGraph + Quinn) ; testée sur 20 factures factices Suivia + 20 MLS NOORKI | Joris |
| J11 | `content.generate` implémentée ; teste 10 articles Dad School (drafts internes, non publiés) | Joris |
| J12 | **NOORKI** : appel découverte avec le courtier prospect, qualification, scope de pilote 30 jours | Owner |
| J13 | **Dad School** : landing page v1 publiée (shadcn/ui + email capture), pas de contenu encore | Owner |
| J14 | **Suivia** : 10 outreach LinkedIn vers CFO/contrôleurs PMEs QC (manuel, par Michael) | Owner |

### Semaine 3 — Production + Signature pilotes

| Jour | Livrable | Owner |
|:--:|----------|-------|
| J15 | **NOORKI pilote signé** (courtier individuel, tarif réduit M1 200-400 $) ; setup tenant Supabase | Owner |
| J16-17 | **NOORKI** : premier listing traité bout-en-bout par l'agent ; QA Owner avant livraison | Joris |
| J18 | **Dad School** : 5 premiers articles publiés ; setup Substack/ConvertKit ; 1er email broadcast | Joris |
| J19 | **Suivia** : 3 calls découverte tenus ; 1-2 pilotes verbalement accrochés | Owner |
| J20-21 | **NOORKI** : 5 listings traités, feedback courtier intégré ; itération prompts | Joris |

### Semaine 4 — Premier MRR + Audit

| Jour | Livrable | Owner |
|:--:|----------|-------|
| J22 | **Suivia** : 1 pilote signé (gratuit M1, payant M2 à 1 200 $) ; setup tenant | Owner |
| J23 | **Dad School** : 10 abonnés payants (objectif modeste, validation prix) | Joris |
| J24 | Premier rapport hebdo Joris → Michael consolidant les 3 ventures (template `CEO_REPORT_TEMPLATE.md`) | Joris |
| J25-26 | Audit Risk Office : Ledger complet, dérive prompts, coûts API par venture | Risk Office |
| J27 | Bilan 30 jours + décisions de pivot/promotion d'autonomy par venture | Owner |
| J28-30 | Sprint correctifs sur la venture la plus faible des 3 | Joris |

### KPI fin de Mois 1

| Métrique | Cible | Plancher |
|----------|:-----:|:---:|
| Suivia : pilote signé | 1 | 0 |
| NOORKI : MRR | 597 $ | 200 $ |
| Dad School : abonnés payants | 30 | 10 |
| Total MRR consolidé fin de mois | 1 000+ $ | 300 $ |
| Coût API total Mois 1 | < 200 $ | < 500 $ |
| Incidents `risk=high` non détectés | 0 | 0 |
| Ledger : complétude des actions externes | 100 % | 100 % |

**Si le plancher n'est pas atteint** sur ≥ 2 KPI, la venture la plus faible des 3 est mise en `paused` et ressources réallouées.

---

## 7. Comment ce portfolio respecte (ou tend) la doctrine SOVRA

| Doctrine SOVRA | Application portfolio |
|----------------|-----------------------|
| Une seule Charter par venture | ✅ 3 Charters distinctes, pas de tenant unique généraliste |
| Un seul Agent CEO par venture | ✅ 3 Agent CEOs nommés, pas de co-CEOs |
| Aucune Charter sans P&L réaliste (LTV/CAC ≥ 3) | ✅ Vérifié par venture (cf. Charters individuelles) |
| Aucun outreach autonome externe au Jour 1 | ✅ Tout outreach Suivia et NOORKI est manuel ou approuvé mission par mission |
| Budget cap mensuel par Charter | ✅ Suivia 500 / NOORKI 400 / Dad School 250 — total 1 150 $ < cap consolidé 1 500 |
| Autonomy ≤ 3 (Recommend) au Jour 1 | ✅ Les 3 ventures démarrent en autonomy 3 ; Dad School pourra monter à 4 plus vite (content publication interne) |
| Stack unique = pas d'éparpillement technique | ✅ Voir SHARED_EXECUTION_ENGINE.md |
| Kill switch par venture + par portfolio | ✅ Conditions explicites dans chaque Charter + condition portfolio J90 |

---

## 8. Risques portfolio (additionnels au Risk Register)

| ID | Risque spécifique au portfolio | Probabilité | Impact | Mitigation |
|----|-----|:--:|:--:|------|
| **P-01** | Owner trop dispersé entre 3 ventures → aucune ne décolle | Élevée | Très élevé | Joris consolide en 1 seul rapport hebdo ; Owner ne suit que les KPI de portfolio, pas le détail opérationnel |
| **P-02** | Une venture cannibalise les ressources API des 2 autres | Moyenne | Élevé | Budget cap dur par Charter ; Hermes Money alerte à 70 % du cap individuel |
| **P-03** | Skill partagée (`doc.extract`) cassée → 2 ventures plantent ensemble | Moyenne | Élevé | Versionnement strict des skills ; canary release ; rollback automatique sur erreur > 5 % |
| **P-04** | Confusion de marque (Michael apparaît dans 3 univers différents) | Moyenne | Faible | Marques distinctes (Suivia / NOORKI / Dad School) ; Michael en arrière-plan sauf pour outreach Suivia |
| **P-05** | Dad School traîne pendant 6 mois sans MRR significatif et grève la concentration | Moyenne | Moyen | Kill switch Dad School à M3 si < 20 abonnés payants OU < 500 inscrits gratuits |
| **P-06** | Le prospect NOORKI ne signe pas → la venture immo perd son anchor | Moyenne | Moyen | Plan B : 5 autres courtiers cibles dans le réseau immédiat de Michael à approcher S2 si signature S3 incertaine |

---

## 9. Décision finale d'Owner

Cette Portfolio v1 est **ratifiée sous condition** des invariants §1.3 et de la signature du Risk Office sur les 3 Charters individuelles.

À J30, deux issues possibles :

1. **Scenario A (cible) :** au moins 2 des 3 ventures ont un client payant. Le portfolio reste à 3.
2. **Scenario B :** une seule (ou aucune) a un client payant. Le portfolio passe à 2 (kill de la plus faible), ressources concentrées.

> Le but de la holding n'est pas d'avoir 3 ventures ouvertes. Le but est d'avoir 1, 2 ou 3 ventures **rentables**. La doctrine SOVRA permet les deux extrémités du spectre. C'est l'exécution qui tranche.

---

## Appendix — Liens

- [`AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md`](AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md) — doctrine mère
- [`STRATEGIC_ANALYSIS_CTO_2026Q2.md`](STRATEGIC_ANALYSIS_CTO_2026Q2.md) — analyse marché compagnon
- [`SHARED_EXECUTION_ENGINE.md`](SHARED_EXECUTION_ENGINE.md) — moteur d'exécution partagé
- [`JORIS_OPERATING_PROFILE.md`](JORIS_OPERATING_PROFILE.md) — Operating Partner profile
- [`charters/suivia.ap-ar.md`](charters/suivia.ap-ar.md) — Charter Suivia
- [`charters/noorki.pro-suite.md`](charters/noorki.pro-suite.md) — Charter NOORKI
- [`charters/dadschool.digital.md`](charters/dadschool.digital.md) — Charter Dad School
