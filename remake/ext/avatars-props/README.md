# Propositions d'avatars (round 6, exemple)

Page : `mockups/avatars-propositions.html` (générée par `python3 avatars-props/gen_props.py`).

## A. Améliorations de Billy Figurine (avant / après)
1. **Yeux fermés vectoriels** : paupière 1,9 × 1,6 × l'œil, ombrée, avec un cil en croissant SVG. Supprime le « = » et le contour résiduel (ORI, PULSE, AEGIS).
2. **Regard vers l'interlocuteur** : `window.oriaRelay(from,to)` sur l'événement réel `delegation.created`. Les conteneurs `[data-lock]` sont ignorés par la boucle de regard de `figurine.js`.
3. **Ombre de contact + rim light** dans la couleur de l'agent (`--a`), compatible mode marque.
4. **Réactions croisées** : sur `mission.completed`, les voisins tournent la tête et sautillent en cascade. Désactivé en mouvement réduit.

## B. Trois directions (`props.js`, SVG procédural, aucune image)
`<span class="av" data-dir="const|pix|pap" data-v="ori" data-st="executing" data-sz="48" data-k="3">`
- **Constellation vivante** : 8 étoiles → glyphe du rôle ; sous 40 px, version simplifiée.
- **Pixel 16 × 16** : sprite avec accessoire par rôle.
- **Papier riso** : deux encres décalées, grain (`#pgrain`, à définir une fois par page).

Couleur : `--agent` (par agent) ; `--brand` prend le dessus en mode marque. 7 états, de 24 à 512 px.
Animations : uniquement en `prefers-reduced-motion:no-preference` et hors `html.rm` ; mises en pause hors écran (`.off`). Elles ne démarrent que sur un changement d'état réel.

Preuves : `captures/propositions/` (planches 1440/390, `comparatif.png`, `demo-propositions.webm`, `axe.json`).
