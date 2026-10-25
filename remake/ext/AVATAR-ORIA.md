# Astrolabe — la signature avatar d'Oria

*Note pour Ronny · 25 oct. 2026 (HAE) · branche `design/remake-v3-ext` · agents et données des maquettes : « exemple »*

## Concept

Chaque agent est un **astre** : un **noyau lumineux** (accents phosphore du thème Signal) tenu dans une **coque de courbes de niveau** (le trait topographique du thème Cartographe), cerclé d'une **graduation d'astrolabe** et d'une **couronne de facettes**. Ce n'est ni un visage ni une bulle : c'est un instrument de navigation, ce qu'Oria est pour Michael.

## Parti pris

1. **Génératif et déterministe.** `sha256(id | rôle)` fixe le nombre de courbes, leurs harmoniques, l'orientation, la taille du noyau et le nombre de facettes au repos. La couleur vient du **rôle**, choisie parmi les jetons Signal. Même agent, même astre, sur chaque écran. Aucune image stockée n'est requise.
2. **L'état transforme la forme**, pas un simple anneau :
   - **idle :** statique ;
   - **listening :** la coque ondule comme une onde ;
   - **thinking :** des courants tournent dans le noyau ;
   - **executing :** une facette s'allume par étape **réellement terminée** et la facette en cours luit ;
   - **waiting :** pulsation sourde, contours pointillés ;
   - **done :** le noyau se **cristallise** une seule fois ;
   - **error :** le noyau se **fracture** et les contours virent au rouge.
3. **La personnalisation passe par un emblème, pas un remplacement.** Avec « chaton astronaute », un emblème vient s'inscrire dans le noyau. La coque, la couronne et les états restent ceux d'Oria, donc la marque tient même avec des choix fantaisistes.
4. **Sobriété technique.** Tout est en SVG + CSS. Les animations ne touchent que `transform` et `opacity`, il n'y a ni filtre animé ni WebGL. Les cycles durent au moins 1,8 s, donc moins d'un éclat par seconde (WCAG 2.3.1). Avec `prefers-reduced-motion: reduce`, tout est immobile, la forme de l'état reste lisible (facettes, cristal, fracture), et le texte d'état figure dans `aria-label` et dans un `role="status" aria-live="polite"` dans les en-têtes de fil.

## Pourquoi c'est propre à Oria

Le système réunit les deux thèmes du design system (Signal + Cartographe), la métaphore de l'Orbite et une progression lisible *en étapes*. Un pourcentage serait inventé ; une étape terminée, non. Les assistants grand public montrent qu'« il se passe quelque chose ». L'astre montre **quoi, et où en est l'agent**.

## États ↔ événements réels

Table complète : INTEGRATION.md §9. Résumé :

- **existe :** `running`, `needs_approval`, `completed`, `failed` (`src/server/missions/state-machine.ts`), `ledger.append` / `intent.upsert` / `error` (`src/features/hq/theatre/theatre-events.ts`, SSE `/api/hq/theatre/stream`), étapes `runner_died` ;
- **partiel :** thinking (requête `/api/joris/chat` en vol, sans flux d'état) ;
- **à construire :** listening (aucune entrée vocale).

## À construire

1. `src/features/agents/astre.tsx` : porter `remake/ext/astre.py` en composant React pur, sans dépendance.
2. Un hook `useAgentState(agentId)` qui réduit le SSE theatre et le flux chat aux 7 états, avec la progression `{terminées, total}`.
3. Une table `agents`, aujourd'hui `seed.ts`, avec un champ `emblem` (versionné, v1/v2) et un champ facultatif `seed_override`.
4. Un fournisseur d'image pour l'emblème : aucun n'est branché. En attendant, une bibliothèque d'emblèmes SVG.
5. Le micro : MediaRecorder côté client pour l'état listening.

## Références (sources consultées le 25 oct. 2026)

| Référence | Ce que ça fait | Ce qu'Oria fait autrement |
|---|---|---|
| **ChatGPT, mode vocal avancé** — sphère douce qui pulse avec l'amplitude ; teinte selon la phase ([Interface Lineage](https://interfacelineage.com/chatgpt-voice-mode-pulse), [60fps.design](https://60fps.design/shots/chatgpt-voice-blob-gradient-interaction)) | Un seul orbe identique pour tout le monde | Un astre **par agent**, calculé ; l'état est structurel (facettes, cristal, fracture), pas une teinte |
| **Siri** — onde arc-en-ciel (iOS 7), orbe visionOS, puis lueur de bord d'écran (iOS 18) ([Interface Lineage](https://interfacelineage.com/chatgpt-voice-mode-pulse), [Pocket-lint](https://www.pocket-lint.com/how-to-get-new-siri-look-glowing-border/)) | Signale « Siri est actif » à l'échelle de l'écran | Plusieurs agents simultanés, chacun localisé (fil, carte, orbite) |
| **Gemini Live** — forme d'onde dans une pilule pour la voix ([Android Authority](https://www.androidauthority.com/gemini-live-redesign-apk-teardown-3721755/)) | Onde séparée de l'identité | L'onde **est** la coque de l'agent qui écoute |
| **Meta Muse Realtime Avatar** — avatar expressif en temps réel depuis photo, illustration, animal ou objet ; filigrane Video Seal ([Meta AI Research](https://research.meta.ai/blog/bringing-your-muse-to-life), [Meta Connect 2026](https://www.meta.com/blog/meta-connect-2026-everything-we-announced/), [Engadget](https://www.engadget.com/2267223/meta-holograph-avatar-for-ai-and-vr-glasses-update-hands-on/)) | Incarnation réaliste, vidéo générée | Volontairement non figuratif : pas de visage, pas de vidéo, aucun risque d'usurpation ; l'image utilisateur n'est qu'un emblème dans un cadre de marque |
| **Replika / Character.AI / Pi** — 3D personnalisable (Replika), images de profil et AvatarFX (Character.AI), Pi sans avatar ([Best Companions AI](https://bestcompanionsai.com/features/avatar-customization/), [Genies](https://genies.com/blog/ai-avatars-vs-ai-chatbots-how-genies-character.ai-and-replika-compare)) | Compagnon émotionnel ; un avis rapporte que demander « cheveux bleus » ne changeait rien | Outil de travail : chaque changement d'avatar est réel, versionné et visible partout |
| **MIT Media Lab 2011** (TheGreenEyl, E Roon Kang) — algorithme, 40 000 logos × 12 couleurs, un par membre ([CAN](https://www.creativeapplications.net/project/mit-media-lab-identity-processing/), [E Roon Kang](https://eroonkang.com/feature/mit-media-lab-identity)) ; remplacé par Pentagram par un système de glyphes sur grille ([Pentagram](https://www.pentagram.com/work/mit-media-lab)) | Identité générative statique, choisie une fois | Même idée de « une marque, une forme par membre », mais **vivante** et pilotée par l'état réel |
| **Casa da Música** (Sagmeister, 2007) — 6 vues du bâtiment, 17 facettes colorées par échantillonnage d'image ([Cooper Hewitt](https://collection.cooperhewitt.org/objects/18794271/), [JPN](https://www.jpn.up.pt/2007/04/13/casa-da-musica-dois-anos-e-uma-nova-imagem/)) | Les facettes portent la couleur du contexte | Les facettes portent les **étapes accomplies** : information, pas décoration |
| **Lusion (KAOS), Active Theory** — logo génératif piloté par l'audio (WebAudio, GLSL) ; sites WebGL de particules ([Lusion](https://v2.lusion.co/work/kaos-logo-generator/), [Webby](https://www.webbyawards.com/crafted-with-code/active-theory/)) | Spectaculaire, mais GPU/WebGL lourd | Même sensation de vivant en SVG/CSS léger, sûr en liste de 50 avatars et sur mobile |

Non consultés directement : la documentation d'Inflection et le design system « vivant » d'un éditeur précis. Pi n'est cité que via un comparatif (source secondaire).

## Livrables

- `mockups/avatar-oria.html` : vitrine (4 agents × 7 états, génération déterministe, personnalisation).
- Intégré à chat, chat-avatar, code (cartes de tâche) et orbite (carte et liste), ainsi qu'à avatar-etats.
- Vidéos : `captures/video/astrolabe-1440.webm`, `captures/video/astrolabe-390.webm` (environ 26 s).
- Captures : `captures/*-1440.png`, `captures/*-390.png`, `captures/*-anim-*.png`. axe : voir INTEGRATION.md §10.
