# Recherche — Remake v3 d'Oria : un centre d'opérations où chaque chose a sa place

Recherche faite le 25 octobre 2026, vers 11 h 45 HAE. Chaque source a été **ouverte** pendant la recherche (WebFetch, ou curl HTTP 200 + extraction de texte). Les citations sont des reformulations fidèles ou de courts extraits ; rien n'est ajouté au-delà des sources. Les principes « → Oria » sont **nos propositions**, pas des affirmations des sources.

Contexte produit lu : `/workspace/oria-plan/R4-ALIGNEMENT.md` et le PDF « Plan produit Oria HQ — Révision 4 » (chap. 01 *Le cockpit quotidien*, 02 *Employés*, 05 *Connexions*). Exigences clés retenues : contexte actif toujours visible, **centre d'attention unifié** (décision, précision, accès expiré, budget, exécution incertaine, livrable à examiner), conversation → carte de mission, atelier inspectable, modèle demandé vs observé (« non confirmé » sans preuve), « une activité animée correspond à une exécution observable », retour du lendemain sans réexpliquer.

## 1. Cockpits et salles de contrôle

### 1.1 Aviation — « dark cockpit » (Airbus)
Sources : <https://v1prep.com/library/flight-deck-layout-and-master-warnings.html> · présentation Airbus/OACI <https://www.icao.int/sites/default/files/sp-files/ESAF/Documents/meetings/2017/AFI%20FOSAS%202017/Day%201%20Docs/Day_1_2_Airbuspihlo.pdf> (via recherche)
- Panneau supérieur éteint quand tout est normal (« lights out ») ; toute lumière mérite l'attention. Rouge = action immédiate, ambre = panne à connaître, bleu = sélection temporaire, blanc = position anormale/test.
- L'ECAM centralise l'information système et **indique les actions requises**.
- → Oria : **l'écran calme est l'état normal**. La couleur n'apparaît que pour une exception. Le centre d'attention joue le rôle de l'ECAM : chaque alerte dit l'action, le contexte et la décision attendue (comme le demande le plan, chap. 01).

### 1.2 NASA-STD-3001, Annexe F « Display Standard »
Source : <https://www.nasa.gov/reference/appendix-f-vol-2/> (lue en entier)
- F.4.2 : zone dédiée commune toujours visible (heure, messages système, alertes, état des communications) ; **titre unique** dans un emplacement constant ; champs récurrents aux mêmes positions sur tous les formats ; barre de navigation principale en haut ou en bas.
- F.4.1 : limiter l'information au nécessaire ; éviter le défilement horizontal ; actions irréversibles = deux actions indépendantes.
- F.4.3.1 : indiquer l'état courant et **signaler les données périmées** (« stale »).
- F.4.3.3 : messages d'erreur dans un lieu désigné : ce qui ne va pas, quoi faire, la cause.
- F.5.1/F.5.10 : police à chasse fixe pour les nombres et tableaux ; casse mixte ; contraste ≥ 6:1 (10:1 préféré) ; la couleur porte un sens, jamais une décoration ; indice supplémentaire si couleur critique.
- F.5.3 : information à 4 niveaux maximum.
- F.5.11 : clignotement réservé à ce qui exige une action immédiate ; arrêt du clignotement contrôlé par l'opérateur.
- F.6.1 : heures toujours étiquetées avec leur système de temps.
- F.6.2 : afficher le **niveau d'automatisation**, l'état du processus automatisé (en cours, en pause, en faute, terminé…), l'historique, la **source du contrôle** (autonome / opérateur), une explication des recommandations ; éviter les formulations anthropomorphiques.
- F.6.4 : compteurs d'alertes actives par priorité + file des non-acquittées ; actions acquitter/suspendre.
- → Oria : bande d'état **fixe** (contexte, heure HAE, runtime, modèle observé, alertes) ; heures toujours suivies de « HAE » ; badge « périmé » sur toute donnée datée ; chaque mission affiche son mode (manuel / autonome / en attente de vous) ; seuil de contraste interne **≥ 7:1 pour le texte courant** (plus strict que l'AA 4.5:1, aligné sur la NASA).

### 1.3 ISA-101 / IHM haute performance
Sources : ISA, « The High Performance HMI » <https://www.isa.org/getmedia/06130a38-f7af-4b35-8c9c-2c34f25c1977/The-High-Performance-HMI-Overview-v2-01.pdf> (PDF lu) · ASM Consortium/Honeywell, « Why Gray Backgrounds » <https://process.honeywell.com/content/dam/process/en/documents/document-lists/doc_asm-consortium/white-papers/February%2028%202011%20-%20Why%20Gray%20Backgrounds%20for%20DCS%20Operating%20Displays.pdf> · ISA InTech 2023 <https://www.isa.org/intech-home/2023/april-2023/features/how-dcs-migration-improves-operator-experience> (via recherche)
- La couleur n'est **jamais le seul** différenciateur ; palette limitée et cohérente ; couleurs vives réservées aux situations anormales ; les couleurs d'alarme ne servent à rien d'autre.
- Fonds gris pour limiter l'éblouissement.
- **Hiérarchie en niveaux** : Niveau 1 = vue d'ensemble de toute l'étendue de contrôle ; Niveau 2 = contrôle d'une unité (tout ce qu'il faut pour la plupart des tâches) ; Niveau 3 = détail d'un équipement pour le diagnostic ; (Niveau 4 = diagnostic détaillé).
- Le livre blanc ASM recommande un fond **clair** dans une salle bien éclairée (vigilance), et du gris plutôt que bleu/vert/beige.
- → Oria : **3 niveaux** stricts : N1 *Pont* (tous les contextes), N2 *Contexte* (une entreprise/un projet), N3 *Détail* (une mission, un employé, un atelier). Neutres non saturés ; l'accent n'est utilisé que pour l'action principale et l'activité réelle.

## 2. Logiciels de référence

### 2.1 Linear
Sources : <https://linear.app/now/behind-the-latest-design-refresh> · <https://linear.app/now/how-we-redesigned-the-linear-ui> · <https://linear.app/docs/inbox>
- Refresh récent : « ne pas réclamer une attention qu'on n'a pas méritée » — la barre latérale est atténuée pour laisser le contenu dominer ; moins d'icônes ; bordures adoucies (« la structure se ressent plus qu'elle ne se voit »).
- Thèmes générés en **LCH** à partir de 3 variables (base, accent, contraste), ce qui permet des thèmes à fort contraste pour l'accessibilité.
- Inbox : onglet *Priorité* qui sépare ce qui demande votre attention du reste ; raccourcis `G` puis `I`, `J/K`, `H` pour reporter (snooze) ; rappels qui font revenir un élément à l'heure voulue.
- → Oria : navigation atténuée, contenu au premier plan ; tokens dérivés de 3 paramètres ; centre d'attention avec *Priorité*, report, rappel « Reprendre demain ».

### 2.2 Raycast
Source : <https://www.raycast.com/blog/a-technical-deep-dive-into-the-new-raycast>
- Suivre les conventions natives du bureau plutôt que celles du web (pas de `cursor: pointer`, peu de survol, popovers natifs).
- → Oria : interface d'*outil*, pas de site : densité, retours instantanés au clavier.

### 2.3 Arc (The Browser Company)
Source : <https://start.arc.net/cure-tab-overload> (la page d'aide Arc renvoie 403 au fetch ; contenu équivalent lu dans les résultats de recherche)
- Les *Spaces* sont « comme des barres latérales uniques » pour les différents domaines de vie ; chacun a ses épinglés, son thème, son icône ; bascule au clavier.
- → Oria : le **contexte** (perso / projet / entreprise) change toute la barre latérale et porte une teinte d'identité discrète ; bascule `Ctrl+1…9`.

### 2.4 visionOS / Apple HIG
Sources : <https://developer.apple.com/design/human-interface-guidelines/designing-for-visionos> · <https://developer.apple.com/design/human-interface-guidelines/materials> (contenu JSON officiel lu)
- Le contenu est amené à la personne, qui reste au repos ; confort visuel primordial.
- Materials : le verre (Liquid Glass) forme une **couche fonctionnelle distincte** pour la navigation et les contrôles, qui flotte au-dessus du contenu ; **ne pas l'utiliser dans la couche de contenu** ; l'utiliser avec parcimonie.
- → Oria : la *seule* surface translucide est la couche de commande (bande d'état, palette ⌘K, barre mobile) ; le contenu reste opaque et lisible.

### 2.5 Devin (Cognition)
Source : <https://docs.devin.ai/work-with-devin/devin-session-tools>
- Shell, IDE et navigateur, réunis dans un onglet *Progress* qui consigne commandes, modifications et activité navigateur dans une seule vue ; historique des commandes navigable dans le temps ; reprise en main en mettant l'agent en pause ; *side chats* en lecture seule qui n'interrompent pas le travail.
- → Oria : l'Atelier a une **frise chronologique unique** des étapes (spec → code → test → aperçu → correction) ; cliquer une étape montre ses artefacts ; « Demander une correction » ne casse pas l'historique.

### 2.6 Cursor — Agents Window
Source : <https://cursor.com/docs/agent/agents-window>
- Plusieurs espaces de travail dans une seule fenêtre, nouvelle vue des diffs pour relire et committer, agents en parallèle, passage local ↔ cloud, worktrees isolés.
- → Oria : vue *Missions* multi-contextes depuis le Pont ; relecture du diff au même endroit que l'aperçu.

### 2.7 Granola (repère d'identité)
Source : <https://www.granola.ai/blog/a-new-look-for-granola>
- Objectif annoncé : une présence « calme mais avec de l'énergie dessous » pour des gens aux vies rapides ; slab serif mécanique (Quadrant) + police UI neutre.
- → Oria : un côté chaud, éditorial, pour la *fiche entreprise* (hérité de la direction Cartographe).

## 3. Motifs d'interaction

### 3.1 Divulgation progressive
Source : <https://www.nngroup.com/articles/progressive-disclosure/> (J. Nielsen)
- Montrer d'abord peu d'options importantes ; le reste à la demande. Améliore apprentissage, efficacité, taux d'erreur. **Au-delà de 2 niveaux, on se perd souvent.** Libellé du passage au niveau suivant avec une forte « odeur d'information ».
- → Oria : chaque écran = 1 vue principale + **1 seul** panneau de détail (tiroir à droite) ; jamais de tiroir dans un tiroir.

### 3.2 Palette de commandes
Source : <https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/>
- Disponible **partout** avec le même raccourci, qui l'ouvre et la ferme ; **centrale** (une seule palette) ; « omnipotente » (toutes les actions) ; tolérante (recherche floue, synonymes) ; contextuelle (commandes pertinentes remontées) ; elle **enseigne le raccourci**.
- Les boutons visibles restent : la palette est une couche plus rapide, pas un remplacement.
- → Oria : `⌘K` / `Ctrl+K` partout ; synonymes FR/EN (« embaucher » = « ajouter un employé ») ; chaque ligne affiche son raccourci ; actions non autorisées visibles mais désactivées avec la raison.

### 3.3 Centre d'attention / inbox unifiée
Sources : Linear Inbox (ci-dessus) · NASA F.6.4 (compteurs, file des non-acquittées) · Plan Oria R4 chap. 01.
- → Oria : **une seule** file pour tout ce qui attend Michael, triée par priorité, chaque carte = *quoi*, *pour quel contexte*, *décision attendue*, *depuis quand*, *source*. Actions : décider, reporter, ouvrir. Compteur toujours visible dans la bande d'état.

## 4. Synthèse — 12 principes pour Oria v3
1. **Pont calme** : rien ne brille si rien ne demande Michael (dark cockpit).
2. **Places fixes** : bande d'état en haut, rail de navigation à gauche, contenu au centre, détail à droite, compositeur en bas — identiques sur tous les écrans (NASA F.4.2).
3. **3 niveaux** : Pont → Contexte → Détail (ISA-101), pas plus.
4. **Un seul tiroir** de détail (NN/g : ≤ 2 niveaux).
5. **Couleur = sens** : ambre décision, rouge échec/blocage, bleu info, vert vérifié ; jamais seule (icône + texte).
6. **Mouvement = exécution observable** (plan R4) ; arrêt avec `prefers-reduced-motion` ; aucun clignotement.
7. **Provenance partout** : réelle / exemple / périmée / non confirmée.
8. **Temps étiqueté** : « 09 h 07 HAE », durée relative en plus.
9. **Mode d'automatisation visible** : qui agit maintenant (vous / employé / runner Oria).
10. **⌘K omniprésent** qui enseigne les raccourcis.
11. **Erreur = quoi, pourquoi, quoi faire** au même endroit.
12. **Verre seulement pour la couche de commande** (HIG Materials).

## Limites
- Pages Arc help (403) et ISA InTech : lues via les extraits du moteur de recherche, non ouvertes directement.
- Aucun test utilisateur ; les principes sont des propositions à vérifier sur tâches réelles (plan R4, chap. 01).
