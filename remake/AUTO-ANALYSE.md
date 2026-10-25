# Auto-analyse — Remake v3 « Pont »

Analyse du 25 octobre 2026, vers 12 h 15 HAE. Faite par l'auteur des maquettes : ce n'est donc pas une revue indépendante.

## 1. Cohérence (places fixes)
| Règle | Vérifiée sur les 15 écrans | Écart |
|---|---|---|
| Bande d'état : contexte, titre, ⌘K, runtime, attention, heure HAE | oui, gabarit unique `shell()` | — |
| Rail : même ordre, page courante marquée (`aria-current`) | oui | Palette et États rattachés au Pont |
| Un seul tiroir de détail, à droite | oui (Pont, Attention, Conversation, Session d'atelier) | en mobile, le tiroir passe sous le contenu |
| 3 niveaux maximum | oui : Pont → liste → objet | — |
| Provenance visible sur chaque bloc de données | oui | les compteurs du Pont sont étiquetés **exemple** au niveau du bloc, pas de chaque chiffre |
| Couleur jamais seule | les tags combinent symbole + mot (✓ ✕ ◆ ? ⏸ ↻) | les pastilles de contexte sont colorées mais toujours accompagnées du nom |
| Mouvement = exécution réelle | `.pulse` n'est rendu que si `running=True`. Aucune page ne l'active, puisque rien ne tourne réellement | rien n'est animé dans les captures, ce qui est voulu |
| Heures en HAE | toutes les heures de `mission.json` (UTC) sont converties en UTC−4 | — |

## 2. Accessibilité — axe-core (WCAG 2.0/2.1/2.2 A et AA)
- Outil : @axe-core/playwright, tags `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa`, Chrome, `reducedMotion: reduce`.
- Portée : 16 pages (15 écrans et `index.html`) × 2 largeurs (1440 et 390), soit **32 analyses**.
- Premier passage : **3 violations**, toutes corrigées :
  - `color-contrast` sur le bouton d'attention en mode Carte (×2) : le texte passe en blanc ;
  - `scrollable-region-focusable` sur le tableau des artefacts en 390 : ajout de `tabindex="0"`, `role="region"` et d'un libellé.
- **Passage final : 0 violation sur 32 analyses.** Résultats détaillés dans `captures/axe.json`.
- axe ne couvre qu'une partie des critères WCAG. « 0 violation » ne veut **pas** dire « conforme AA ».

## 3. Passe clavier (Playwright, Tab ×12)
- L'ordre est identique sur toutes les pages : lien d'évitement « Aller au contenu » (visible au focus) → contexte → ⌘K → attention → rail. Il est logique et stable.
- Le focus visible est un contour accent de 2 px sur tous les liens.
- **Lacunes :**
  - les boutons d'action sans destination (« Approuver », « Accepter », « Rejeter »…) sont des `<a>` sans `href`, donc **non atteignables au clavier** dans le prototype. En implémentation, ce doivent être des `<button>`.
  - la palette (`palette.html`) est une capture statique. Elle n'enferme pas le focus et `Échap` ne fait rien.
  - les raccourcis `G X`, `J/K`, `H`, `R` et `Ctrl 1…9` sont documentés mais pas branchés.

## 4. Limites honnêtes
- Prototype statique : pas de vraie recherche floue, pas de tiroir dynamique, pas d'état temps réel.
- Toutes les données sont **exemple**, sauf la session d'atelier « Calculatrice de pourboire » : elle vient de `mission.json` (branche `atelier/e1-d`, copie dans `mockups/mission.reelle.json`).
  - L'aperçu visuel de la calculatrice est un **rendu illustratif**, signalé sous l'image.
  - Le verdict « concordant » est **dérivé** des champs `requestedModelId` / `observedModelId` des étapes. Le fichier n'a pas de champ `modelProof`.
- Captures mobiles en pleine page : la barre d'onglets `position: fixed` apparaît au milieu de l'image longue. C'est un artefact de la capture ; dans un vrai navigateur, elle reste en bas.
- Polices chargées depuis Google Fonts. Sans réseau, des polices système les remplacent.
- Aucun test avec lecteur d'écran (NVDA/VoiceOver) et aucun test utilisateur.
- Les contrastes de `DESIGN-SYSTEM.md` sont calculés (formule WCAG). Les contrastes du mode Carte reprennent les valeurs calculées pour DIRECTIONS.md.

## 5. Captures recommandées
`captures/pont-1440.png`, `captures/atelier-session-1440.png`, `captures/attention-1440.png`, `captures/fiche-1440.png` (mode Carte), et `captures/atelier-session-390.png` pour le mobile.
