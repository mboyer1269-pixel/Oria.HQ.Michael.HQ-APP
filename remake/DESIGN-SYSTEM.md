# Système de design — Oria v3 « Pont »

Deux modes, une seule grammaire :
- **Pont** (sombre, opérations ; hérité de *Signal*) : Pont, Attention, Conversations, Missions, Équipe, Atelier, Connexions.
- **Carte** (clair et chaud ; hérité de *Cartographe*) : Fiche vivante de l'entreprise, documents, et aussi un thème clair complet au choix de l'utilisateur.

Les zones, composants et raccourcis sont identiques dans les deux modes : seuls les tokens changent (`[data-mode="carte"]`).

## 1. Tokens

### Couleur — Pont (sombre)
Fond de référence : `--bg #07090a`. Contraste calculé selon WCAG 2.x (luminance relative).
| Token | Valeur | Usage | Contraste sur bg | sur `--panel #0e1213` |
|---|---|---|---|---|
| `--ink` | #e8f3ec | texte | 16.6:1 | 15.9:1 |
| `--soft` | #9fb4a8 | texte secondaire | 8.6:1 | 8.2:1 |
| `--line` | #1f2a26 | bordures (non textuelles, décoratives) | — | — |
| `--accent` | #4dff9a | action principale, activité réelle | 14.4:1 | 13.8:1 |
| `--on-accent` | #03140a | texte sur accent | 14.5:1 sur accent | |
| `--warn` | #ffb340 | décision / attention | 10.6:1 | 10.1:1 |
| `--bad` | #ff6b5e | échec / bloqué | 6.7:1 | 6.4:1 |
| `--info` | #7cc4ff | information | 10.0:1 | 9.6:1 |
Règle : texte courant ≥ 7:1 (objectif interne, NASA F.5.10) ; tout texte ≥ 4.5:1 (AA). `--bad` (6.7:1) n'est utilisé que pour des libellés courts, toujours accompagnés d'une icône.

### Couleur — Carte (clair)
| Token | Valeur | Contraste sur #fbf7ef |
|---|---|---|
| `--ink` | #1f1a14 | 16.2:1 |
| `--soft` | #5a4f42 | 7.5:1 |
| `--accent` | #b4441f | 5.2:1 (blanc sur accent 5.5:1) |
| `--ok` | #2f6b3a | 6.0:1 |
| `--warn` | #8a5a00 | 5.5:1 |
| `--bad` | #a3261b | 6.9:1 |

### Provenance (identique dans les deux modes)
| Badge | Fond / texte | Contraste | Sens |
|---|---|---|---|
| **réelle** | #d9f5e3 / #0b3a1d | 12.6:1 | donnée lue depuis une source vérifiable (fichier, API, commit) |
| **exemple** | #ffe9a8 / #3a2a00 | 11.6:1 | donnée fictive de maquette — jamais affichée en production |
| **non confirmé** | #e6e6e6 / #2b2b2b | 12.1:1 | modèle/fait demandé mais sans preuve observée |
| **périmée** | #f1dccf / #4a1d06 | 11.0:1 | donnée datée au-delà du seuil (ex. dernier test > 24 h) |
Forme : pilule 20px, majuscule initiale, icône (●, ◆, ?, ⟳) + mot, jamais la couleur seule. Survol/focus → info-bulle « Source : … · lu à 09 h 07 HAE ».

### Typographie
- Pont : **Space Grotesk** (titres, UI) + **JetBrains Mono** (chiffres, ID, horodatages — NASA F.5.1 chasse fixe pour données). Mono : 0/O et 1/l distincts.
- Carte : **Fraunces** (titres) + **IBM Plex Sans** (texte) + **IBM Plex Mono**.
- Échelle (rem, base 16px) : 0.75 (min. absolu, libellés) · 0.875 · 1 · 1.125 · 1.375 · 1.75 · 2.5 (titre Pont). Interligne 1.45 texte, 1.15 titres. Jamais < 12px.

### Espacement et grille
Base 4px : 4 · 8 · 12 · 16 · 24 · 32 · 48. Zones : bande d'état 48px, rail 72px, tiroir 400px, contenu fluide max 960px. Rayons : 6 (contrôles), 10 (cartes), 999 (badges). Cibles tactiles ≥ 44×44 en mobile (≥ 24×24 WCAG 2.5.8 partout).

## 2. Mouvement
Règle unique : **le mouvement signifie qu'une exécution réelle est en cours**.
- `pulse-run` : point d'activité 8px, opacité 1→0.4, 1.6 s, uniquement sur un runner dont le verrou (`lock`) est actif.
- `trace` : ligne de progression de la frise d'atelier, avance uniquement à la réception d'un événement d'étape.
- Transitions UI (tiroir, palette) : 120 ms opacité/translation 8px, **sans** rebond.
- `prefers-reduced-motion: reduce` → toutes les animations désactivées ; l'état « En cours » reste lisible par texte + icône.
- Aucun clignotement (NASA F.5.11 le réserve à l'urgence ; Oria n'en a pas besoin).

## 3. Composants
| Composant | Description | Clavier |
|---|---|---|
| **Bande d'état** | contexte ▾, titre, ⌘K, ⚑ n, heure HAE, runtime | `Ctrl+K`, `G A` |
| **Rail** | 7 destinations + Fiche + Réglages, libellé sous l'icône (pas d'icône seule) | `G P/A/C/M/E/T/X` |
| **Sélecteur de contexte** | liste des contextes, pastille + nom, ce qui change | `Ctrl+1…9` |
| **Carte Reprendre** | où vous étiez, étape, cause, « Reprendre ici », nouveautés depuis | `R` |
| **Carte d'attention** | type, contexte, action bloquée, cause, choix, depuis, provenance | `J/K`, `Entrée`, `H` |
| **Carte de mission** | résultat attendu, responsable, modèle demandé/observé, outils, budget, permissions, statut | — |
| **Frise d'atelier** | étapes, exécutant (Codex CLI / runner), durée, badge reprise, raison d'échec | `↑/↓` |
| **Preuve de modèle** | demandé · observé · verdict (concordant / non confirmé / divergent) | — |
| **Ligne de connexion** | compte, mode, capacités, quota (barre + %), dernier test, employés, expiration | — |
| **Fiche employé** | nom, avatar (initiales), poste, rôle, mandat, runtime, modèle ; droits séparés ; ID stable | — |
| **Palette ⌘K** | recherche floue, groupes, raccourci par ligne, actions refusées grisées avec raison | `Échap` |
| **Tiroir** | un seul niveau, titre + fermer | `Échap` |
| **Bouton** | primaire (accent), secondaire (contour), danger (contour rouge + confirmation) | — |

## 4. États (chaque liste en a 4)
| État | Rendu | Exemple |
|---|---|---|
| **Vide** | phrase + 1 action | « Aucune décision en attente. Le pont est calme. » |
| **Chargement** | squelettes statiques (pas d'animation shimmer — pas une exécution réelle) + « Chargement… » `aria-live` | — |
| **Erreur** | quoi / pourquoi / quoi faire (NASA F.4.3.3), bouton Réessayer | « Impossible de lire les missions : Supabase ne répond pas (délai 10 s). Réessayer · Voir le journal » |
| **Refusé** | action impossible + cause + choix (plan R4) | « Léa ne peut pas envoyer de courriel : accès Gmail non accordé. Accorder · Demander à Michael » |

## 5. Badge de provenance — règles
1. Toute valeur provenant de l'utilisateur ou d'un système porte, au niveau de la carte, un badge **réelle** ou **exemple**.
2. Le **modèle** affiché est l'observé ; si absent → **non confirmé** à côté du demandé ; si différent → alerte rouge « Modèle divergent : demandé X, observé Y ».
3. Une donnée plus vieille que son seuil → **périmée** + heure de lecture.
4. Les maquettes de ce dossier : toutes les données sont **exemple**, sauf l'atelier « Calculatrice de pourboire » (fichier `mission.json` réel de la branche `atelier/e1-d`), marqué **réelle**.
