# Company Charter — NOORKI Pro Suite

> **Charter ID:** `noorki.pro-suite`
> **Status:** Draft → ratification requise (Owner + Risk Office)
> **Version:** 1.0
> **Parent doctrine:** [`AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md`](../AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md)
> **Portfolio:** [`HOLDING_PORTFOLIO_V1.md`](../HOLDING_PORTFOLIO_V1.md)

---

## 1. Identité

- **Name :** NOORKI Pro Suite
- **Thesis :** Donner à un courtier immobilier individuel (ou petite équipe) en un seul abonnement les trois outils qu'il sous-traite ou bâcle aujourd'hui : production de contenu listing (descriptifs + social + vidéo), qualification de leads entrants, et briefing intelligence de marché hebdomadaire. Productisé, livré en moins de 5 minutes par listing.
- **Status :** Draft

## 2. Marché

| Item | Valeur |
|------|--------|
| Geo | Québec (priorité), Ontario (M3+) |
| Industry | Immobilier résidentiel — courtiers OACIQ ou RECO |
| ICP | Courtier individuel ou solo praticien, 6-50 transactions/an, 30-55 ans, opère sur Centris ou MLS, déjà actif sur Instagram/Facebook, dépense déjà en marketing 200-1000 $/mois |
| Pain | Production de contenu marketing chronophage (4-6 h par listing), leads entrants non triés/perdus, aucune intelligence de marché structurée hebdomadaire, sous-traitance coûteuse (agences à 1500-3000 $/mois) |
| TAM | ~18 000 courtiers actifs OACIQ + ~10 000 actifs au Québec récurrent |

## 3. Offre

| Item | Valeur |
|------|--------|
| Name | NOORKI Pro Suite |
| Description | Suite tout-inclus : (a) Listing Engine — uploader une fiche MLS génère en 2 min descriptif optimisé + 3 posts réseaux + script vidéo 30/60s + email acheteurs ; (b) Lead Qualifier — agent qui ingère les leads (formulaire site, FB ads, courriels) et les score + classe + déclenche follow-up ; (c) Market Brief hebdo — briefing personnalisé sur le secteur du courtier |
| Deliverable | Portail web + intégration Centris (manuelle au début) + intégration formulaires site web + briefing hebdo PDF + dashboard activité |
| Pricing | **Solo** 597 $/mois — **Pro** 797 $/mois (avec relances email automatiques) — **Team** 997 $/mois (jusqu'à 5 courtiers) |
| Revenue model | Abonnement mensuel |

## 4. P&L Assumptions

| Métrique | Valeur cible |
|----------|:------------:|
| CAC | 200 $ (référencement réseau + LinkedIn ciblé courtiers) |
| LTV (10 mois moyens × 697 $) | 6 970 $ |
| LTV/CAC | 35 |
| Gross margin | 94 % |
| Break-even clients | 4-5 |

## 5. Gouvernance

| Item | Valeur |
|------|--------|
| Agent CEO ID | `hermes-closer.noorki` (base profile : Hermes Closer) |
| Sub-agents allowed | `hermes-builder.noorki.copywriter`, `hermes-scout.noorki.market`, `hermes-operator.noorki.qa`, `hermes-money.noorki.tracker` |
| Skills allowed | `doc.extract`, `content.generate`, `content.optimize`, `lead.qualify`, `lead.triage`, `followup.sequence`, `brief.compose`, `signal.collect.public`, `signal.synthesize`, `report.compose.weekly`, `email.draft.external`, `ledger.write`, `audit.review` |
| Skills forbidden | `email.send.external` (en v1 — drafts only), `sms.send`, `payment.process`, `calendar.book.external` (drafts only), `ads.spend`, `linkedin.dm`, `linkedin.post` |
| Budget cap | **400 $/mois** — burst 80 $ |
| Autonomy level | **3 (Recommend)** au Jour 1 |
| Reporting cadence | Weekly + Daily KPI dans Joris Daily Brief |

## 6. Risk Gates

| ID | Règle | Sévérité |
|----|-------|:--------:|
| `N-G1` | Aucun envoi externe (email, SMS, post réseau) sans approbation Owner explicite | blocking |
| `N-G2` | Interdit de publier directement sur les réseaux sociaux du courtier en v1 — drafts uniquement | blocking |
| `N-G3` | Aucun claim trompeur dans les descriptifs (ex: "le meilleur quartier", "valeur garantie") — audit Hermes Auditor obligatoire | blocking |
| `N-G4` | Conformité OACIQ : tout contenu marketing doit identifier clairement le courtier et son agence | blocking |
| `N-G5` | Aucun scraping de Centris hors usage personnel du courtier client (respect des CGU) | blocking |
| `N-G6` | Aucun stockage de données acheteurs/vendeurs hors Supabase (Loi 25) | blocking |

## 7. KPI

| Nom | Cible | Cadence | Source |
|-----|:-----:|:-------:|--------|
| MRR | 4 776 $ à M6 (≈ 8 clients) | weekly | `subscriptions` |
| Active paying courtiers | 8 à M6 | weekly | `subscriptions` |
| Time-per-listing (génération complète) | < 3 min | weekly | `missions` |
| Listing acceptance rate (courtier accepte sans modif majeure) | ≥ 75 % | weekly | feedback portail |
| Lead qualification accuracy | ≥ 85 % | monthly | review courtier |
| Briefing read rate hebdo | ≥ 80 % | weekly | analytics portail |
| Churn 30 jours | 0 % | monthly | `subscriptions` |
| Coût API par courtier | < 10 $/mois | monthly | `ledger` |

## 8. Ledger Requirements

- Chaque listing généré → 1 entrée Ledger (`action_type=listing.generate`)
- Chaque lead qualifié → 1 entrée (`action_type=lead.qualify`)
- Chaque briefing envoyé → 1 entrée (`action_type=brief.deliver`)
- Toute promesse au client → 1 entrée (`action_type=client.promise`)
- Toute dépense > 5 $ → 1 entrée (`action_type=spend`)

## 9. Kill Switch

| Condition | Action |
|-----------|--------|
| Plainte OACIQ ou client fondée | `paused` immédiat |
| Listing acceptance rate < 50 % sur 3 semaines | `paused` + refonte prompts |
| Dépassement budget cap > 20 % | `paused` + revue économique |
| Prospect ancré non signé à J45 | revue Owner — pivot ou pause |
| 0 client payant à J90 | revue Owner — pause ou pivot |

## 10. Plan 30 jours spécifique

| Semaine | Livrable |
|:-------:|----------|
| S1 | Schéma DB NOORKI + skills `content.generate` + `lead.qualify` spécifiées + Landing v0 |
| S2 | Appel de découverte avec le courtier prospect chaud + scope pilote 30 jours + premier listing-test factice traité |
| S3 | **Pilote signé** (tarif réduit M1 ≈ 200-400 $) + 5 listings traités + feedback intégré |
| S4 | 10 listings traités cumulés + premier lead qualifié + 1 brief hebdo envoyé + démarchage 5 autres courtiers du réseau |

## 11. Plan B — si le prospect chaud ne signe pas à J45

5 courtiers cibles du réseau immédiat de Michael à approcher en parallèle. Si aucun ne convertit à J90, kill switch ou pivot vers un autre format (Listing Copy one-shot à 47-97 $).

## 12. Conditions de promotion d'autonomy

| Niveau cible | Critères |
|:------------:|----------|
| 4 (Internal execution — publication dans le portail courtier sans approbation par item) | 20 listings clean + 30 jours sans Red Team flag + sign-off Risk Office + 1 courtier payant |
| 5 (Supervised external — relances email leads avec approbation par lot) | 30 livraisons clean + 2 courtiers payants + Risk Office sign-off + revue conformité OACIQ |
| 6 (Budgeted semi-autonomy — publication réseaux sociaux dans budget cap) | 5 K$ MRR stable 3 mois + 0 plainte courtier ou OACIQ + audit trimestriel pass |

## 13. Signatures

| Acteur | Signature | Date |
|--------|-----------|------|
| Owner (Michael) | _en attente_ | — |
| Risk Office | _en attente_ | — |
