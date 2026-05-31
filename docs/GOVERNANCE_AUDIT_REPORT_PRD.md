# Mini-PRD — Rapport d'audit de gouvernance exportable (ROI palier 1)

**Statut :** proposition, en attente de GO CEO. Aucune ligne de feature non
écrite tant que ce PRD n'est pas approuvé.
**Auteur :** Joris / Claude (builder). **Date :** 2026-05-31.

> ⚠️ Les chiffres de revenu/effort ci-dessous sont des **estimations** explicites
> pour aider à décider — pas des engagements ni des données mesurées.

---

## 1. Problème & opportunité

Orya HQ a maintenant un **trail d'audit de gouvernance** durable : chaque
décision CEO (`approved_to_plan`, `rejected`, …) est enregistrée, scopée par
workspace, human-on-the-loop, no-execution (table `governance_decisions`,
PR135–138). Cette donnée n'est aujourd'hui **lisible que dans le fil Joris**
(note de continuité).

Les PME qui adoptent des agents IA ont besoin de **prouver** leur gouvernance :
board reporting, due diligence, exigences type SOC2/ISO, clients enterprise qui
demandent « montrez-moi vos contrôles ». Aujourd'hui c'est ce qui les **bloque**
à l'achat. On a déjà la donnée ; il manque la **sortie présentable**.

**Opportunité :** transformer un artefact interne en livrable vendable — un
**rapport d'audit exportable** (PDF/CSV) de l'historique des décisions de
gouvernance par workspace et par période.

## 2. Qui paie, et pourquoi

| Persona | Douleur | Déclencheur d'achat |
|---|---|---|
| Fondateur PME / CEO | « Mon board / mon client enterprise demande des preuves de gouvernance IA » | Lever des fonds, closer un gros client, audit |
| Ops / Conformité | Reconstituer manuellement qui a approuvé quoi | Préparation d'audit, revue trimestrielle |
| Agence / studio agents IA | Prouver à SES clients que les agents sont sous contrôle | Argument de vente / rétention |

## 3. Périmètre — MVP (ce qu'on construit)

Un export **lecture seule, dry-run, sans exécution** :

1. **Service de rapport** (pur, testable) : agrège les décisions d'un workspace
   sur une période → structure de rapport (totaux par outcome, timeline,
   dernière décision par work order, invariants vérifiés).
2. **Export CSV** : une ligne par décision (colonnes du contrat). Réutilise les
   lectures **bornées/paginées** de PR138.
3. **Export PDF** : un document propre (en-tête workspace + période, tableau
   récapitulatif par outcome, liste des décisions, mention « audit/planning —
   n'autorise aucune exécution »). Le repo a déjà `pdf-parse` ; pour la
   **génération** PDF il faudra une lib (voir §6 Risques/Dépendances).
4. **Déclencheur** : commande Joris (« génère le rapport d'audit gouvernance »)
   produisant le fichier — **pas** de nouvel endpoint public non audité.

### Hors-périmètre (explicitement)
- Pas de signature électronique / horodatage certifié (palier 2+).
- Pas de multi-tenant SaaS ni de portail (palier 2 : dashboard CEO).
- Pas de scheduling automatique des rapports (plus tard).
- Aucune exécution, aucun endpoint public non audité, aucune écriture hors table d'audit.

## 4. Découpage en PRs (petites, reviewables)

| PR | Contenu | Taille | Risque |
|---|---|---|---|
| **A** | Service de rapport pur (`buildGovernanceAuditReport`) + format CSV (string), tests purs | S | Très faible |
| **B** | Export PDF (lib de génération + mise en page) + tests de structure | M | Faible/moyen (dépendance) |
| **C** | Câblage déclencheur Joris (intent → fichier) + smoke | S | Faible |

Livrable vendable minimal = **A** (le CSV suffit déjà pour la conformité de base).
PDF (**B**) = montée en gamme « présentable board ».

## 5. Effort estimé (ordre de grandeur)

- **PR A** : ~0,5–1 jour. Logique pure + tests, réutilise lectures existantes.
- **PR B** : ~1–2 jours. Dépend du choix de lib PDF et de la mise en page.
- **PR C** : ~0,5 jour. Intent + génération fichier + smoke.

Total MVP (A+B+C) : **~2–3,5 jours** de build incrémental, validé à chaque PR.

## 6. Risques & dépendances

- **Lib de génération PDF** : pas encore présente (≠ `pdf-parse` qui lit).
  Candidats légers sans binaire natif (ex. `pdfkit`, `@react-pdf/renderer`).
  ⚠️ Toucher `package.json` → uniquement si nécessité claire et approuvée. **Mitigation :** livrer A (CSV) sans dépendance ; n'ajouter la lib qu'en PR B, sur GO explicite. Alternative zéro-dépendance : générer du HTML imprimable.
- **PII / confidentialité** : un rapport agrège des décisions. Garder l'export
  **scopé workspace** (RLS déjà en place) ; pas de fuite cross-workspace ;
  pas de secrets dans le rapport.
- **Activation prérequise** : le rapport n'a de valeur durable qu'une fois la
  migration 0008 **appliquée** (sinon données in-memory volatiles). Donc :
  faire l'étape ① (runbook #139) **avant** de vendre le rapport.

## 7. Modèle de revenu (hypothèses explicites)

Add-on « Conformité & Audit » sur l'abonnement, ou palier supérieur :

| Hypothèse (à valider) | Valeur prudente | Valeur optimiste |
|---|---|---|
| Prix add-on / mois | 20 $ | 50 $ |
| % de clients qui le prennent | 20 % | 40 % |
| Base de clients payants | (à remplir) | (à remplir) |

**Revenu mensuel ≈ base × %adoption × prix.** Ex. : 100 clients × 30 % × 30 $ =
**900 $/mois** récurrent. À ajuster avec tes vrais chiffres de base clients —
je n'invente pas la base.

Valeur indirecte (souvent plus grande que l'add-on lui-même) : **débloque des
deals** où la gouvernance prouvée est une condition d'achat.

## 8. Succès — comment on mesure

- ≥ 1 client cite le rapport comme raison d'achat/rétention (qualitatif).
- Temps de préparation d'un dossier d'audit : de « heures manuelles » → « 1 clic ».
- Taux d'adoption de l'add-on vs cible §7.

## 9. Recommandation

Construire **PR A en premier** (CSV, zéro dépendance, zéro risque) — ça livre
déjà un export de conformité vendable. Décider de **PR B (PDF)** ensuite selon
la demande client. Faire l'**activation Supabase (①)** en parallèle/avant pour
que la donnée soit durable.

**Prochain pas proposé :** sur GO, je démarre **PR A** (service de rapport +
export CSV, purs et testés), sans toucher `package.json`.
