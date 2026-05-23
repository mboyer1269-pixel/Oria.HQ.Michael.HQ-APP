# Company Charter — Dad School

> **Charter ID:** `dadschool.digital`
> **Status:** Draft → ratification requise (Owner + Risk Office)
> **Version:** 1.0
> **Parent doctrine:** [`AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md`](../AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md)
> **Portfolio:** [`HOLDING_PORTFOLIO_V1.md`](../HOLDING_PORTFOLIO_V1.md)

---

## 1. Identité

- **Name :** Dad School
- **Thesis :** Construire la marque média francophone de référence pour les nouveaux papas (25-40 ans, primo-parents), avec un mix newsletter + bibliothèque de mini-cours pratiques au ton décontracté (sommeil bébé, finances famille, road trips, gear, relation couple). Content engine 100 % agentique, marge brute > 90 %, scale par organique (TikTok, SEO, email).
- **Status :** Draft

## 2. Marché

| Item | Valeur |
|------|--------|
| Geo | Québec, Canada francophone, France (M6+) |
| Industry | B2C content / education / community |
| ICP | Homme 25-40 ans, primo-papa ou en couple avec enfant 0-3 ans, francophone, urbain/banlieue, revenu 50-100 K$, actif Instagram et TikTok, achète déjà sur Amazon/Etsy |
| Pain | Information papa parsemée et anglophone, ton paternaliste ou clinique, manque de contenu pratique au quotidien, isolement parental, surcharge mentale en début de parentalité |
| TAM | ~85 000 nouvelles naissances/an au Québec (Stat Can) + reach Canada FR + France ≈ 400 000 papas-cibles annuels |

## 3. Offre

| Item | Valeur |
|------|--------|
| Name | Dad School |
| Description | (a) Newsletter gratuite hebdo (acquisition + brand) ; (b) Abonnement Premium 9 $/mois ou 19 $/mois "Dad School Pro" donnant accès à une bibliothèque de mini-cours (sommeil bébé, finances famille, road trip avec enfants, relation couple), templates téléchargeables, et communauté Discord/Circle ; (c) Produits one-shot 27-97 $ : guides PDF approfondis (ex: "Le road trip parfait avec un bébé", "Le budget famille en 30 jours"), packs templates |
| Deliverable | Site web (landing + dashboard membre) + newsletter (ConvertKit ou Substack) + bibliothèque protégée + Discord communauté |
| Pricing | **Newsletter** gratuite — **Pro** 9 $/mois ou 90 $/an — **Pro+** 19 $/mois ou 190 $/an (communauté + cours premium) — **One-shots** 27-97 $ |
| Revenue model | Abonnement mensuel/annuel + produits one-shot + sponsoring newsletter (M6+) |

## 4. P&L Assumptions

| Métrique | Valeur cible |
|----------|:------------:|
| CAC (organique principalement) | ~3 $ par abonné gratuit, ~25-40 $ par abonné payant |
| LTV (8 mois moyens × 12 $) | 96 $ |
| LTV/CAC | 2,4 à 3,8 (acceptable pour B2C content) |
| Gross margin | 92 % |
| Break-even abonnés payants | 50 (couverture opex venture) |

## 5. Gouvernance

| Item | Valeur |
|------|--------|
| Agent CEO ID | `hermes-builder.dadschool` (base profile : Hermes Builder) |
| Sub-agents allowed | `hermes-builder.dadschool.writer`, `hermes-scout.dadschool.research`, `hermes-operator.dadschool.publisher`, `hermes-money.dadschool.tracker`, `hermes-auditor.dadschool.qa` |
| Skills allowed | `content.generate`, `content.optimize`, `signal.collect.public`, `signal.synthesize`, `brief.compose`, `report.compose.weekly`, `ledger.write`, `audit.review` |
| Skills forbidden | `email.send.external` (en v1 — newsletter envoyée via ConvertKit avec approbation Owner par broadcast), `sms.send`, `payment.process` (Stripe géré par l'Owner direct), `lead.qualify`, `linkedin.dm`, `linkedin.post` |
| Budget cap | **250 $/mois** — burst 50 $ |
| Autonomy level | **3 (Recommend)** au Jour 1, candidat à promotion **4 (Internal execution)** dès J45 si content acceptance rate > 80 % |
| Reporting cadence | Weekly + Daily KPI dans Joris Daily Brief |

## 6. Risk Gates

| ID | Règle | Sévérité |
|----|-------|:--------:|
| `D-G1` | Interdit de donner un conseil médical, légal ou financier spécifique sans disclaimer + recommandation de pro qualifié | blocking |
| `D-G2` | Interdit de mentionner ou recommander un produit dangereux pour les enfants (jouets non certifiés, médicaments) | blocking |
| `D-G3` | Tout claim chiffré ("90 % des papas...") doit citer une source vérifiable | blocking |
| `D-G4` | Newsletter broadcast = approbation Owner obligatoire (par diffusion, pas par article) | blocking |
| `D-G5` | Aucune publication directe sur réseaux sociaux en v1 — drafts pour Michael | blocking |
| `D-G6` | Aucune collecte de données enfants — RGPD/Loi 25 strict | blocking |
| `D-G7` | Ton décontracté autorisé MAIS aucun contenu sexiste, exclusif ou stéréotypé | blocking |

## 7. KPI

| Nom | Cible | Cadence | Source |
|-----|:-----:|:-------:|--------|
| Abonnés newsletter gratuits | 500 à M3, 2 000 à M6 | weekly | ConvertKit/Substack API |
| Abonnés Pro payants | 30 à M1, 180 à M4, 500 à M6 | weekly | Stripe API |
| MRR | 270 $ à M2, 1 620 $ à M4, 4 500 $ à M6 | weekly | Stripe |
| Open rate newsletter | ≥ 45 % | weekly | ConvertKit |
| Content acceptance rate (Owner approve sans réécriture) | ≥ 80 % | weekly | dashboard interne |
| One-shot ventes mensuelles | 5 à M3, 30 à M6 | monthly | Stripe |
| Churn 30 jours abonnés payants | < 8 % | monthly | Stripe |
| Coût API total | < 50 $/mois à M6 | monthly | `ledger` |

## 8. Ledger Requirements

- Chaque article généré → 1 entrée Ledger (`action_type=content.generate`)
- Chaque newsletter broadcast → 1 entrée (`action_type=broadcast`)
- Chaque promotion produit → 1 entrée (`action_type=promotion`)
- Toute affirmation chiffrée non sourcée détectée par Auditor → 1 entrée (`action_type=risk.flag`)
- Toute dépense > 5 $ → 1 entrée (`action_type=spend`)

## 9. Kill Switch

| Condition | Action |
|-----------|--------|
| Plainte abonné fondée sur conseil médical/dangereux | `paused` immédiat + revue legal |
| Content acceptance rate < 50 % sur 3 semaines | `paused` + refonte ligne éditoriale |
| < 20 abonnés payants à M3 | revue Owner — pivot pricing ou format |
| < 500 inscrits newsletter à M3 | revue Owner — pause ou refonte acquisition |
| 0 revenu à M3 | revue Owner — kill ou pivot |

## 10. Plan 30 jours spécifique

| Semaine | Livrable |
|:-------:|----------|
| S1 | Schéma DB Dad School + skill `content.generate` testée + Landing v0 (shadcn/ui) |
| S2 | Identité visuelle finalisée + 10 articles drafts produits (5 publiés, 5 en banque) + setup ConvertKit + capture email landing publié |
| S3 | 5 articles publiés + 1ère newsletter broadcast (à Michael + 10 amis + capture) + 1ères 50 inscriptions newsletter visées |
| S4 | 10 articles publiés cumulés + activation TikTok (5 vidéos courtes en mode "Dad School tips") + 10 premiers abonnés payants visés |

## 11. Stratégie d'acquisition

| Canal | Type | Effort | Délai impact |
|-------|------|:------:|:------------:|
| TikTok organique (compte @dadschool.fr) | Content vertical, 3-5 vidéos/sem | Moyen | 30-60j |
| Newsletter cross-promo (autres newsletters parentalité) | Partenariats | Faible | 60-90j |
| SEO Google FR (longue traîne "papa nouveau-né québec", "road trip bébé", "budget bébé québec") | Articles 1500-2500 mots optimisés | Moyen | 90-180j |
| Instagram (compte @dadschool.fr) | Reels + carrousels | Faible | 60-120j |
| Référencement contenu Michael (clins d'œil Suivia/NOORKI) | Réseau Michael | Faible | Immédiat |

## 12. Conditions de promotion d'autonomy

| Niveau cible | Critères |
|:------------:|----------|
| 4 (Internal execution — publication directe d'articles sans approbation par article, broadcast par lot) | 20 articles clean acceptés + 30 jours sans Red Team flag + sign-off Risk Office (incluant audit éditorial) |
| 5 (Supervised external — publication TikTok/IG par lot approuvé hebdo) | 30 publications clean + 100 abonnés payants + Risk Office sign-off |
| 6 (Budgeted semi-autonomy — autonomie complète sur calendrier éditorial et A/B) | 4 K$ MRR stable 3 mois + 0 plainte fondée + audit trimestriel pass |

## 13. Signatures

| Acteur | Signature | Date |
|--------|-----------|------|
| Owner (Michael) | _en attente_ | — |
| Risk Office | _en attente_ | — |
