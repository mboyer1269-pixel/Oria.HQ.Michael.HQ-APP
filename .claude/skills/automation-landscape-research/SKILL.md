---
name: Automation Landscape Research
description: >
  Recherche en ligne des repos, outils, workflows et orchestrations existants
  (automations Marketplace, inventaire concession, agent pipelines). Produit un
  brief GO / WATCH / NO-GO pour Oria — sans coder, sans secrets, sans auto-post.
---

# Automation Landscape Research

## Objectif

Déterminer **ce qui existe déjà** sur Internet (repos, SaaS, Chrome extensions,
workflows n8n/Zapier, APIs inventaire) avant de builder. Évite de réinventer un
outil risqué (bot Facebook) ou de rater un feed/API propre.

## Quand l'utiliser

- Avant d’ajouter une automation (Marketplace, inventaire, outbound, agents).
- Quand Michael demande : « est-ce que ça existe déjà ? » / « cherche des repos ».
- Pour comparer **prepare-only** (Oria) vs **auto-post** (souvent ToS / ban risk).

## Quand NE PAS l'utiliser

- Pour implémenter du code (Builder Green/Yellow).
- Pour scrapes massifs hors allowlist ou accès CRM/DMS sans accord écrit.
- Pour activer un bot Facebook / cookies / session hijack.

## Pipeline (researcher → designer → writer → reviewer)

1. **Researcher** — SERP + docs + GitHub ; noter licence, ToS, maturité, risque.
2. **Designer** — classer : inventaire → prepare fiche → publish → leads → close.
3. **Writer** — brief structuré (template ci-dessous).
4. **Reviewer** — vérifier sources, pas d’overclaim, décision GO/WATCH/NO-GO.

## Quick Start

```
/automation-landscape-research
Sujet: inventaire concession → fiche Facebook Marketplace
Contraintes Oria: prepare-only, pas d'auto-post, allowlist publique only
Livrable: brief + top 5 repos/outils + reco pour Oria
```

## Sources à couvrir

| Source | Exemples de requêtes |
|--------|----------------------|
| GitHub | `Facebook Marketplace vehicle poster`, `dealer inventory scraper`, `CarGurus Marketplace` |
| Chrome Web Store | `vehicle poster Marketplace`, `dealer inventory` |
| Dealer SaaS | DealerCenter FB utility, SellitZ, Owini AI |
| Data APIs | MarketCheck, Auto.dev, MotorsDynamic inventory feeds |
| Forums | DealerRefresh Marketplace workflows |
| Orchestration | n8n / Zapier “inventory to Marketplace” (souvent UI bot) |

## Taxonomie des findings

| Classe | Sens | Posture Oria |
|--------|------|--------------|
| `inventory_api` | Feed/API normalisé (VIN, stock, photos) | WATCH / GO data layer |
| `site_scraper` | Parse HTML inventaire public | GO si allowlist + parse tests |
| `listing_prepare` | Génère titre/desc/photos sans poster | **GO** (aligné Oria) |
| `marketplace_autopost` | Remplit/poste FB via browser/extension | **NO-GO** produit (ToS/ban) |
| `lead_capture` | Messenger/inbound → CRM | WATCH (officiel Meta only) |
| `orchestration` | n8n/Zapier/agent graph | WATCH si prepare-only |

## Template de brief (exemple de résultat)

```md
# Landscape — <sujet>
Date: YYYY-MM-DD
Question: <ce qu'on cherche>
Contraintes: prepare-only | public allowlist | no secrets

## Verdict
- Décision: GO | WATCH | NO-GO
- Pourquoi (1–3 lignes)
- Implication Oria: <build / adopter / ignorer>

## Top findings
| # | Nom | Type | Licence/ToS | Maturité | Risque | Lien |
|---|-----|------|-------------|----------|--------|------|
| 1 | … | marketplace_autopost | ToS FB | commercial | HIGH ban | url |

## Ce qui est réutilisable chez Oria
- …
## Ce qu'on ne copie JAMAIS
- Auto-post FB, cookies, credentials Facebook, bot Messenger non officiel
## Prochaine action
- [ ] …
```

## Snapshot initial (2026-07-11) — inventaire → Marketplace

Recherche faite pour calibrer le skill (véhicules / Marketplace) :

| Finding | Classe | Verdict Oria |
|---------|--------|--------------|
| [CarGurus→FB Auto-Poster](https://github.com/HARON416/CarGurus-to-Facebook-Marketplace-Auto-Poster) | marketplace_autopost | **NO-GO** (browser auto-post) |
| [SellitZ AutoMarket Pro](https://sellitz.com/) | marketplace_autopost + scraper | **NO-GO** publish ; WATCH UX scrape |
| [Owini AI Vehicle Poster](https://chromewebstore.google.com/detail/owini-ai-vehicle-poster/loejdlalcohcjdljppkgbfbcemhinikf) | marketplace_autopost | **NO-GO** |
| [DealerCenter FB Posting Utility](https://support.dealercenter.net/hc/en-us/articles/12435635095956-How-to-Use-the-Facebook-Marketplace-Auto-Uploader) | marketplace_autopost | **NO-GO** (workaround post Meta cut feed) |
| [MarketCheck inventory API](https://www.marketcheck.com/data_feed/dealership-inventory/) | inventory_api | **WATCH** (stock/VIN/photos) |
| [Auto.dev Vehicle Listings](https://docs.auto.dev/v2/products/vehicle-listings) | inventory_api | **WATCH** |
| DealerRefresh Octoparse + Lazy Poster threads | scraper + autopost | scrape WATCH ; poster **NO-GO** |

**Implication Oria :** le marché pousse l’**auto-post** (risqué). Notre différenciation = **inventaire public → fiche parfaite prepare-only → humain publie → lead bank**.

## Checklist reviewer

- [ ] Frontmatter `name` + `description`
- [ ] Au moins 3 sources URL citées
- [ ] Chaque finding a une classe + verdict
- [ ] Risque ToS / ban explicitement noté pour autopost
- [ ] Reco Oria actionnable (build vs ignore)
- [ ] Aucun secret, aucun cookie FB, aucun credential

## Intégration Oria

- Complète `orya-innovation-scout` (stratégie) avec un focus **automations existantes / repos**.
- Alimente `docs/BUCKINGHAM_GM_ORIA_OPERATOR_PLAN.md` avant Yellow fetch/publish.
- Ne modifie pas `package.json`, `.env`, auth, ni Phase 1.
