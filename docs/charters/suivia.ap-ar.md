# Company Charter — Suivia AP/AR

> **Charter ID:** `suivia.ap-ar`
> **Status:** Draft → ratification requise (Owner + Risk Office)
> **Version:** 1.0
> **Parent doctrine:** [`AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md`](../AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md)
> **Portfolio:** [`HOLDING_PORTFOLIO_V1.md`](../HOLDING_PORTFOLIO_V1.md)

---

## 1. Identité

- **Name :** Suivia AP/AR
- **Thesis :** Automatiser le traitement Accounts Payable / Accounts Receivable (matching factures ↔ POs, codification GL, relances DSO) pour les PMEs québécoises 11-200 employés, avec un agent qui escalade les exceptions à un humain qualifié.
- **Status :** Draft

## 2. Marché

| Item | Valeur |
|------|--------|
| Geo | Québec (priorité), Ontario (M3+) |
| Industry | PMEs services, distribution, construction, commerce de gros |
| ICP | Owner-CFO ou contrôleur d'entreprise 11-200 employés, déjà sur QuickBooks Online / Acomba / Dynamics 365 BC, traite 50-500 factures/mois, opère en français principalement |
| Pain | Saisie manuelle de factures (4-8 h/sem d'un contrôleur), erreurs de matching coûteuses, DSO trop élevé (>45 jours), pas de visibilité temps réel sur le cash |
| TAM | ~45 000 PMEs québécoises éligibles (Stat Can 2025) |

## 3. Offre

| Item | Valeur |
|------|--------|
| Name | Suivia AP/AR |
| Description | Plateforme + agent IA qui ingère factures et POs, fait le matching 3-way, propose la codification GL, escalade les exceptions, et envoie les relances clients selon politique configurée |
| Deliverable | Portail web + intégration QuickBooks/Acomba + rapport mensuel CFO + escalade Slack/email des exceptions |
| Pricing | **Starter** 500 $/mois (jusqu'à 100 factures/mois) — **Growth** 1 200 $/mois (jusqu'à 500) — **Scale** 2 500 $/mois (jusqu'à 2 000) + dépassement à 0,50 $/facture |
| Revenue model | Abonnement mensuel + usage caps |

## 4. P&L Assumptions

| Métrique | Valeur cible |
|----------|:------------:|
| CAC | 350 $ (LinkedIn outbound + referral) |
| LTV (12 mois moyens × 1 200 $) | 14 400 $ |
| LTV/CAC | 41 |
| Gross margin | 88 % |
| Break-even clients | 6 (couverture opex venture + part allocation holding) |

## 5. Gouvernance

| Item | Valeur |
|------|--------|
| Agent CEO ID | `hermes-operator.suivia` (base profile : Hermes Operator) |
| Sub-agents allowed | `hermes-scout.suivia.researcher`, `hermes-builder.suivia.matcher`, `hermes-money.suivia.tracker`, `hermes-auditor.suivia.qa` |
| Skills allowed | `doc.extract`, `doc.match`, `signal.collect.public`, `signal.synthesize`, `brief.compose`, `report.compose.weekly`, `email.draft.external`, `ledger.write`, `audit.review` |
| Skills forbidden | `email.send.external`, `sms.send`, `payment.process`, `calendar.book.external`, `linkedin.dm`, `linkedin.post`, `ads.spend` |
| Budget cap | **500 $/mois** (API + outils + spend) — burst 100 $ |
| Autonomy level | **3 (Recommend)** au Jour 1 |
| Reporting cadence | Weekly + Daily KPI dans Joris Daily Brief |

## 6. Risk Gates

| ID | Règle | Sévérité |
|----|-------|:--------:|
| `S-G1` | Aucune action externe sans approbation Owner explicite (mission par mission) | blocking |
| `S-G2` | Interdit de modifier un GL d'une comptabilité client sans confirmation humaine | blocking |
| `S-G3` | Toute facture > 5 000 $ déclenche escalade humaine automatique | blocking |
| `S-G4` | Aucun PII stocké hors Supabase (chiffrement at-rest obligatoire, conformité Loi 25) | blocking |
| `S-G5` | Interdit de promettre un % de réduction du DSO chiffré au client | blocking |
| `S-G6` | Limite stricte : pas de connexion banque (Open Banking) en v1 — lecture comptable seulement | blocking |

## 7. KPI

| Nom | Cible | Cadence | Source |
|-----|:-----:|:-------:|--------|
| MRR | 6 000 $ à M6 | weekly | `supabase.subscriptions` |
| Active paying clients | 5 à M6 | weekly | `supabase.subscriptions` |
| Match accuracy (auto-matched factures) | ≥ 92 % | weekly | `ledger` + audit |
| Exception escalation latency (médiane) | < 4 h ouvrables | weekly | `missions` |
| Time-to-pilot-onboard | < 5 jours | per onboarding | `missions` |
| Churn 30 jours | 0 % | monthly | `subscriptions` |
| Coût API par client | < 20 $/mois | monthly | `ledger` |

## 8. Ledger Requirements

- Chaque facture traitée → 1 entrée Ledger (`action_type=doc.extract`)
- Chaque match → 1 entrée (`action_type=doc.match`)
- Chaque escalade humaine → 1 entrée (`action_type=escalation`)
- Toute promesse au client → 1 entrée (`action_type=client.promise`)
- Toute dépense > 5 $ → 1 entrée (`action_type=spend`)

## 9. Kill Switch

| Condition | Action |
|-----------|--------|
| Plainte client jugée fondée par Risk Office | `paused` immédiat |
| Match accuracy < 80 % sur 2 semaines | `paused` + audit prompts |
| Dépassement budget cap > 20 % sur 2 semaines | `paused` + revue économique |
| Incident `risk=high` non détecté par Agent CEO | `paused` + démotion autonomy |
| 0 client payant à J90 | revue Owner — pause ou pivot |

Cooldown : 14 jours minimum.
Owner : Owner-only pour re-activation.

## 10. Plan 30 jours spécifique

| Semaine | Livrable |
|:-------:|----------|
| S1 | Schéma DB Suivia + skills `doc.extract` + `doc.match` spécifiées |
| S2 | 10 outreaches LinkedIn vers CFO/contrôleurs PMEs QC (manuel Michael) |
| S3 | 3 calls de découverte + 1 pilote verbalement accroché |
| S4 | 1 pilote signé (gratuit M1, payant M2 à 1 200 $) + tenant Supabase setup |

## 11. Conditions de promotion d'autonomy

| Niveau cible | Critères |
|:------------:|----------|
| 4 (Internal execution) | 20 missions clean + 30 jours sans Red Team flag + sign-off Risk Office |
| 5 (Supervised external — pour relances email automatiques aux débiteurs) | 30 missions clean + 1 client payant + Risk Office sign-off + revue avocat sur les modèles de relance |
| 6 (Budgeted semi-autonomy) | 5 K$ MRR stable 3 mois + 0 incident bloquant + audit trimestriel pass |

## 12. Signatures

| Acteur | Signature | Date |
|--------|-----------|------|
| Owner (Michael) | _en attente_ | — |
| Risk Office | _en attente_ | — |
