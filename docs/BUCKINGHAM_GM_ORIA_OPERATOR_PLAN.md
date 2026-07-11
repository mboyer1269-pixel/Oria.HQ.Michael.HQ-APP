# Buckingham GM × Oria — Plan opérateur ventes

**Status:** Plan d’implantation (docs-only) — pas encore de code métier  
**Owner:** Michael Boyer  
**Contexte:** Représentant aux ventes — Buckingham Chevrolet Buick GMC (`buckinghamgm.com`, Gatineau)  
**Produit:** Oria HQ  
**Date:** 2026-07-11  

**Objectif :** renforcer la lead bank, générer des leads via Marketplace, accélérer des ventes — toujours prepare → action humaine.

---

## 0. Décisions

| # | Décision | Choix |
|---|----------|--------|
| D1 | Sprint inventaire dès le démarrage | **Oui** |
| D2 | Canal relance semaine 1 | **SMS** (recommandé) — à verrouiller vs email |
| D3 | Facebook Marketplace | **Prepare-only manuel** |
| D4 | Leads depuis posts Marketplace | **Oui** |
| D5 | Priorité | **Lead bank + ventes**, pas plus d’agents |

---

## 1. Intention

```
Inventaire public
  → Fiches Marketplace (toi publies)
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

## 3. Réalité terrain

- Neufs : `https://www.buckinghamgm.com/neufs/inventaire/recherche.html`
- Occasion : `https://www.buckinghamgm.com/occasion/recherche.html`
- Hub : `https://www.buckinghamgm.com/inventaire.html`
- Signaux : Stock, NIV, marque, modèle, année, finition, prix, URL, photos

Avant sync auto : confirmer OK direction / marketing concession.

---

## 4. Architecture

```
buckinghamgm.com (public HTML)
        │
        ▼
 W1 inventory.sync ──► InventorySnapshot (local)
        │
        ├─► Joris (questions stock)
        │
        ├─► W3 marketplace.listing.prepare
        │         │
        │         ▼
        │   [TOI → Facebook Marketplace]
        │         │
        │         ▼
        │   W4 marketplace.lead.capture
        │
        └─► LeadBank ◄── walk-in / phone / web / import
                │
                ▼
         W2 sales.follow_up.prepare
                │
                ▼
         Send Desk / copy
                │
                ▼
         [TOI envoies]
                │
                ▼
         RDV / essai / offre
                │
                ▼
         W5 sale.outcome.capture → sold | lost
```

---

## 5. Banque de leads

### 5.1 Modèle `SalesLead`

```ts
type LeadSource =
  | "walk_in"
  | "phone_in"
  | "web_form"
  | "marketplace_post"
  | "marketplace_message"
  | "referral"
  | "repeat_customer"
  | "manual_other";

type LeadStage =
  | "new"
  | "contacted"
  | "qualified"
  | "appointment_set"
  | "appointment_done"
  | "negotiation"
  | "sold"
  | "lost"
  | "nurture";

type ConsentBasis =
  | "express"
  | "implied_verified"
  | "manual_review_required"
  | "unknown";

type SalesLead = {
  leadId: string;
  fullName: string;
  phone?: string;
  email?: string;
  source: LeadSource;
  sourceRef?: string;
  interestedStockIds: string[];
  interestedModels: string[];
  stage: LeadStage;
  consentBasis: ConsentBasis;
  consentNote?: string;
  nextFollowUpAt?: string;
  lastContactAt?: string;
  lostReason?: string;
  soldStockId?: string;
  soldAt?: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
};
```

### 5.2 Renforcer la lead bank dès le jour 1

1. Saisir tous les leads déjà chauds.  
2. Forcer `source` + `consentBasis` + `nextFollowUpAt`.  
3. Lier chaque lead à un stock ou modèle.  
4. Traiter chaque jour les follow-ups dus.  
5. Chaque listing Marketplace a un `packetId` ; chaque inbound enrichit un lead.  
6. Chaque `sold` / `lost` écrit stock + raison.

### 5.3 Score simple
- +3 marketplace_message / phone_in / walk_in  
- +2 stock précis  
- +2 consent express  
- +1 follow-up dû  
- −2 consent unknown  
- −5 lost  

File du matin : **follow-up dû → score → stage**.

### 5.4 Marketplace → leads → ventes
```
Stock → préparer listing → [toi publies]
  → inbound Messenger/appel
  → capture lead (sourceRef = packetId)
  → lead bank++
  → préparer relance
  → [toi contactes]
  → RDV / essai
  → sold | lost
```

Oria empêche la fuite : pas de lead oublié, pas de post sans capture, pas d’essai sans follow-up, pas de perte sans raison.

---

## 6. Architecture

```
buckinghamgm.com (public HTML)
        │
        ▼
 W1 inventory.sync ──► InventorySnapshot (local)
        │
        ├─► Joris (questions stock)
        │
        ├─► W3 marketplace.listing.prepare
        │         │
        │         ▼
        │   [TOI → Facebook Marketplace]
        │         │
        │         ▼
        │   W4 marketplace.lead.capture
        │
        └─► LeadBank ◄── walk-in / phone / web / import
                │
                ▼
         W2 sales.follow_up.prepare
                │
                ▼
         Send Desk / copy
                │
                ▼
         [TOI envoies]
                │
                ▼
         RDV / essai / offre
                │
                ▼
         W5 sale.outcome.capture → sold | lost
```

---

## 7. Workflows détaillés

### W1 — `inventory.sync`
Fetch allowlist → parse Stock/VIN/année/modèle/trim/prix/photos/url → diff → snapshot → ledger read-only.  
Failure : CSV/JSON manuel toujours dispo.  
Done when : « Combien de Trax LT ? » répond depuis le snapshot.

### W2 — `lead.bank.upsert`
Validate → dedupe phone/email → upsert → `nextFollowUpAt` → lien stock.  
Invariants : `source` + `consentBasis` obligatoires.  
Done when : toute conversation utile finit dans la lead bank.

### W3 — `sales.follow_up.prepare`
Draft FR (SMS ou email) → policy warm-only → Send Desk/copy.  
Sous-voies v1 : `reply_assist` | `follow_up` ; cold bloqué.  
Done when : relance prête en < 2 minutes.

### W4 — `marketplace.listing.prepare`
Titre + description + prix + photos + disclaimers → packet.  
`requiresManualPublish: true` ; no Facebook bot.  
Done when : packet collable en 5 minutes.

### W5 — `marketplace.lead.capture`
Inbound post Marketplace → upsert lead `marketplace_message` → `sourceRef=packetId` → follow-up dû maintenant.  
Done when : chaque réponse Marketplace enrichit la lead bank.

### W6 — `sale.outcome.capture`
`sold` exige `soldStockId` ; `lost` exige `lostReason` → ledger.  
Done when : funnel réel `new → appt → sold/lost`.

---

## 8. Banque de leads — renforcer maintenant

### Jour 1 (même sans code réseau)
1. Saisir **tous** les leads déjà chauds.  
2. Forcer `source` + `consentBasis` + `nextFollowUpAt`.  
3. Lier chaque lead à un modèle/stock.  
4. Préparer 5–10 drafts types (Trax, Trailblazer, Sierra, Equinox EV…).  
5. Publier 1–2 annonces Marketplace manuellement et logger chaque inbound comme lead.

### Score lead
- +3 marketplace_message / phone_in / walk_in  
- +2 stock précis  
- +2 consent express  
- +1 follow-up dû  
- −2 consent unknown  
- −5 lost  

File du matin : **follow-up dû → score → stage**.  
Funnel semaine 2 : `new → contacted → appt_set → appt_done → sold|lost`.

---

## 9. Implantation détaillée

Chaque PR : petite, typée, testée, `typecheck` + `lint` + `build` + `smoke:joris`.

### Jour 0
1. Merger **PR #343**.  
2. Accordo concession (inventaire public + outils perso + Marketplace).  
3. Verrouiller canal : **SMS** (recommandé) ou email.  
4. Dump initial lead bank.

### Sprint A — Inventaire
| PR | Contenu | Zone |
|----|---------|------|
| A1 | Types + validateurs inventaire + tests | Green |
| A2 | Ingest manuel CSV/JSON → snapshot local | Green |
| A3 | Fetch allowlist + parse + API owner-gated + ledger read-only | Yellow |
| A4 | Intent Joris inventaire = dernier snapshot | Faible |

### Sprint B — Lead bank + ventes assistées
| PR | Contenu | Zone |
|----|---------|------|
| B1 | `SalesLead` + store + dedupe + import CSV | Green |
| B2 | File du matin (follow-ups dus + score) | Green |
| B3 | Prepare follow-up → Send Desk / copy | Yellow |
| B4 | Capture sold/lost + rappels appts sans outcome | Green |

### Sprint C — Marketplace → leads → ventes
| PR | Contenu | Zone |
|----|---------|------|
| C1 | `MarketplaceListingPacket` + queue | Green |
| C2 | Préparer listing depuis stock | Faible |
| C3 | Capture lead depuis inbound post | Green |
| C4 | Enchaînement listing → publish manuel → lead → relance | Faible |

### Sprint D — seulement si A/B/C convertissent
- Cron inventaire  
- 2ᵉ canal relance  
- Connecteur Meta officiel (pas de bot)  
- Leçons Memex depuis sold/lost  

---

## 11. Semaine 1 opérations (même avant le code réseau)

1. Saisir **tous** les leads déjà chauds.  
2. Forcer source + consentement + `nextFollowUpAt`.  
3. Lier chaque lead à un modèle/stock.  
4. Préparer 5–10 drafts types (Trax, Trailblazer, Sierra, Equinox EV…).  
5. Publier 1–2 annonces Marketplace manuellement et logger chaque inbound comme lead.

### Score lead
- +3 marketplace_message / phone_in / walk_in  
- +2 stock précis  
- +2 consent express  
- +1 follow-up dû  
- −2 consent unknown  
- −5 lost  

File du matin : **follow-up dû → score → stage**.  
Funnel semaine 2 : `new → contacted → appt_set → appt_done → sold|lost`.

---

## 12. Décisions avant code

1. Mandat **Sprint A** maintenant ?  
2. Canal semaine 1 : **SMS** (recommandé) ou **email** ?  
3. Marketplace **prepare-only manuel** confirmé ?  
4. Semaine 1 : saisir **tous** les prospects déjà connus — OK ?

Dès que c’est oui → implantation **A1** (contrats + tests), sans toucher auth, secrets, ni Phase 1.
