# CEO Report Template — Joris → Michael

> **Branch:** `claude/readme-and-ceo-report-template`
> **Parent doctrine:** [`AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md`](AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md)
> **Operating Partner:** [`JORIS_OPERATING_PROFILE.md`](JORIS_OPERATING_PROFILE.md)
> **Last updated:** 2026-05-22

---

## 0. Pourquoi ce document

Joris a 4 cadences de reporting obligatoires vers Michael :

| Cadence | Cible | Audience | Format |
|---------|-------|----------|--------|
| **Daily Brief** | 7 h 00 (America/Toronto) | Owner | < 1 écran, lecture < 60 secondes |
| **Weekly Report** | Vendredi 17 h 00 | Owner + Risk Office | 1-2 pages, décisions à prendre |
| **Monthly Audit** | 1er du mois 09 h 00 | Owner + Risk Office | 3-5 pages, P&L consolidé + motions |
| **Incident Report** | Temps réel (push) | Owner immédiatement + Risk Office | < 5 lignes + lien Ledger |

**Règles universelles** :
- Français québécois, ton direct, zéro fluff.
- Format `Objectif / Étapes / Actions / Validation / Prochaine action` pour toute section appelant une décision.
- Chaque chiffre = source dans le Ledger (lien direct quand possible).
- Joris **challenge** les positions faibles de l'Owner. Pas de validation polie.
- Aucune action n'est exécutée par Joris à partir d'un rapport. Les rapports sont **informationnels et délibératifs**.

---

## 1. Daily Brief — Template

Envoyé tous les matins à 7 h 00 (cron via Trigger.dev). Objectif : 60 secondes de lecture, 1 décision attendue max.

````markdown
# Daily Brief — {{date_iso}} (jour {{day_of_holding}})

**Michael,** voici l'état de la holding ce matin.

## Snapshot 24 h

| Métrique | Valeur | Δ vs J-1 |
|----------|:------:|:--------:|
| MRR consolidé | {{mrr_total}} $ | {{mrr_delta}} |
| Clients payants actifs (3 ventures) | {{paying_clients}} | {{paying_delta}} |
| Coût API J-1 | {{api_cost_j1}} $ | {{api_cost_delta}} |
| Missions exécutées J-1 | {{missions_count}} | dont {{missions_failed}} échecs |
| Alertes Risk Office ouvertes | {{risk_alerts_open}} | dont {{risk_high}} `risk=high` |

## Par venture

### Suivia AP/AR
- {{suivia_clients_active}} clients actifs / cible M{{current_month}} = {{suivia_target}}
- MRR {{suivia_mrr}} $ — coût API {{suivia_api_cost}} $/mois projection
- Missions J-1 : {{suivia_missions}}
- Drapeau notable : {{suivia_flag_or_none}}

### NOORKI Pro Suite
- {{noorki_clients_active}} courtiers actifs / cible M{{current_month}} = {{noorki_target}}
- MRR {{noorki_mrr}} $ — coût API {{noorki_api_cost}} $/mois projection
- Listings traités J-1 : {{noorki_listings}}
- Drapeau notable : {{noorki_flag_or_none}}

### Dad School
- {{dadschool_paying}} abonnés payants / cible M{{current_month}} = {{dadschool_target}}
- {{dadschool_free}} abonnés newsletter gratuits
- MRR {{dadschool_mrr}} $ — coût API {{dadschool_api_cost}} $/mois projection
- Articles publiés J-1 : {{dadschool_articles}}
- Drapeau notable : {{dadschool_flag_or_none}}

## Une décision attendue aujourd'hui

> **{{decision_title}}**
>
> **Contexte** : {{decision_context}}
>
> **Recommandation Joris** : {{decision_recommendation}}
>
> **Risque si on n'agit pas** : {{decision_risk}}
>
> **Action attendue** : {{decision_action}} (≤ {{decision_time_minutes}} min)

## Prochaine action (Owner)

{{next_owner_action}}

---
*Sources Ledger : `ledger.venture_id IN (suivia.ap-ar, noorki.pro-suite, dadschool.digital) AND ts >= NOW() - INTERVAL '24h'`*
*Daily Brief ID : {{brief_id}} | Append-only*
````

### 1.1 Règles strictes Daily Brief

- **Une seule décision attendue par brief.** Si plusieurs s'accumulent, Joris consolide dans un Weekly Report ou déclenche un Incident Report.
- **Le brief s'auto-archive** au Ledger comme `action_type=brief.daily`.
- **Si une métrique manque** (ex: aucune mission J-1), Joris dit "0" — jamais "non disponible".
- **Si une venture est en `paused`**, sa section affiche `[PAUSED — motif : {{reason}} — depuis J{{since}}]`.

---

## 2. Weekly Report — Template

Envoyé chaque vendredi 17 h 00. Objectif : 1-2 pages, 2-5 décisions attendues, vue 7 jours.

````markdown
# Weekly Report — Semaine {{week_number}} (du {{week_start}} au {{week_end}})

**Pour :** Michael (Owner), Risk Office (cc)
**De :** Joris, Operating Partner

## TL;DR — 5 lignes

1. MRR consolidé : {{mrr_eow}} $ ({{mrr_wow_delta}} vs S-1)
2. Top win : {{top_win}}
3. Top miss : {{top_miss}}
4. Risque principal cette semaine : {{top_risk}}
5. Décision la plus urgente : {{top_decision}}

## KPI consolidés

| KPI | Valeur S | Cible M{{current_month}} | Statut | Δ S-1 |
|-----|:--------:|:------:|:------:|:-----:|
| MRR consolidé | {{mrr}} $ | {{mrr_target}} $ | {{mrr_status}} | {{mrr_delta}} |
| Clients payants actifs | {{clients}} | {{clients_target}} | {{clients_status}} | {{clients_delta}} |
| Coût API hebdo | {{api_cost}} $ | < {{api_budget}} $ | {{api_status}} | {{api_delta}} |
| Marge brute consolidée | {{gm}} % | ≥ 85 % | {{gm_status}} | {{gm_delta}} |
| Missions clean / total | {{clean}}/{{total}} | ≥ 95 % | {{clean_status}} | — |
| Alertes Risk Office levées | {{risk_resolved}} | — | — | — |

## Par venture — détail

### Suivia AP/AR

| Item | Valeur |
|------|--------|
| Statut | {{suivia_status}} |
| Agent CEO | hermes-operator.suivia (autonomy {{suivia_autonomy}}) |
| MRR | {{suivia_mrr}} $ — cible M{{current_month}} : {{suivia_target}} $ |
| Clients payants | {{suivia_clients}} |
| Pipeline (calls + verbaux) | {{suivia_pipeline}} |
| Missions S | {{suivia_missions}} dont {{suivia_failed}} échouées |
| Top friction | {{suivia_friction}} |
| Recommandation Joris | {{suivia_reco}} |

### NOORKI Pro Suite

| Item | Valeur |
|------|--------|
| Statut | {{noorki_status}} |
| Agent CEO | hermes-closer.noorki (autonomy {{noorki_autonomy}}) |
| MRR | {{noorki_mrr}} $ — cible M{{current_month}} : {{noorki_target}} $ |
| Courtiers actifs | {{noorki_clients}} |
| Listings traités S | {{noorki_listings}} |
| Listing acceptance rate | {{noorki_acceptance}} % (cible ≥ 75 %) |
| Top friction | {{noorki_friction}} |
| Recommandation Joris | {{noorki_reco}} |

### Dad School

| Item | Valeur |
|------|--------|
| Statut | {{dadschool_status}} |
| Agent CEO | hermes-builder.dadschool (autonomy {{dadschool_autonomy}}) |
| MRR | {{dadschool_mrr}} $ — cible M{{current_month}} : {{dadschool_target}} $ |
| Abonnés Pro | {{dadschool_pro}} / abonnés newsletter {{dadschool_free}} |
| Articles publiés S | {{dadschool_articles}} |
| Open rate newsletter | {{dadschool_open_rate}} % (cible ≥ 45 %) |
| Top friction | {{dadschool_friction}} |
| Recommandation Joris | {{dadschool_reco}} |

## Décisions attendues cette semaine

### Décision 1 — {{decision_1_title}}

- **Objectif** : {{decision_1_objective}}
- **Contexte 3 lignes** : {{decision_1_context}}
- **Options analysées par Joris** :
  - Option A : {{decision_1_option_a}} — coût {{decision_1_cost_a}} — risque {{decision_1_risk_a}}
  - Option B : {{decision_1_option_b}} — coût {{decision_1_cost_b}} — risque {{decision_1_risk_b}}
- **Recommandation Joris** : Option {{decision_1_reco}}
- **Validation** : {{decision_1_validation}}
- **Prochaine action si approuvée** : {{decision_1_next_action}}

### Décision 2 — {{decision_2_title}}
(idem structure — répéter jusqu'à 5 max)

## Motions formelles à ratifier

(Promotion d'autonomy, modification Charter, ouverture nouvelle venture, allocation budget exceptionnelle.)

| ID motion | Type | Objet | Signature requise | Délai |
|-----------|------|-------|-------------------|:-----:|
| {{motion_id}} | {{motion_type}} | {{motion_object}} | Owner + Risk Office | {{motion_deadline}} |

## Risques semaine

| ID | Risque | Sévérité | Mitigation en cours | Owner |
|----|--------|:--------:|---------------------|-------|
| {{risk_id}} | {{risk_desc}} | {{risk_sev}} | {{risk_mitigation}} | {{risk_owner}} |

## Ce que Joris a refusé d'exécuter cette semaine

(Transparence sur les gates appliquées.)

- {{refusal_1}}
- {{refusal_2}}

## Ce que Joris challenge cette semaine

(Hypothèses ou décisions Owner que Joris remet en question.)

> {{challenge_1}}
>
> {{challenge_2}}

## Calendrier S+1

| Jour | Échéance / livraison attendue |
|------|--------------------------------|
| Lun | {{mon}} |
| Mar | {{tue}} |
| Mer | {{wed}} |
| Jeu | {{thu}} |
| Ven | {{fri}} |

---
*Weekly Report ID : {{report_id}} | Ledger : `action_type=report.weekly` | Append-only*
````

### 2.1 Règles strictes Weekly Report

- **Maximum 5 décisions attendues.** Au-delà, signe que Joris a accumulé du retard d'audit ou que le portfolio est sur-tendu.
- **La section "Ce que Joris challenge"** est obligatoire. Si vide deux semaines de suite, Risk Office demande une revue (signe que Joris est trop docile).
- **La section "Ce que Joris a refusé d'exécuter"** est obligatoire. Si vide deux semaines de suite, audit du runtime (les gates ont-ils été contournés ?).

---

## 3. Monthly Audit — Template

Envoyé le 1er du mois à 9 h 00. Objectif : 3-5 pages, P&L consolidé, motions de promotion, audit Ledger.

````markdown
# Monthly Audit — {{month_name}} {{year}}

**Pour :** Michael (Owner), Risk Office (cc)
**De :** Joris, Operating Partner
**Période :** {{month_start}} au {{month_end}}

## 1. P&L Consolidé du mois

| Ligne | Suivia | NOORKI | Dad School | Holding | TOTAL |
|-------|:------:|:------:|:----------:|:-------:|:-----:|
| MRR fin de mois | {{s_mrr}} $ | {{n_mrr}} $ | {{d_mrr}} $ | — | {{t_mrr}} $ |
| Revenus encaissés mois | {{s_rev}} $ | {{n_rev}} $ | {{d_rev}} $ | — | {{t_rev}} $ |
| Coût API | {{s_api}} $ | {{n_api}} $ | {{d_api}} $ | {{h_api}} $ | {{t_api}} $ |
| Coût infra | {{s_infra}} $ | {{n_infra}} $ | {{d_infra}} $ | {{h_infra}} $ | {{t_infra}} $ |
| Coût acquisition | {{s_cac}} $ | {{n_cac}} $ | {{d_cac}} $ | — | {{t_cac}} $ |
| **Marge brute** | **{{s_gm}} %** | **{{n_gm}} %** | **{{d_gm}} %** | — | **{{t_gm}} %** |
| Cash net mois | {{s_cash}} $ | {{n_cash}} $ | {{d_cash}} $ | {{h_cash}} $ | **{{t_cash}} $** |

## 2. Cohorte clients

| Venture | Acquis M | Churné M | Net M | LTV moyenne | LTV/CAC |
|---------|:--------:|:--------:|:-----:|:-----------:|:-------:|
| Suivia | {{s_acq}} | {{s_churn}} | {{s_net}} | {{s_ltv}} $ | {{s_ratio}} |
| NOORKI | {{n_acq}} | {{n_churn}} | {{n_net}} | {{n_ltv}} $ | {{n_ratio}} |
| Dad School | {{d_acq}} | {{d_churn}} | {{d_net}} | {{d_ltv}} $ | {{d_ratio}} |

## 3. Audit du Ledger

| Item | Résultat |
|------|----------|
| Entrées Ledger total mois | {{ledger_count}} |
| Entrées avec chaînage valide (signature OK) | {{ledger_valid}} / {{ledger_count}} |
| Actions externes tracées | {{external_actions}} |
| Actions externes sans approbation (devraient être 0) | {{external_unapproved}} |
| Dépenses tracées vs facturation provider | écart {{spend_drift}} % |
| Brouillons interdits exécutés | {{forbidden_executed}} (cible : 0) |

**Verdict Ledger** : {{ledger_verdict}}

## 4. Performance Agent CEOs

| Agent CEO | Missions M | Clean rate | Erreurs schéma | Red Team flags | Autonomy actuelle | Motion ? |
|-----------|:----------:|:----------:|:--------------:|:--------------:|:-----------------:|:---:|
| hermes-operator.suivia | {{s_missions}} | {{s_clean}} % | {{s_schema_err}} | {{s_flags}} | {{s_auto}} | {{s_motion}} |
| hermes-closer.noorki | {{n_missions}} | {{n_clean}} % | {{n_schema_err}} | {{n_flags}} | {{n_auto}} | {{n_motion}} |
| hermes-builder.dadschool | {{d_missions}} | {{d_clean}} % | {{d_schema_err}} | {{d_flags}} | {{d_auto}} | {{d_motion}} |

## 5. Motions à ratifier

(Promotions d'autonomy, modifications de Charter, ouvertures/fermetures de ventures.)

### Motion {{motion_id_1}} — {{motion_title_1}}

- **Type** : {{motion_type_1}}
- **Justification** : {{motion_just_1}}
- **Critères remplis** : {{motion_criteria_1}}
- **Risques résiduels** : {{motion_residual_1}}
- **Recommandation Joris** : {{motion_reco_1}}
- **Signature requise** : Owner + Risk Office
- **Délai** : {{motion_deadline_1}}

## 6. Risques structurels du mois

(R-IDs du Risk Register touchés ce mois.)

| R-ID | Manifestation | Sévérité réelle | Mitigation appliquée |
|------|---------------|:---------------:|----------------------|
| {{r_id}} | {{r_manif}} | {{r_sev}} | {{r_miti}} |

## 7. Ce que la holding a appris ce mois

(Apprentissages structurels, pas anecdotiques.)

1. {{learning_1}}
2. {{learning_2}}
3. {{learning_3}}

## 8. Prochain mois — plan d'allocation

| Venture | Budget alloué M+1 | Autonomy cible M+1 | Bet du mois |
|---------|:-----------------:|:------------------:|-------------|
| Suivia | {{s_budget_m1}} $ | {{s_auto_m1}} | {{s_bet}} |
| NOORKI | {{n_budget_m1}} $ | {{n_auto_m1}} | {{n_bet}} |
| Dad School | {{d_budget_m1}} $ | {{d_auto_m1}} | {{d_bet}} |

## 9. Décision portfolio attendue

> **{{portfolio_decision_title}}**
>
> {{portfolio_decision_body}}

---
*Monthly Audit ID : {{audit_id}} | Ledger : `action_type=audit.monthly` | Append-only*
*Signature électronique requise pour ratification : Owner ✍ + Risk Office ✍*
````

---

## 4. Incident Report — Template

Émis en **temps réel** dès qu'un événement de sévérité ≥ haute est détecté. Push immédiat à Owner.

````markdown
# 🚨 INCIDENT REPORT — {{incident_id}}

**Détecté à :** {{detected_ts}}
**Émetteur :** {{detector}} (Hermes Auditor / Risk Gate / Agent CEO / Joris)
**Sévérité :** {{severity}} (high | critical)
**Venture concernée :** {{venture_id}} ({{agent_id}})

## Quoi s'est passé

{{what_happened}} (3 lignes max)

## Action immédiate prise

- {{action_taken_1}}
- {{action_taken_2}}

## Impact

- Client(s) impacté(s) : {{clients_impacted}}
- Coût direct estimé : {{cost_impact}} $
- Risque réputation : {{reputation_risk}}
- Risque légal/conformité : {{legal_risk}}

## Action attendue d'Owner

{{owner_action_required}} — délai : {{owner_deadline}}

## Lien Ledger

{{ledger_link}}

---
*Incident ID : {{incident_id}} | Ledger : `action_type=incident` | Append-only*
````

### 4.1 Règles strictes Incident Report

- **Aucun batching.** Un incident = un report.
- **Action automatique pré-rapport** : pour `severity=critical`, Joris **pause** automatiquement la venture concernée avant même d'envoyer le rapport. Owner doit la ré-activer manuellement.
- **Cooldown 14 jours minimum** avant ré-activation d'une venture passée en `paused` suite à incident.

---

## 5. Variables et schémas (référence pour wiring)

### 5.1 Variables Daily Brief

```ts
type DailyBriefData = {
  brief_id: string;                    // uuid
  date_iso: string;                    // YYYY-MM-DD
  day_of_holding: number;              // jour depuis ratification portfolio
  mrr_total: number;
  mrr_delta: number;
  paying_clients: number;
  paying_delta: number;
  api_cost_j1: number;
  api_cost_delta: number;
  missions_count: number;
  missions_failed: number;
  risk_alerts_open: number;
  risk_high: number;
  per_venture: {
    suivia: VentureDaily;
    noorki: VentureDaily;
    dadschool: VentureDaily;
  };
  decision: {
    title: string;
    context: string;
    recommendation: string;
    risk: string;
    action: string;
    time_minutes: number;
  } | null;
  next_owner_action: string;
};

type VentureDaily = {
  clients_active: number;
  target: number;
  mrr: number;
  api_cost_projection: number;
  missions: number;
  flag: string | null;
};
```

### 5.2 Variables Weekly Report

```ts
type WeeklyReportData = {
  report_id: string;
  week_number: number;
  week_start: string;
  week_end: string;
  tldr: { top_win: string; top_miss: string; top_risk: string; top_decision: string };
  kpis: WeeklyKpi[];
  per_venture: { suivia: VentureWeekly; noorki: VentureWeekly; dadschool: VentureWeekly };
  decisions: DecisionWeekly[];          // max 5
  motions: Motion[];
  risks: RiskWeekly[];
  refusals: string[];
  challenges: string[];
  calendar_next_week: { day: string; deadline: string }[];
};
```

### 5.3 Persistance Ledger

Chaque rapport généré est consigné au Ledger :

```sql
insert into ledger (
  ts, venture_id, agent_id, action_type, provider, model,
  input_tokens, output_tokens, cost_cents, schema_valid, payload, signature
)
values (
  now(),
  'holding',                          -- les rapports sont cross-venture
  'joris',
  'report.daily',                     -- ou report.weekly | audit.monthly | incident
  'anthropic',
  'claude-sonnet-4.5',
  {{in_tokens}},
  {{out_tokens}},
  {{cost_cents}},
  true,
  {{payload_jsonb}},
  {{hash_chained}}
);
```

---

## 6. Règles d'évolution du template

- Modification du template = nouvelle version (`v1.1`, `v1.2`...) + ratification Owner + Risk Office.
- Ancien format reste lisible (append-only).
- Toute nouvelle métrique ajoutée doit avoir une source Ledger ou Supabase claire — pas de métrique "calculée à la volée" sans trace.
- Si Owner trouve un brief inutile (lu en < 10 secondes plusieurs fois sans action), Joris doit proposer une révision du template (motion formelle, pas changement unilatéral).

---

## 7. Premier Daily Brief — exemple rempli (J1 du portfolio)

````markdown
# Daily Brief — 2026-05-26 (jour 1)

**Michael,** voici l'état de la holding ce matin.

## Snapshot 24 h

| Métrique | Valeur | Δ vs J-1 |
|----------|:------:|:--------:|
| MRR consolidé | 0 $ | — |
| Clients payants actifs | 0 | — |
| Coût API J-1 | 0,12 $ | — (tests Joris) |
| Missions exécutées J-1 | 3 | dont 0 échec |
| Alertes Risk Office | 0 | dont 0 risk=high |

## Par venture

### Suivia AP/AR
- 0 client actif / cible M1 = 1 pilote
- MRR 0 $ — coût API 0,04 $/jour projection
- Missions J-1 : 1 (test extraction facture factice)
- Drapeau notable : aucun

### NOORKI Pro Suite
- 0 courtier actif / cible M1 = 1 pilote (prospect chaud)
- MRR 0 $ — coût API 0,03 $/jour projection
- Listings traités J-1 : 1 (test factice)
- Drapeau notable : appel prospect courtier non encore booké — à faire S1

### Dad School
- 0 abonné payant / cible M1 = 10
- 0 abonné newsletter
- MRR 0 $ — coût API 0,05 $/jour projection
- Articles publiés J-1 : 0 (landing en cours)
- Drapeau notable : landing v0 cible J5

## Une décision attendue aujourd'hui

> **Booker l'appel découverte avec le prospect courtier NOORKI cette semaine**
>
> **Contexte** : Le prospect est chaud depuis 3 semaines. Sans call cette semaine, momentum perdu et plan B (5 autres courtiers du réseau) s'active à J45.
>
> **Recommandation Joris** : Envoyer SMS aujourd'hui pour caler 30 min cette semaine.
>
> **Risque si on n'agit pas** : signature pilote NOORKI repoussée → MRR M1 NOORKI = 0 $.
>
> **Action attendue** : SMS + 1 créneau bloqué dans Calendar (≤ 5 min)

## Prochaine action (Owner)

Envoyer le SMS au courtier prospect d'ici 17 h aujourd'hui.

---
*Daily Brief ID : 00000000-0000-0000-0000-000000000001 | Append-only*
````

---

## Appendix — Liens

- [`AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md`](AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md)
- [`HOLDING_PORTFOLIO_V1.md`](HOLDING_PORTFOLIO_V1.md)
- [`SHARED_EXECUTION_ENGINE.md`](SHARED_EXECUTION_ENGINE.md)
- [`JORIS_OPERATING_PROFILE.md`](JORIS_OPERATING_PROFILE.md)
- [`charters/`](charters/)
