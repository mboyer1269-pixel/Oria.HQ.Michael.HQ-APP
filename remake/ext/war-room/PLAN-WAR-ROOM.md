# PLAN WAR ROOM — Oria HQ (design/war-room)

Maquette interactive : `remake/ext/war-room/index.html` (statique, ouvrable en file://). Données de démo étiquetées « exemple ». Aucune logique backend modifiée. Sources backend : `SOURCES.md`.

## Sources consultées (recherche)
- Devin — chat + Workspace (Shell, IDE, Browser), Progress : https://docs.devin.ai/work-with-devin/devin-session-tools · https://docs.devin.ai/get-started/devin-intro · Plan mode → Implement : https://docs.devin.ai/desktop/cascade/modes · retour d'usage : https://thegroundtruth.media/p/devin-first-impressions
- OpenHands — tiroir à onglets Planner/Changes/Code/Terminal/Browser : https://github.com/OpenHands/OpenHands/blob/11d4ecf2/frontend/src/components/features/conversation/conversation-tabs/conversation-tabs.tsx · https://docs.openhands.dev/openhands/usage/key-features
- Replit Agent — plan à valider, checkpoints/rollback : https://docs.replit.com/learn/build-with-agent · https://docs.replit.com/features/version-control/checkpoints-and-rollbacks
- v0 — Preview / Console / Code : https://v0.app/docs/sandbox · Bolt (comparatif) : https://vitara.ai/bolt-new-vs-replit/
- Cursor Cloud Agents (VM, PR) : https://cursor.com/docs/cloud-agent · ChatGPT Projets/historique : https://help.openai.com/en/articles/10169521-chatgpt-projects
- Riso : surimpression multiply, grain papier feTurbulence, décalage de repérage : https://codefronts.com/design-styles/css-grain-texture/risograph-print-misregistration-texture/ · https://text-effects.colorion.co/effects/risograph-text-effect/ · motion pas-à-pas steps() : https://tugrawork-creator.github.io/saas-motion-kit/themes/032-risograph-two-drum-print.html
- Split view / onglets : https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ · HIG split views (compact = une colonne) : https://zenreader.doublememory.com/hig/split-views/ · https://uxpatterns.dev/patterns/navigation/tabs

## D4 — Dashboard Conversation + Work (priorité 1)
Options : A) 3 colonnes historique | Conversation | Work (web), bascule segmentée + tiroir historique (mobile) ; B) Work en panneau repliable à droite façon Devin ; C) onglets partout.
Retenue : **A**. Les deux espaces vivent côte à côte (Devin, OpenHands), l'historique façon ChatGPT reste à gauche ; en 390 la HIG recommande une colonne → bascule Conversation/Work à aria-pressed + tiroir. Pont « → Envoyer à Work » transforme une idée en mission.
Critères : 1440 trois colonnes ; 390 bascule + tiroir (Échap ferme) ; chaque bouton répond ; axe 0.

## D3 — Atelier façon Devin (priorité 2)
Options : A) plan à gauche + espace à onglets (Journal/Fichiers/Aperçu/PR) ; B) chronologie unique ; C) IDE complet.
Retenue : **A** (Devin/OpenHands/v0), faisable en statique, onglets APG. Validations humaines ◆ bloquantes, PR brouillon, fusion jamais automatique.
Critères : workflow plan → 3 étapes → fichiers/diff → aperçu testable → PR → approbation = « Terminé — en attente de fusion manuelle » (testé).

## D1 — Figurines principales, riso = clin d'œil
Options : A) avatars Figurine partout + tampon riso ponctuel ; B) riso en avatar alternatif ; C) riso en fond.
Retenue : **A**. Figurines (Billy Boutons) dans Work, Atelier, Missions. Riso jamais en avatar.

## D2 — Papier riso
Options : A) SVG 2 plaques multiply + grain feTurbulence + bord découpé feDisplacementMap, entrée steps(12) 1,9 s ; B) sprites PNG ; C) WebGL.
Retenue : **A** (léger, accessible, animable). Symboles : deux triangles = commit de code ; couronne = Ronny répartit une mission ; tampon = validation humaine. Déclenchés uniquement par ces événements, journalisés ; mouvement réduit = fixe + fondu.

## Écrans ajoutés (consigne du boss)
1. Approbation au payload exact : 4 gabarits (fusion, déploiement, dépense, suppression), empreinte SHA-256, expiration 10 min, double verrou PR #420, mode d'exécution sandbox_unavailable / approveUnsandboxed, diff depuis l'approbation, approbation qui tombe si le payload change, journal qui/quand/empreinte/canal, règles Sentinelle (voix vs écran). File transverse = « non instrumenté ».
2. Vie de mission : 7 états réels + waiting_approval / outcome_unknown marqués « proposé », « Inconnu » visuellement distinct (violet, « ? »), dernier signal, « résultat non vérifié », Arrêter → en cours / annulée / non confirmée. Bloc « Pendant ton absence » non branché.
3. Coûts : état vide « non instrumenté » par défaut, seul garde-fou réel « aucun appel d'API payante » ; gabarit exemple (Claude, Codex mesurés via PR #419 ; Cursor, Gemini non branchés), traceId cliquable, costMicroUsd non branché.

## Risques
- Maquette statique, pas encore des composants Next (CockpitShell, HqMetric) → portage nécessaire.
- PR #419/#420 non fusionnées ; table mission_events seulement proposée.
- Animations riso : vérifier les performances des filtres SVG sur mobile bas de gamme.

## Reste à faire
- Porter en composants React dans src/features (dashboard, atelier), brancher sur les vraies routes.
- Câbler mission_events, puis remplacer les « non instrumenté ».
- Test utilisateur lecteur d'écran (VoiceOver/NVDA) — non fait.
