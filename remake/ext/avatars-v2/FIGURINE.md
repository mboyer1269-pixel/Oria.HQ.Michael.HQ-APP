# Billy Figurine — famille recommandée (décision + intégration)

> Statut : **recommandée** pour les avatars d'agents Oria. Données des maquettes = « exemple ».

## Décision
Les images de Michael (planche « Avatars IA — concept 01 » et affiche « Billy Bouton », droits détenus par Michael, source :
dossier Google Drive `1L5DXiDcQTjbXlXqMJw6Bibk0fkN1Hspj`) sont la **référence absolue**. On n'en redessine rien :
les pixels sont détourés localement, et toute la vie (états, couleur) est portée par des couches CSS/SVG légères.

## Fichiers (`figurine/`, WebP, 1,2 Mo au total)
| Fichier | Contenu | Taille |
|---|---|---|
| `<agent>-corps.webp` | corps entier (planche) | 520 px de haut, ~40–48 Ko |
| `<agent>-buste.webp` | buste (planche, bas fondu) | 360 px |
| `<agent>-tete.webp` | tête (planche, bas fondu) | 256 px |
| `<agent>-tete-64.webp` | tête pour 24/32/40 px | 64 px |
| `exp-<agent>-<nom>.webp` | 10 expressions de la rangée du bas de l'affiche | ≤ 240 px |
| `*.m.webp` | masque de recoloration (alpha = pixels saturés) | |
Agents : `ori, nexus, scout, nova, aegis, pulse`. Expressions : `ori-joie, ori-clin, nexus-focus, nova-pouce, scout-idee,
scout-jumelles, pulse-ecoute, pulse-pouce, aegis-garde, aegis-fier`.

Pipeline reproductible : `figurine-src/` (rembg local, modèles `isnet-anime` pour la planche ; `isnet-general-use`/`u2net`
selon l'expression pour l'affiche ; puis érosion 1 px + flou 0,6 px de l'alpha pour supprimer la frange, retrait des îlots,
export WebP q84). Sources attendues dans `/workspace/uploads/billy-{a,b}.png` (a = affiche, b = planche).

## Recoloration de l'image
Calque `.fg-tint` au-dessus de l'image : `background: var(--a)` + `mix-blend-mode: color` (+ `soft-light` 55 % pour garder
l'éclat), masqué par `<fichier>.m.webp`. Le masque ne garde que les pixels saturés (S > 0,22→0,5 et V > 0,10→0,28) :
néon du casque, accents de tenue, chaussures. Peau/visage blancs et noirs ont une saturation ~0 → **inchangés**.
`--a = var(--brand-accent, var(--agent-accent))` ; `--tint: 0|1` (0 = image originale). Testé : or `#ffcf70`,
turquoise `#19d3c5`, rose `#ff4fa3`, bleu `#3344aa`, sur les 6 agents.

⚠️ `mask-image` exige la même origine (CORS) : servir les fichiers en HTTP(S), pas en `file://` (sinon le calque est
invisible et l'image reste originale — dégradation sans casse).

## États (§9, événements réels uniquement)
| État | Couche |
|---|---|
| idle | respiration 3,2 s + flottement 4,8 s, halo néon 2,4 s |
| listening | ondes concentriques 2,4 s |
| thinking | orbite de 3 particules 2,8 s |
| executing | cadran Astrolabe à facettes : 1 facette = 1 étape terminée (`ledger.append`) |
| waiting | badge ambre ⏸ (pulse 2 s), halo ambre, image légèrement désaturée |
| done | éclat vert joué une fois (1,8 s) + badge ✓ |
| error | badge rouge !, halo rouge, secousse unique 1,6 s |
Toutes les boucles ≥ 1,6 s. `prefers-reduced-motion: reduce` (ou classe `.rm` sur `:root`) coupe toute animation ;
les couches statiques (cadran, badge, éclat) gardent l'état lisible. Les couleurs d'état ne sont jamais remplacées par la marque.
L'`alt` de chaque image dit : nom, pose, état, étape (« NEXUS, figurine Billy (corps entier) — état : exécute, étape 3 sur 5 »).

## Intégration React (proposition)
```tsx
type Famille = 'figurine' | 'hybride' | 'billy' | 'astrolabe' | 'glyphe';
type Pose = 'corps' | 'buste' | 'tete' | `exp-${string}`;
interface AgentAvatarProps { agentId: string; famille?: Famille; variante: AgentKey; pose?: Pose;
  couleur?: string /* hex, sinon couleur de l'agent */; size?: number; }

export function AgentAvatar({ agentId, famille = 'figurine', variante, pose = 'corps', couleur, size = 96 }: AgentAvatarProps) {
  const { state, step, total } = useAgentState(agentId);          // seule source d'état
  const small = size <= 40;
  const file = small ? `${variante}-tete-64` : pose.startsWith('exp-') ? pose : `${variante}-${pose}`;
  const tint = couleur && couleur !== DEFAULT_COLOR[variante] ? 1 : 0;  // mode marque : --brand-accent posé sur :root → tint 1
  return (
    <span className={`ov2 fg fg-${state}${small ? ' fg-sm' : ''}`}
      style={{ '--agent-accent': ensureAA(couleur ?? DEFAULT_COLOR[variante]), '--tint': tint, height: size } as CSSProperties}>
      <span className="fg-halo" aria-hidden />
      {state === 'executing' && <FacetDial done={step} total={total} />}
      {state === 'listening' && <Waves />}
      <span className="fg-body"><img src={`/avatars/figurine/${file}.webp`} height={size}
        alt={`${NAME[variante]}, figurine Billy — état : ${STATE_LABEL[state]}${state==='executing'?`, étape ${step} sur ${total}`:''}`} />
        <span className="fg-tint" aria-hidden style={{ maskImage: `url(/avatars/figurine/${file}.m.webp)` }} /></span>
      {state === 'thinking' && <Orbit />}{state === 'done' && <Burst />}
      {['waiting','error','done'].includes(state) && <StateBadge state={state} />}
    </span>);
}
```
CSS : reprendre `figurine.CSS` (+ `.ov2.fg svg{height:auto}`) tel quel. Préférences utilisateur :
`{ agents: { [agentId]: { famille, variante, pose, couleur } }, marque: { actif, couleur } }` (clé maquette `oria-avatars-v3`).
`ensureAA` = fonction `check()` de l'atelier (≥ 3:1 graphismes, ≥ 4,5:1 texte, éclaircissement auto).

## Limites honnêtes
- Les expressions de l'affiche viennent d'une image plus petite (~150 px de haut par personnage) : nettes jusqu'à ~120 px,
  pas au-delà. Le détourage de l'affiche (fond chargé) est bon mais moins parfait que celui de la planche (petits reliefs
  d'arrière-plan possibles près des accessoires, ex. ordinateur de SCOUT). « SCOUT casquette » a été écarté (détourage sale).
- Le halo d'origine autour des casques a été retiré par le détourage ; il est recréé en CSS (`.fg-halo`).
- Poses et expressions = variantes de présentation, non associées à des états (rien n'est inventé).
- Recoloration : sur une couleur très sombre, le néon devient terne (le mode « couleur » garde la luminance) ; le contrôle
  AA de l'atelier éclaircit automatiquement les couleurs trop sombres.
- `file://` : pas de recoloration (CORS des masques) — sans effet en production HTTP.
