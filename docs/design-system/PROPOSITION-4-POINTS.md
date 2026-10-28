# Proposition — les 4 points « À définir » de DESIGN_SYSTEM.md

Statut : **proposition, rien n'est appliqué au code.** Ni `globals.css` ni les composants ne changent dans cette PR. Mesures faites sur `main` à `c991628` (2026-10-27), sur les 143 fichiers `.tsx` de `src/`.

Capture de l'existant : `existant-jetons-couleur.png`. C'est le rendu des jetons de `globals.css` avec leur contraste calculé, pas une capture de l'application : je n'ai pas lancé l'app (pas d'`npm install` possible sur ma machine).

## Constat de départ (mesuré)

- Les 7 couleurs sémantiques de `globals.css` sont utilisées **0 fois** sous forme `var(--…)` dans `src/`. Le code utilise directement Tailwind : `amber` (755 occurrences), `emerald` (507), `red` (306), `sky` (154), `violet` (143), `rose` (120), `orange` (70).
- Des hex sont codés en dur dans les `.tsx`, par exemple `#646c8e` (36), `#eff1fb` (28), `#98a1c4` (27). Cela contredit la règle « ne pas coder de nouvelle couleur en dur ».
- Contrastes de texte qui **échouent en WCAG AA (4.5:1)** :
  - `--fg-ghost` : 2.87 sur `--ink-950`, 2.39 sur `--ink-800`
  - `--fg-faint` : 4.35 sur `--ink-800`
  - `--grape` : 4.17 sur `--ink-800`
  - `--berry` : 4.38 sur `--ink-800`
  - `--border-strong` : 1.59 sur `--ink-800`, sous le 3:1 exigé pour un composant d'interface quand la bordure est le seul repère
- Tailles de texte : `text-xs` (562), `text-sm` (535), `text-[11px]` (358) et `text-[10px]` (118) dominent. On trouve aussi 10 autres tailles arbitraires (9 ; 10,5 ; 11,5 ; 12,5 ; 13 px…).
- Espacement : `gap-2` (398), `gap-3` (273), `mt-1`/`mt-2`/`mt-3`, `px-3`, `gap-1.5`, `p-4` dominent, presque toujours sur la grille de 4 px de Tailwind.
- Avatars : aucun asset Billy Bouton dans le repo. `joris-presence.tsx:8` dit explicitement « Pas d'avatar, pas d'animation décorative ».

## 1. Rôles des couleurs

Ajouter des alias de rôle, sans nouvelle teinte :

| Rôle | Jeton proposé | Valeur | Usage |
|---|---|---|---|
| Accent de marque | `--accent` | `--marigold` | Sélection, focus, élément actif |
| Succès vérifié | `--success` | `--mint` | Terminé **avec preuve** (doneChecks passés) |
| Action requise | `--warning` | `--tangerine` | `waiting_approval`, budget proche de la limite |
| Danger, refus | `--danger` | `--berry` | Refus de la garde, échec ; fonds et icônes seulement |
| Texte de danger | `--danger-text` | `--coral` | Texte d'erreur (6.12 sur `ink-800`, contre 4.38 pour `berry`) |
| Activité réelle | `--live` | `--sky` | En cours **avec heartbeat récent** uniquement |
| Neutre, attente | `--idle` | `--fg-muted` | En attente machine, `quota_exhausted`, non jugé, en file |
| Agent, IA | `--agent` | `--grape` | Identité d'agent ; jamais en texte courant sur `ink-800` |

Choix à valider : l'accent (`marigold`) et l'avertissement (`tangerine`) sont séparés. Sinon, l'élément sélectionné ressemblerait à une demande d'action.

Règles :

- La couleur n'est jamais le seul signal (WCAG 1.4.1) : chaque état a un libellé et une icône lucide.
- Interdire `--fg-ghost` pour du texte : il reste réservé aux éléments décoratifs ou désactivés.
- `--fg-faint` ne sert que sur `ink-950` ou `ink-900`.
- Remonter `--border-strong` à `#5c5c5c` environ, à mesurer pour atteindre au moins 3:1 sur `ink-800`, quand la bordure est le seul repère d'un champ.
- Migration Tailwind vers les jetons (amber, emerald, red…) : PR séparée, écran par écran, avec capture avant et après.

## 2. Échelle de texte

Six tailles, toutes sur l'échelle Tailwind :

| Jeton | Taille / interligne | Usage |
|---|---|---|
| `xs` | 12 / 16 | Métadonnées, badges, horodatages, données mono |
| `sm` | 14 / 20 | Texte d'interface par défaut |
| `base` | 16 / 24 | Texte de lecture (brief, plans, rapports) |
| `lg` | 18 / 28 | Titre de carte |
| `2xl` | 24 / 32 | Titre de page (`--font-display`) |
| `3xl` | 30 / 36 | Chiffre clé du cockpit, une fois par écran au plus |

Règles :

- Plus aucune taille arbitraire. Le minimum est de 12 px.
- Les 358 `text-[11px]` et 118 `text-[10px]` passent à `text-xs`. Cela change la densité de plusieurs écrans : migration écran par écran, avec capture.
- Le texte doit rester lisible avec un espacement agrandi (WCAG 1.4.12) : pas de hauteur fixe sur un conteneur de texte.

## 3. Règle d'espacement

Grille de 4 px, sept pas seulement : `1` (4), `1.5` (6), `2` (8), `3` (12), `4` (16), `6` (24), `8` (32). `0.5` est réservé aux pastilles.

| Niveau | Pas |
|---|---|
| Dans un composant (icône et libellé, champs d'une ligne) | `1.5` à `2` |
| Padding d'une carte | `3` (compact) ou `4` |
| Entre cartes | `3` à `4` |
| Entre sections d'un écran | `6` à `8` |

Règles :

- Aucune valeur arbitraire (`gap-[9px]`, `padding: 10` en style inline).
- Cible cliquable d'au moins 24×24 px (WCAG 2.5.8).

## 4. Avatars d'agents Billy Bouton

- Le repo ne contient aucun asset Billy Bouton : **je n'en invente pas.** Il faut le fichier source ou la direction du boss.
- En attendant, l'avatar est une pastille ronde (`rounded-full`) avec les initiales de l'agent sur sa couleur d'identité, prise dans `grape`, `sky`, `mint`, `marigold`, `coral` et `tangerine`. Les initiales sont en `--ink-950` pour garder un contraste suffisant.
- Trois tailles : 24, 32 et 48 px.
- L'état est porté par un anneau et un libellé, jamais par l'avatar seul :
  - `--live` avec heartbeat récent ;
  - `--warning` pour une approbation attendue ;
  - `--danger` pour un blocage ;
  - `--idle` pour l'attente.
- `oria-breathe` n'est permis que si un heartbeat récent existe. Sinon l'avatar est statique, comme le veut `joris-presence.tsx`.
- `prefers-reduced-motion` coupe toute boucle.
- Le nom accessible de l'avatar donne l'agent et son état, par exemple « Atelier, en attente machine ».

## Ce que cette PR ne fait pas

- Elle ne modifie ni `globals.css` ni aucun composant.
- La mise en œuvre viendra dans des PR séparées, après le oui du boss sur chacun des quatre points.
