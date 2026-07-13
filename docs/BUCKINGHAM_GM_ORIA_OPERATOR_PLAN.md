# Buckingham GM × Oria — Plan opérateur ventes

**Status:** Green Zone — inventaire + Agent Publication + Directeur Marketing + lead bank + intent Joris  
**Owner:** Michael Boyer  
**Contexte:** Représentant aux ventes — Buckingham Chevrolet Buick GMC (`buckinghamgm.com`, Gatineau)  
**Produit:** Oria HQ  
**Date:** 2026-07-11  

**Objectif :** depuis le site public (stock # + photos) → Agent Publication (fiche Marketplace convertissante) + Directeur Marketing (posts / Reels / Shorts / pubs) → leads → ventes. Prepare → humain publie (Meta auto-post API = Yellow Zone).

---

## 0. Décisions

| # | Décision | Choix |
|---|----------|--------|
| D1 | Sprint inventaire dès le démarrage | **Oui** (ingest manuel livré ; fetch HTML = plus tard) |
| D2 | Canal relance semaine 1 | **SMS** (recommandé) — drafts prepare-only |
| D3 | Facebook Marketplace | **Prepare-only manuel** (+ Agent Publication UI) |
| D4 | Leads depuis posts Marketplace | **Oui** (`sourceRef = packetId`) |
| D5 | Priorité | **Lead bank + ventes** + contenu multi-canal prepare-only |
| D6 | Auto-publish Meta Graph API | **NO-GO sans mandat Yellow Zone** (secrets + app Meta) |

---

## 1. Intention

```text
Inventaire (sync buckinghamgm.com)
  → Agent Publication (file du jour + fiche Marketplace)
  → Directeur Marketing (FB / Reel / Short / pub Meta)
    → Humain publie (copie 1 clic)
      → Inbound Messenger / appel / RDV
        → Lead bank
          → Relances préparées (toi envoies)
            → Essai / offre
              → Vente ou perte propre
```

Oria prépare. **Toi** tu closes.

---

## 2. Principes non négociables

1. Prepare → action humaine (pas d’auto-send, pas d’auto-publish).  
2. Pas de Phase 1 sans mandat.  
3. Pas de 4ᵉ agent : Joris orchestre, Relay relances, Studio/Relay fiches Marketplace.  
4. Inventaire public only (`buckinghamgm.com`) — pas de DMS/CRM sans accord écrit.  
5. Cookies / session Facebook / bot UI = NO-GO.  
6. Warm-first : `reply_assist` + `follow_up` ; cold bloqué en v1.  
7. Chaque lead a `source` + `consentBasis` + prochain pas daté.  
8. Chaque `sold` / `lost` laisse une preuve.

---

## 3. APIs livrées (owner session, in-memory)

| Méthode | Route | Rôle |
|---------|-------|------|
| `POST` | `/api/inventory/sync` | Fetch HTML public allowlist → snapshot |
| `POST`/`GET` | `/api/inventory/snapshot` | Ingest manuel JSON / lire snapshot |
| `POST`/`GET` | `/api/sales/leads` | Upsert / lister lead bank |
| `GET` | `/api/sales/morning-queue` | File du matin (due → score) |
| `POST` | `/api/sales/follow-up/prepare` | Draft SMS/email (jamais d’envoi) |
| `POST` | `/api/sales/outcome` | `sold` (exige stock) / `lost` (exige raison) |
| `POST`/`GET` | `/api/marketplace/listings` | Préparer fiche depuis stock / marquer publié |
| `POST`/`GET` | `/api/sales/marketing/prepare` | Directeur Marketing — pack 5 canaux / marquer publié |
| `GET` | `/api/inventory/vehicle-catalog` | Catalogue relationnel marques→modèles (Selects liés) |
| `POST` | `/api/sales/market-brief` | Comps AutoTrader Gatineau + angles vs lot |
| `POST` | `/api/marketplace/leads/capture` | Inbound Marketplace → lead bank |

**Agent Publication (Sales Desk)** : file du jour (top véhicules), fiche Marketplace convertissante (CTA ESSAI), marquer publié, capture lead inline.

**Directeur Marketing (Sales Desk)** : pack multi-canal — Marketplace, Facebook Page, Reel, YouTube Short, pub Meta (hooks + plans de tournage + CTA). Prepare-only.

**Formation modèles (Sales Desk)** : fiches microlearning Chevy/Buick/GMC (must-know, walkaround 3-line story, objections Outaouais). Bouton **Apprendre** sur les neufs.

**Joris (chat)** :
- « sync inventaire » / « prépare fiche Marketplace 26344-NEUF » → `marketplace.listing.prepare`
- « débrief inventaire » / « compare Hyundai Tucson 2023 au marché » → `inventory.market.brief`
- « explique-moi le Trax 2026 » / « formation Terrain » → fiche formation modèle

Persistance : **process-locale** (`persistence: "in_memory"`). Perdu au redémarrage jusqu’à mandat store durable.

---

## 4. Boucle opérateur (jour 1)

1. **Ingest stock** — `POST /api/inventory/snapshot` avec 5–20 véhicules chauds (JSON).  
2. **Préparer Marketplace** — `POST /api/marketplace/listings` `{ "stockId": "…" }` → copier titre/desc/prix/photos sur FB.  
3. **Marquer publié** — `{ "action": "mark_published_manual", "packetId": "…" }`.  
4. **Chaque inbound** — `POST /api/marketplace/leads/capture` avec `packetId` + nom + téléphone.  
5. **File du matin** — `GET /api/sales/morning-queue`.  
6. **Relance** — `POST /api/sales/follow-up/prepare` `{ "leadId", "channel": "sms" }` → coller dans Messages.  
7. **Closer** — `POST /api/sales/outcome` `sold` + `soldStockId` ou `lost` + `lostReason`.

---

## 5. Banque de leads — modèle

`SalesLead` : source, consent, stock/modèles, stage, `nextFollowUpAt`, sold/lost.

Sources : `walk_in` | `phone_in` | `web_form` | `marketplace_post` | `marketplace_message` | `referral` | `repeat_customer` | `manual_other`.

Score : +3 marketplace/phone/walk-in ; +2 stock ; +2 consent express ; +1 due ; −2 unknown ; −5 lost.

---

## 6. Code (Green Zone)

| Zone | Fichiers |
|------|----------|
| Contrats | `src/features/inventory/`, `src/features/sales/`, `src/features/marketplace-listings/` |
| Stores | `src/server/inventory/`, `src/server/sales/`, `src/server/marketplace-listings/` |
| APIs | `src/app/api/inventory/`, `src/app/api/sales/`, `src/app/api/marketplace/` |
| Tests | `*.test.mjs` + `buckingham-sales-loop.test.mjs` (boucle complète) |

Capacités HQ : `sales_lead_bank`, `marketplace_listing_prepare`, `sales_marketing_director`, `dealership_inventory_snapshot` → **shadow**.

---

## 7. Hors scope (volontaire)

- Cron inventaire / multi-concession (au-delà du sync allowlist manuel via `/api/inventory/sync`)  
- Auto-post Facebook / cookies / bot  
- Envoi SMS/email live (Send Desk ultérieur)  
- Persistance Supabase lead bank  
- Phase 1 / auth / secrets  

> **Note sync :** `POST /api/inventory/sync` est **livré** (allowlist `buckinghamgm.com`, read-only public HTML). Ce qui reste hors scope, c’est le cron auto et tout accès DMS/CRM.

---

## 8. Semaine 1 sans réseau externe

1. Saisir **tous** les leads déjà chauds via `/api/sales/leads`.  
2. Forcer `source` + `consentBasis` + `nextFollowUpAt`.  
3. Lier chaque lead à un stock/modèle.  
4. Publier 1–2 annonces Marketplace manuellement + capturer chaque inbound.  
5. Traiter la morning queue chaque matin.  
6. Closer `sold` / `lost` le jour même.
