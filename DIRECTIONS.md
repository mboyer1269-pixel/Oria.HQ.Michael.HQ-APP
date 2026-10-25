# Oria — 3 directions artistiques (maquettes statiques)

Maquettes : `design-directions/<direction>/{cockpit,fiche,conversation,atelier}.html` (générées par `design-directions/gen.py`). Captures : `design-captures/directions/<direction>/<écran>-<desktop|mobile>.png` (1440 / 390, `reducedMotion: reduce`). Données : personnes, entreprise « Atelier Boréal », objectifs et 3 missions = **exemple** (badge jaune visible). L'Atelier et la mission « Calculatrice de pourboire » utilisent les **vraies** données `docs/atelier-e1-d-evidence/mission.json` (branche `atelier/e1-d`, PR #412, contrat `atelier-mission/v1`), badge vert « réelle ». Heures converties en HAE (UTC−4). `modelProof` n'est pas présent dans le JSON brut : affiché comme dérivé (demandé = observé = `gpt-5.6-luna` sur toutes les étapes Codex).

Références étudiées (web, 2026-10-25) : Linear (refresh mars 2026 : navigation atténuée, bordures adoucies, thèmes générés en LCH à partir de base/accent/contraste), Raycast 2.0 (conventions natives, densité, palette ⌘K), Granola (refonte : vert systématisé, Quadrant + Melange, calme avec énergie). v0, Arc et Devin : pas relus en détail faute de temps — inspiration générale seulement (Devin : panneaux côte à côte agent/diff/aperçu).

Principes communs : animation **uniquement** si un verrou d'exécution est actif (`lock` non nul / statut `running`) — lignes en pointillés qui avancent, halo qui respire ; rien d'autre ne bouge ; `prefers-reduced-motion` ⇒ statique. Carte vivante = objectif au centre, membres autour, liens animés = travail réel en cours. Cibles ≥ 44 px, focus 3 px, barre d'onglets mobile.

## 1. Cartographe — « l'entreprise comme un territoire »
Concept : carnet de cartographe, papier chaud, courbes de niveau en filigrane, ombres portées sèches. La carte vivante est un relevé topographique ; les missions sont des itinéraires.
- Palette (sur papier #fbf7ef) : encre #1f1a14 16.2:1 · atténué #5a4f42 7.5:1 · accent terre cuite #b4441f 5.2:1 (bouton blanc sur accent 5.5:1) · ok #2f6b3a 6.0:1 · alerte #8a5a00 5.5:1 · erreur #a3261b 6.9:1.
- Typo : Fraunces (titres, OFL), IBM Plex Sans / Plex Mono (OFL).
- Pour : clair, rassurant, très lisible, unique dans l'univers des outils d'agents (tous sombres). Risques : thème clair d'abord (un sombre « carte de nuit » à concevoir), texture à garder discrète en densité élevée.

## 2. Signal — « une salle de contrôle honnête »
Concept : instrument de mesure : noir profond, grille millimétrée, phosphore vert, mono majuscule. La carte vivante est un radar : chaque membre est un point, le balayage n'existe que si un run est vivant.
- Palette (sur #0e1213) : texte #e8f3ec 16.6:1 · atténué #9fb4a8 8.6:1 · accent phosphore #4dff9a 14.4:1 (texte bouton #03140a 14.5:1) · alerte #ffb340 10.6:1 · erreur #ff6b5e 6.7:1.
- Typo : JetBrains Mono (OFL), Space Grotesk (OFL).
- Pour : traduit parfaitement « preuve, statut, runtime » ; très dense, idéal pour l'Atelier. Risques : peut sembler technique/froid pour l'usage perso ; majuscules mono fatigantes en texte long (limitées aux titres).

## 3. Verrière — « une serre de verre où l'équipe pousse »
Concept : verre dépoli sur aurores violet/sarcelle, grande serif italique, cartes arrondies flottantes. La carte vivante est une orbite : membres en ellipses autour de l'objectif.
- Palette (sur verre ≈ #1a1c2e, estimé) : texte #f4f2ff 15.2:1 · atténué #c3c0e0 9.6:1 · accent sarcelle #9cf2e0 13.0:1 (texte bouton #06201b 13.2:1) · ok #8ff0b5 12.2:1 · alerte #ffd27a 11.8:1 · erreur #ff9ba8 8.4:1.
- Typo : Instrument Serif (OFL), Bricolage Grotesque (OFL), Geist Mono (OFL).
- Pour : la plus « audacieuse » et chaleureuse, mémorable, bonne pour la fiche entreprise. Risques : `backdrop-filter` coûteux sur mobile ; contraste à revérifier sur chaque zone du dégradé (axe ne peut pas toujours calculer sur fond dégradé/flou) ; risque de « belle capture » au détriment de la densité.

## Accessibilité — résultats
axe-core 4 (`@axe-core/playwright`, tags wcag2a/2aa/21aa/22aa) sur les 24 combinaisons (3 directions × 4 écrans × desktop/mobile) : **0 violation** (`design-captures/directions/axe.json`). Limites : axe ne remplace pas un test lecteur d'écran/clavier manuel ; les ratios Verrière sont calculés sur une couleur de fond estimée ; les polices proviennent de Google Fonts (réseau requis).

## Recommandation
Signal pour l'Atelier et les missions (preuves), avec la chaleur et la lisibilité de Cartographe pour la fiche et le mode clair : à trancher par le boss après revue des captures.
