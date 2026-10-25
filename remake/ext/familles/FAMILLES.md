# Familles d'avatars Oria (design/remake-v3-billy)

Trois familles, mêmes 7 états, même correspondance événement → état (INTEGRATION.md §9). Toutes les données des maquettes sont « exemple ».

| Famille | Fichier | Variantes | Usage conseillé | Justification |
|---|---|---|---|---|
| Billy Boutons | `billy.py` | ori, nexus, nova, scout, pulse, aegis (couleur + accessoire par rôle) | chat, Orbite, onboarding | Demande de Michael ; dessin vectoriel original inspiré de ses 2 images de référence (aucun pixel copié). Chaleureux, rôle lisible d'un coup d'œil. |
| Astrolabe | `../astre.py` (réutilisé) | déterministe sha256(id\|rôle) | signature de marque, abstrait | Existant, cohérent partout pour un même agent. |
| Glyphe | `glyphe.py` | signal, azur, ambre, lilas, corail | listes denses, mobile, ≤ 32 px | Piste originale sobre : monogramme lisible dès 24 px, très peu de mouvement, coût de rendu minimal, non figuratif. |

## États (rendu par famille)
- repos : Billy respire (4 s) · Astrolabe noyau atténué · Glyphe tuile atténuée
- écoute : ondes autour du casque + tête inclinée · coque qui ondule · égaliseur 4 barres
- réflexion : yeux qui cherchent + 2 particules en orbite · courants internes · 3 points
- exécution : bras qui travaille + anneau segmenté (1 segment = 1 étape terminée, avance seulement sur `ledger.append`) · facettes · barre segmentée
- bloqué : anneau ambre pointillé, pulsation 4 s, badge ‖
- terminé (étape/mission) : saut unique + badge ✓ · cristallisation · « settle »
- erreur : anneau rouge, secousse unique 0,5 s, yeux en X, badge !
Cycles ≥ 1,6 s ; `prefers-reduced-motion: reduce` → tout immobile, pose/anneau/badge restent ; état dans `aria-label` + texte.

## Modèle de données : agent → famille + variante
```ts
type AvatarFamille = 'billy' | 'astrolabe' | 'glyphe';
interface AgentAvatar {            // table agent_avatar (à construire)
  agentId: string;                 // PK, FK agents.id
  famille: AvatarFamille;
  variante: string;                // billy: ori|nexus|nova|scout|pulse|aegis ; glyphe: signal|azur|ambre|lilas|corail ; astrolabe: ignorée (déterministe)
  updatedBy: string; updatedAt: string;  // choix fait par l'équipe, audité
}
```
Défaut si absent : `{famille:'astrolabe'}`. L'état n'est jamais stocké : il vient de `useAgentState(agentId)` (§9). Maquette du sélecteur : `mockups/avatars-attribution.html` (localStorage `oria-avatars`, démonstration seulement).

Régénérer : `python3 remake/ext/familles/gen_familles.py`.
