# Buckingham GM × Oria — Plan opérateur ventes (solide, sans casser le HQ)

**Status:** Plan d’implantation (docs-only) — **pas encore de code**  
**Owner:** Michael Boyer  
**Contexte:** Poste de représentant aux ventes automobiles — Buckingham Chevrolet Buick GMC (`buckinghamgm.com`, Gatineau)  
**Produit:** Oria HQ (orthographe canonique : **Oria**, pas « Horia »)  
**Date:** 2026-07-11  

> Objectif : une boucle quotidienne simple pour ton nouveau poste — inventaire → relances → annonces Marketplace — **sans overbuild** et **sans briser** les garde-fous Oria existants.

---

## 1. Intention (une phrase)

Oria devient ton **assistant de plancher** : il connaît l’inventaire public Buckingham, prépare des relances et des fiches Marketplace ; **toi** tu valides, tu contacts, tu publies.

---

## 2. Principes (non négociables)

| Règle | Pourquoi |
|-------|----------|
| **Prepare → CEO approve → manual act** | Aligné Relay / Send Desk / Studio : pas d’auto-send, pas d’auto-publish |
| **Ne pas toucher Phase 1 / multi-workspace** | Gelé jusqu’à mandat explicite (`AGENTS.md`) |
| **Ne pas empiler de nouveaux agents** | Réutiliser Joris + Relay (+ Studio seulement si besoin contenu) |
| **Inventaire = lecture publique d’abord** | Pages inventaire du site concession ; pas de scrape CRM interne / cookies employeur |
| **CASL + politique concession** | Relances seulement sur leads consentis / contacts légitimes ; valider avec le concessionnaire |
| **Facebook Marketplace = prepare-only v1** | Auto-post Marketplace est fragile, ToS-sensitive, et Yellow/Red ; v1 = fiche prête + copie manuelle |
| **1 boucle live à la fois** | Anti-overbuild : inventaire d’abord, puis relances, puis Marketplace |

---

## 3. Réalité terrain (Buckingham GM)

Sources publiques utiles (à re-vérifier lundi) :

- Inventaire neufs (FR) : `https://www.buckinghamgm.com/neufs/inventaire/recherche.html`
- Variantes marque/modèle/année sous `/neufs/inventaire/…`
- Champs typiques visibles : **Stock**, **NIV/VIN**, marque, modèle, année, finition, prix (quand affiché)

**Implication technique :** un *inventory snapshot* peut être construit à partir de pages publiques structurées (HTML/listes), **sans** accéder au DMS/CRM concession tant que tu n’as pas d’accord écrit.

---

## 4. Spécifications Workflow (3 workflows seulement)

### W1 — `inventory.sync` (Radar lecture + Joris surface)

| Champ | Spec |
|-------|------|
| **Trigger** | Manuel (matin / soir) ou cron Yellow plus tard |
| **Input** | URL inventaire + filtres optionnels (neufs / occasion / marque) |
| **Étapes** | 1) Fetch pages publiques allowlistées → 2) Parse Stock/VIN/année/modèle/prix → 3) Diff vs snapshot précédent → 4) Écrire snapshot local + ledger *read* |
| **Output** | `InventorySnapshot` + liste « nouveaux / vendus / prix changés » |
| **Agent** | Ingest technique (outil) ; **Joris** résume : « 12 Trax LT en stock, 2 nouveaux aujourd’hui » |
| **Zone** | Yellow (réseau sortant lecture) — **pas** Green autonome au début |
| **Invariants** | Allowlist hostname `buckinghamgm.com` only ; pas de credentials ; pas d’écriture externe ; rate-limit strict |
| **Done when** | Tu peux demander à Joris « qu’est-ce qu’on a en Trax LT ? » et obtenir une réponse basée sur le dernier snapshot |

### W2 — `sales.follow_up.prepare` (Relay + Send Desk)

| Champ | Spec |
|-------|------|
| **Trigger** | Lead tiède / prospect connu / rendez-vous manqué (saisi par toi ou import CSV) |
| **Input** | Contact + véhicule d’intérêt (Stock/VIN) + historique court |
| **Étapes** | 1) Joindre fiche inventaire → 2) Draft SMS/email FR → 3) Enfiler `prepared` / Send Desk → 4) **Toi** envoies |
| **Output** | Prepared action outbound (`follow_up` / `reply_assist` seulement en v1) |
| **Agent** | **Relay** prépare ; **Joris** orchestre ; **Send Desk** envoie |
| **Zone** | Yellow batch / manual send — warm-first (`REVENUE_EXECUTION_LANE.md`) |
| **Invariants** | `requiresCeoApproval` + `requiresManualSend` ; pas de cold massif v1 ; consentement connu |
| **Done when** | En &lt; 2 min : lead + véhicule → message prêt → tu copies/envoies |

### W3 — `marketplace.listing.prepare` (Studio-style packet, publish manuel)

| Champ | Spec |
|-------|------|
| **Trigger** | Véhicule choisi à pousser sur Facebook Marketplace |
| **Input** | Stock/VIN + photos URLs publiques + prix + points forts |
| **Étapes** | 1) Générer titre + description FR Marketplace → 2) Checklist photos / prix / disclaimers → 3) Queue « prêt à publier » → 4) **Toi** colles sur Marketplace |
| **Output** | `MarketplaceListingPacket` (prepare-only) |
| **Agent** | Studio (copy) ou Relay (packet) — **un seul** module, pas les deux |
| **Zone** | Yellow prepare ; publish = **toujours manuel** en v1 |
| **Invariants** | `publishAuthorized: false` ; pas d’API Facebook auto ; pas de bot UI Marketplace |
| **Done when** | 1 clic « préparer Marketplace » → texte + checklist prêts à coller |

**Explicitement hors v1 (NO-GO jusqu’à mandat + conformité) :**

- Auto-post Facebook Marketplace / scraping session Facebook  
- Scraping CRM / intranet employeur  
- Cold outreach massif  
- Modification prix / inventaire côté concession  

---

## 5. Contrats de données (minimaux)

```ts
// Inventaire — lecture seule
type VehicleInventoryItem = {
  stockId: string;       // ex. 26326-NEUF
  vin?: string;          // NIV
  year: number;
  make: string;          // Chevrolet | Buick | GMC
  model: string;
  trim?: string;
  condition: "new" | "demo" | "used";
  priceCents?: number | null;
  url: string;           // fiche publique
  photoUrls: string[];
  capturedAtIso: string;
};

type InventorySnapshot = {
  snapshotId: string;
  sourceHost: "buckinghamgm.com";
  capturedAtIso: string;
  items: VehicleInventoryItem[];
  added: string[];       // stockIds
  removed: string[];
  priceChanged: string[];
};

// Relance — réutilise outbound existant (follow_up / reply_assist)
// Marketplace — prepare-only
type MarketplaceListingPacket = {
  packetId: string;
  stockId: string;
  title: string;
  body: string;
  suggestedPriceLabel: string;
  photoUrls: string[];
  sourceUrl: string;
  requiresManualPublish: true;
  noExecutionAuthorized: true;
  createdAtIso: string;
};
```

---

## 6. Plan d’implantation (sans rien briser)

Ordre strict. Chaque PR = petit, validé (`typecheck` / `lint` / `build` / `smoke:joris`), mergeable seul.

### Préalable (lundi humain, pas de code)
0. Merger **#343** si encore ouverte (approve + squash)  
1. Clarifier avec le concessionnaire : OK d’utiliser l’inventaire **public** + outils perso pour relances ; règles photos / prix Marketplace  
2. Choisir **1 canal de relance** pour la semaine 1 : SMS **ou** email (pas les deux)

### Sprint A — Inventaire solide (fondation)
| PR | Contenu | Risque |
|----|---------|--------|
| **A1** | Contrat pur `VehicleInventoryItem` + `InventorySnapshot` + validateurs + tests | Green / nul effet produit |
| **A2** | Ingest **manuel** : coller JSON/CSV export ou fixture → snapshot local (pas de réseau) | Green |
| **A3** | Fetch allowlist `buckinghamgm.com` + parse minimal + dry-run API owner-gated + ledger note « read only » | Yellow borné |
| **A4** | Surface Joris : intent « inventaire / stock / Trax » lit le **dernier** snapshot (pas de scrape live à chaque message) | Faible |

**Critère A :** lundi soir, tu as une liste locale à jour et Joris peut la résumer.

### Sprint B — Relances (cash loop)
| PR | Contenu | Risque |
|----|---------|--------|
| **B1** | Modèle `SalesLead` minimal (nom, téléphone/email, stockId intérêt, consentBasis) + store local | Green |
| **B2** | Wire Relay/outbound existant : packet follow_up lié à un véhicule du snapshot | Réutilise Send Desk |
| **B3** | UX minimale : « Préparer relance » depuis une fiche stock → draft dans Send Desk / copy | Faible |

**Critère B :** un lead + un stock → message prêt → envoi manuel.

### Sprint C — Marketplace prepare-only
| PR | Contenu | Risque |
|----|---------|--------|
| **C1** | `MarketplaceListingPacket` + builder + queue in-memory (miroir Studio) | Green |
| **C2** | « Préparer pour Marketplace » depuis stock → titre/body/photos checklist | Faible |
| **C3** | (Plus tard, mandat) connecteur officiel Meta **si** dispo + conformité — sinon rester manuel | Yellow/Red |

**Critère C :** 5 minutes pour coller une annonce Marketplace propre à partir du stock.

### Explicitement reporté
- Phase 1 multi-workspace  
- Subprocess CLI / OAuth marketplace générique  
- Auto-publish Marketplace  
- Worker scrape 24/7  

---

## 7. Boucle quotidienne cible (après A+B)

1. **Matin (3 min)** — sync inventaire → lire « nouveaux / partis »  
2. **Journée** — leads : 1 relance préparée à la fois via Oria → envoi manuel  
3. **Soir (5 min)** — 0–2 fiches Marketplace préparées → publish manuel si pertinent  

Si tu te demandes « c’est live ou shadow ? », le scope a dérivé.

---

## 8. Risques & mitigations

| Risque | Mitigation |
|--------|------------|
| HTML site change → scrape casse | Snapshot + parser versionné ; fallback CSV manuel (A2) toujours dispo |
| ToS / robots.txt | Respecter allowlist + rate limit ; préférer export concession si offert |
| CASL / mauvaise relance | Warm-only v1 ; consentBasis obligatoire ; pas de cold |
| Overbuild | 3 workflows max ; pas de 4ᵉ agent ; pas de panel Autonomy comme todo |
| Casser HQ existant | Pas de refactor core ; nouveaux modules `inventory/` / venture locale ; validation 4 checks |

---

## 9. Décision à trancher avant code

Réponds par oui/non (sinon on reste docs-only) :

1. **Sprint A lundi** (inventaire local + Joris résumé) — mandat ?  
2. Canal relance semaine 1 : **SMS** ou **email** ?  
3. Marketplace : confirmer **prepare-only manuel** (recommandé) — OK ?

---

## 10. Lien avec le plan recentrage HQ

Ce plan **remplace** la tentation « Yellow 4 / autonomie générique » par une **verticale métier** bornée.  
Le HQ reste la plateforme ; Buckingham = **premier usage réel** qui doit te faire gagner du temps dès la première semaine — pas un nouveau cockpit parallèle.
