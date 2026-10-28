# Design System

<!-- Sources : src/app/globals.css (variables CSS), src/app/layout.tsx, package.json, usage des classes Tailwind dans src/**/*.tsx -->

## 01 Brand Identity

Oria est un centre de commandement vivant, pas un logiciel administratif gris ni un jeu qui cache le travail.

- La précision de Linear, la rapidité de Raycast, avec une personnalité propre à Oria.
- Agents Billy Bouton expressifs, missions lisibles, décisions faciles à prendre.
- La progression affichée est liée aux actions réelles. Animations discrètes : aucune animation ne doit faire croire qu'un agent travaille quand il attend.
- On part du design existant (thème sombre, voir ci-dessous). Chaque ajout visuel doit aider à comprendre ou à agir.

## 02 Colour Palette

<!-- Source : src/app/globals.css (:root) -->

Thème : sombre (`color-scheme: dark`).

| Name | Hex | Use for |
|---|---|---|
| `--ink-950` | #0a0a0a | Fond principal (html, body, `--background`) |
| `--ink-900` | #121212 | Surface sombre |
| `--ink-870` | #161616 | Surface sombre |
| `--ink-850` | #171717 | Surface sombre |
| `--ink-820` | #1c1c1c | Surface sombre |
| `--ink-800` | #1f1f1f | Surface la plus claire de l'échelle ink |
| `--fg` | #f5f5f5 | Texte principal (`--foreground`) |
| `--fg-muted` | #a3a3a3 | Texte secondaire |
| `--fg-faint` | #838383 | Texte discret |
| `--fg-ghost` | #5a5a5a | Texte très discret |
| `--border` | #262626 | Bordures |
| `--border-strong` | #404040 | Bordures appuyées |
| `--marigold` | #f59e0b | Couleur sémantique (accent; dégradé de fond et sélection de texte) |
| `--mint` | #10b981 | Couleur sémantique (dégradé de fond) |
| `--grape` | #a855f7 | Couleur sémantique |
| `--sky` | #38bdf8 | Couleur sémantique |
| `--coral` | #fb7185 | Couleur sémantique |
| `--tangerine` | #fb923c | Couleur sémantique |
| `--berry` | #ef4444 | Couleur sémantique |

Rôles précis (succès, erreur, avertissement) par couleur sémantique : À définir (non trouvé dans le code).

## 03 Typography

<!-- Source : src/app/globals.css (@import Google Fonts, --font-*), src/app/layout.tsx -->

| Rôle | Variable | Police |
|---|---|---|
| Titres | `--font-display` | "Baloo 2" (400, 600, 700, 800), repli Nunito, system-ui |
| Texte | `--font-sans` | "Nunito" (400 à 800, italique 400), repli system-ui |
| Code, données | `--font-mono` | "JetBrains Mono" (400, 500, 700); classe `.oria-mono` |

Échelle de tailles de texte officielle : À définir (non trouvé dans le code).

## 04 Spacing

<!-- Source : classes Tailwind dans src/**/*.tsx -->

Pas de jetons d'espacement personnalisés : échelle Tailwind par défaut. Valeurs les plus utilisées : `gap-2`, `gap-3`, `gap-1.5`, `px-3`, `px-4`, `p-3`, `p-4`, `py-2`.

Règle d'espacement officielle : À définir (non trouvé dans le code).

## 05 Border Radius

<!-- Source : classes Tailwind dans src/**/*.tsx -->

Pas de jeton de rayon personnalisé. Usage observé : `rounded-lg` (le plus fréquent), `rounded-xl`, `rounded-2xl`, `rounded-full` (pastilles, avatars), plus rarement `rounded-3xl` et `rounded-md`. Quelques valeurs arbitraires (`rounded-[10px]`, `rounded-[13px]`, `rounded-[20px]`).

## 06 Components

<!-- Source : src/features/*/components, src/app/globals.css -->

- Pas de bibliothèque de composants partagée (`src/components` absent); les composants vivent par fonctionnalité dans `src/features/*/components` (ex. `cockpit-shell.tsx`, `command-palette.tsx`, `agent-card.tsx`, `command-tower.tsx`).
- Palette de commandes : cmdk (élément sélectionné : `rgba(255,255,255,.06)`).
- Glisser-déposer du cockpit : @dnd-kit (classes `.cockpit-widget-wrapper`, `.cockpit-drag-handle`).
- Ombre de carte : `--shadow-card` = `0 1px 2px rgba(0,0,0,.4), 0 10px 30px rgba(0,0,0,.35)`.
- Courbe d'animation : `--ease` = `cubic-bezier(.4,0,.2,1)`. Animations : `oria-pulse`, `oria-breathe`, `oria-fadein` (classe `.oria-fadein`, 0.35 s), `oria-spin`.
- Avatars d'agents Billy Bouton : À définir (non trouvé dans le code).

## 07 Icons

<!-- Source : package.json -->

lucide-react 1.14.0 (utilisé dans une centaine de fichiers de `src`).

## 08 Breakpoints

<!-- Source : Tailwind 4.3.0 par défaut, src/app/globals.css -->

- Préfixes Tailwind par défaut utilisés : `sm`, `md`, `lg`, `xl` (aucun breakpoint personnalisé déclaré).
- Requêtes média du cockpit dans `globals.css` : `max-width: 980px` (mise en page en colonne) et `max-width: 720px` (grille de widgets sur une colonne).

## Rules

- Utiliser les variables CSS de `src/app/globals.css`; ne pas coder de nouvelle couleur en dur.
- Ne jamais inventer une valeur : si elle manque, l'ajouter d'abord au code, puis à ce document.
- Chaque ajout visuel doit aider à comprendre ou à agir.
- Les animations en boucle (`oria-pulse`, `oria-breathe`, `oria-spin`) ne s'affichent que si elles sont liées à un état réel (exemple existant : `oria-pulse` seulement quand `connected` est vrai dans `cockpit-interactive.tsx`). Un agent en attente, bloqué ou en pause reste statique avec un libellé explicite.
- Aucune animation ne doit faire croire qu'un agent travaille quand il attend; la progression reflète les actions réelles.
- Rester sur le thème sombre existant et l'icônerie lucide-react.
