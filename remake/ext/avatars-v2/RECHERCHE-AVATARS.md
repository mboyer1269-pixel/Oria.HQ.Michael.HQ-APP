# Avatars Oria v2 : recherche et principes

Branche `design/remake-v3-avatars-v2`. Maquettes : `mockups/avatars-v2-galerie.html` (galerie) et `mockups/avatars-v2.html` (atelier). Générateur : `avatars-v2/gen_v2.py`, rendu : `avatars-v2/hybride.py`.

## 1. Sources (consultées le 25 oct. 2026)
| Référence | Ce qu'on en retient | URL |
|---|---|---|
| Duolingo × Rive : personnages du monde | Une machine à états pilote poses, expressions et bouches à partir de données temporelles ; fichiers légers | https://blog.duolingo.com/world-character-visemes/ |
| Rive : Lily en appel vidéo IA | Le personnage écoute, traite et réagit ; gestes neutres modulaires combinés pour éviter les boucles répétitives ; tête et corps séparés | https://rive.app/blog/duolingo-s-ai-powered-video-call-brings-lily-to-life |
| Linear : Agent Interaction Guidelines | L'agent se présente comme agent, donne un retour instantané et montre clairement s'il réfléchit, attend, exécute ou a fini | https://linear.app/developers/aig |
| Fluent 2 : Avatar (Microsoft) | Badge de présence et « anneau d'activité » ; à 32 px et moins, l'icône du badge est difficile à percevoir, donc l'état doit aussi être donné en texte | https://fluent2.microsoft.design/components/web/react/core/avatar/usage |
| Material 3 : système de couleur (HCT) | Palettes tonales à partir d'une couleur source ; le contraste se règle par le ton ; niveaux de contraste standard, moyen et élevé | https://m3.material.io/styles/color/system/how-the-system-works |
| Material Color Utilities : `hct.ts` | Un écart de ton de 40 garantit ≥ 3:1, un écart de 50 garantit ≥ 4,5:1 | https://github.com/material-foundation/material-color-utilities/blob/main/typescript/hct/hct.ts |
| Headspace : système de marque (Liz Tran) | « Brand faces », palettes simples, métaphores ; police conçue avec des critères de contraste APCA | https://liztran.fyi/headspace:-brand-systems |
| Headspace : étude de cas (Raw.Studio) | Pas d'angles vifs, chaque détail est voulu, émotions abstraites rendues par des métaphores | https://raw.studio/blog/how-headspace-designs-for-mindfulness |
| Notion Faces (BUCK) | Système modulaire où l'expression et les accessoires priment sur la ressemblance | https://buck.co/work/notion-faces |
| Rob Giampietro (Notion) | « L'expression supplante l'abstraction » : on reconnaît quelqu'un à son accessoire signature | https://interfacecafe.com/notion-faces-rob-giampietro-on-scaling-a-human-centered-brand/ |
| Roman Muradov : visage de l'assistant Notion | Une forme distincte plus une référence familière ; la personnalité passe surtout par l'animation et les comportements | https://dadaissues.substack.com/p/new-characters |

Recherche « Billy Boutons / Billy Buttons » (rapport précédent) : aucune source ne décrit ce style. Le style vient uniquement des deux images de référence de Michael.

## 2. Principes appliqués
1. **Le visage dit comment, l'anneau dit quoi** (Linear, Fluent) : l'expression porte l'humeur (attentif, concentré, content, inquiet). L'anneau à facettes porte la vérité : une facette = une étape réellement terminée, sans interpolation.
2. **Machine à états, pas des clips** (Duolingo/Rive) : 7 états §9, chacun combinant sourcils, yeux, bouche, anneau et geste. Les pièces sont modulaires (tête, corps, accessoire), donc une même logique sert 6 personnages × 4 familles.
3. **Signature mémorable par accessoire** (Notion Faces) : couronne pour ORI, lunettes et `</>` pour NEXUS, clin d'œil et stylet pour NOVA, lunettes d'aviateur pour SCOUT, micro-casque pour PULSE, bouclier-cadenas pour AEGIS.
4. **Rondeur et chaleur** (Headspace) : aucun angle vif, joues rosées, reflets façon figurine.
5. **Lisible en petit** (Fluent) : sous 40 px, on n'affiche que la tête, l'anneau et le badge, et l'état est toujours écrit en texte à côté.
6. **La couleur est un token, le contraste est calculé** (Material) : `--agent-accent` par agent, `--brand-accent` pour la marque, et des couleurs d'état sémantiques qui ne sont jamais surchargées.

## 3. L'idée originale : le « casque-cadran »
Les mascottes du marché (Duolingo, Clyde) expriment des émotions ; les indicateurs d'activité (Fluent, Linear) expriment l'état. Oria fusionne les deux dans un seul objet : **le casque néon de Billy devient le cadran Astrolabe**. Le personnage reste attachant, mais ne peut pas mentir, puisque les facettes ne s'allument que sur `ledger.append` et que l'expression suit l'événement réel. En mode marque, toute l'équipe prend la couleur de l'organisation, mais l'ambre (bloqué), le rouge (erreur) et le vert (terminé) restent universels : on peut personnaliser la marque sans perdre la signification des états.

## 4. Familles
| Famille | Pour qui | Rendu des états |
|---|---|---|
| Hybride Billy × Astrolabe (recommandée) | grand public, chat, Orbite | facettes = étapes, cadran qui balaie pendant la réflexion, ondulation pendant l'écoute |
| Billy Boutons (pur, amélioré) | onboarding, marketing | néon continu et arc de progression extérieur |
| Astrolabe | marque abstraite | existant, recoloré par la même variable |
| Glyphe | listes denses, tableaux | monogramme et barre segmentée |

## 5. Couleur et contraste (code)
- CSS : `.ov2{--a:var(--brand-accent,var(--agent-accent))}`, avec `--sem` pour les états erreur, bloqué et terminé.
- Atelier : pour chaque couleur choisie, on calcule le ratio WCAG contre le fond des cartes (#0f1314, #161c1d) et la coque du casque (#050608). Si le ratio est < 3:1 (WCAG 1.4.11, graphismes), la couleur est éclaircie automatiquement et un message l'indique. Si le ratio est < 4,5:1 (WCAG 1.4.3, texte), le nom de l'agent utilise une teinte éclaircie séparée. Le texte des badges est toujours foncé sur une couleur sémantique claire (≥ 4,5:1).

## 6. Modèle de données (à construire côté app)
```ts
type Famille = 'hybride' | 'billy' | 'astrolabe' | 'glyphe';
interface AgentAvatar { agentId: string; famille: Famille; variante: 'ori'|'nexus'|'nova'|'scout'|'pulse'|'aegis'; couleur: `#${string}`; updatedBy: string; updatedAt: string }  // choisi par l'équipe
interface PreferenceMarque { scope: 'organisation' | 'utilisateur'; scopeId: string; actif: boolean; couleur: `#${string}`; familleParDefaut?: Famille; mouvementReduit?: boolean }
```
Résolution de la couleur affichée : utilisateur.marque (si active) > organisation.marque (si active) > `AgentAvatar.couleur` > couleur par défaut de la variante. Ensuite on applique la correction de contraste, et `--sem` l'emporte toujours. L'état n'est jamais stocké : il vient de `useAgentState(agentId)`. Dans la maquette, tout est simulé dans localStorage (`oria-avatars-v2`).
