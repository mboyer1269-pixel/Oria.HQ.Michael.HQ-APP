# Buckingham GM × Oria — Plan opérateur ventes

**Status:** Green Zone implanté (in-memory) — lead bank + Marketplace prepare + capture inbound + sold/lost  
**Owner:** Michael Boyer  
**Contexte:** Représentant aux ventes — Buckingham Chevrolet Buick GMC (`buckinghamgm.com`, Gatineau)  
**Produit:** Oria HQ  
**Date:** 2026-07-11  

**Objectif :** renforcer la lead bank, générer des leads via Marketplace, accélérer des ventes — toujours prepare → action humaine.

---

## 0. Décisions

| # | Décision | Choix |
|---|----------|--------|
| D1 | Sprint inventaire dès le démarrage | **Oui** (ingest manuel livré ; fetch HTML = plus tard) |
| D2 | Canal relance semaine 1 | **SMS** (recommandé) — drafts prepare-only |
| D3 | Facebook Marketplace | **Prepare-only manuel** |
| D4 | Leads depuis posts Marketplace | **Oui** (`sourceRef = packetId`) |
| D5 | Priorité | **Lead bank + ventes**, pas plus d’agents |

---

## 1. Intention

```
Inventaire (manuel JSON)
  → Fiches Marketplace (Oria prépare, toi publies)
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
| `POST`/`GET` | `/api/inventory/snapshot` | Ingest manuel JSON / lire snapshot |
| `POST`/`GET` | `/api/sales/leads` | Upsert / lister lead bank |
| `GET` | `/api/sales/morning-queue` | File du matin (due → score) |
| `POST` | `/api/sales/follow-up/prepare` | Draft SMS/email (jamais d’envoi) |
| `POST` | `/api/sales/outcome` | `sold` (exige stock) / `lost` (exige raison) |
| `POST`/`GET` | `/api/marketplace/listings` | Préparer fiche depuis stock / marquer publié |
| `POST` | `/api/marketplace/leads/capture` | Inbound Marketplace → lead bank |

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

Capacités HQ : `sales_lead_bank`, `marketplace_listing_prepare`, `dealership_inventory_snapshot` → **shadow**.

---

## 7. Hors scope (volontaire)

- Fetch HTML auto `buckinghamgm.com` (Yellow + accord concession)  
- Auto-post Facebook / cookies / bot  
- Envoi SMS/email live (Send Desk ultérieur)  
- Persistance Supabase lead bank  
- Phase 1 / auth / secrets  

---

## 8. Semaine 1 sans réseau externe

1. Saisir **tous** les leads déjà chauds via `/api/sales/leads`.  
2. Forcer `source` + `consentBasis` + `nextFollowUpAt`.  
3. Lier chaque lead à un stock/modèle.  
4. Publier 1–2 annonces Marketplace manuellement + capturer chaque inbound.  
5. Traiter la morning queue chaque matin.  
6. Closer `sold` / `lost` le jour même.
