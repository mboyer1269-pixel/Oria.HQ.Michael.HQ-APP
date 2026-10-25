# Oria HQ — Cockpit v2 : document de design (étape 1)

Statut : proposition, rien n'est implémenté dans `src/`. Sources : `/workspace/oria-lotC/factual-map.md` (carte factuelle, app `491a7a9`), section 7 du mandat, audit en lecture seule (`/workspace/repo`). Toute affirmation sur le code renvoie à un fichier ; le reste est une proposition.

## 1. Constat actuel (résumé)
- Stack : Next 16 / React 19 / Tailwind v4. 22 pages `src/app/**/page.tsx`.
- Navigation : 15 entrées plates dans `src/features/cockpit/components/cockpit-shell.tsx:47-61` (HQ, Cockpit, Missions, Mémoire, Agents, Workflows, Skills, Runtime, Infrastructure, Finance, Ventures, Send Desk, Sales Desk, Notes, Documents) — doublon HQ/Cockpit, pas de contexte actif.
- Tokens existants dans `src/app/globals.css` (`--ink-*`, `--fg*`, `--marigold`…, thème sombre uniquement) mais peu utilisés : `neutral-500/600` partout, `text-[10px]/[11px]` ~470 occurrences, hex en dur dans la barre latérale, accent violet vs ambre incohérent.
- A11y : contrastes faibles (neutral-500/600 sur fond sombre), `focus-visible` absent, `outline-none` sur le login, `animate-ping/pulse` sans `prefers-reduced-motion`, `maximumScale: 1` dans `src/app/layout.tsx` (bloque le zoom, échec WCAG 1.4.4).
- Existant réutilisable : palette cmdk `src/features/cockpit/components/command-palette.tsx`, `cockpit-shell.tsx`, `src/features/hq/components/hq-widget-system.tsx`, `owner-access-denied.tsx`, `founder-zero-state.tsx`, machine à états missions `src/server/missions/state-machine.ts`.

## 2. Architecture d'information / navigation
Une seule navigation, organisée autour du **contexte actif** :

```
[Sélecteur de contexte : Personnel · Projet · Entreprise]  (⌘K partout)
 ├─ Fiche          (fiche vivante du contexte — remplace HQ + Cockpit)
 ├─ Équipe         (/hq/agents réorienté : membres, nom/intitulé éditables, mandats, modèle réel)
 ├─ Conversations  (fil → propositions → « Valider en mission »)
 ├─ Missions       (/hq/missions : brouillons, approbations, suivi)
 ├─ Atelier        (/hq/atelier : résultat | aperçu | changements)
 ├─ Livrables      (provenance + résultat vérifié)
 └─ Connexions     (/hq/runtime + /hq/infrastructure + fournisseurs : test non destructif horodaté)
 Secondaire (menu « Plus » / palette) : Mémoire, Workflows, Skills, Finance, Ventures, Send Desk, Sales Desk, Notes, Documents
```
- Barre de contexte persistante : nom du contexte, type, **modèle réellement utilisé** (lu depuis `src/server/ai/model-router.ts`, sinon « non connecté »), état runtime.
- Contexte personnel : jamais d'entreprise artificielle affichée.
- Mobile : barre d'onglets basse (Fiche, Conversations, Missions, Livrables, Plus) + sélecteur de contexte en haut.
- Palette ⌘K (cmdk existant) : naviguer, changer de contexte, ajouter un employé, changer de modèle, lancer une tâche autorisée, reprendre une interruption. Les actions non autorisées apparaissent désactivées avec la raison.

## 3. Design system
Tokens sémantiques via `@theme` Tailwind v4 (les primitives `--ink-*` restent en couche basse) :

| Rôle | Sombre | Clair |
|---|---|---|
| `--bg` | #0e0f12 | #f7f6f2 |
| `--surface` / `--surface-2` | #16181d / #1d2027 | #ffffff / #efede6 |
| `--fg` / `--fg-muted` | #f2f1ec / #b4b2aa | #1b1c20 / #55565c |
| `--border` | #2c2f37 | #d9d6cc |
| `--accent` (unique, ambre) | #e8a33d | #9a5b00 |
| `--ok` `--warn` `--danger` `--info` | #3fbf8a #e8a33d #ef6b6b #6aa9ff | variantes assombries |

Contrastes à vérifier outil à l'appui (cible ≥ 4.5:1 texte, 3:1 UI) — valeurs à confirmer par axe/calcul avant adoption.
- Typo : échelle 12/14/16/20/28 px, **minimum 12 px** ; display conservé (Baloo 2) pour titres seulement, Nunito texte, JetBrains Mono pour ids/journaux.
- Rayons 6/10/16, espacement 4-pt, une ombre de carte.
- Mouvement : `--ease` existant ; durées 120/200 ms ; aucune animation décorative ; pulsation uniquement liée à un événement réel (run actif, message entrant) ; `prefers-reduced-motion` globalement respecté.
- Règle lint : interdire `text-[Npx]`, hex arbitraires et `neutral-*` hors tokens dans `src/features/**`.
- Thème : clair/sombre/système, attribut `data-theme` sur `<html>`.

## 4. Composants
Primitives : Button, IconButton, Field, Badge, Card, Tabs, Dialog, Sheet (mobile), Tooltip (existant), EmptyState, Skeleton, ErrorState, AccessDenied (dérivé de `owner-access-denied.tsx`).
Domaine unifiés : `ContextSwitcher`, `ActiveContextBar`, `TeamRoster` / `MemberCard` (nom, intitulé, contexte — configurables ; permissions affichées à part), `MissionCard`, `DecisionCard`, `DeliverableCard`, `ProposalCard` (dans conversation), `DiffPane`, `PreviewPane`, `RunActivity`, et **`DataProvenanceBadge`** (source : base / runtime / démo / non connecté) obligatoire sur toute donnée affichée.

## 5. Les trois patterns
1. **Fiche entreprise vivante** (Fiche) : objectif, équipe, décisions attendues, missions en cours, livrables récents dans un seul écran. Chaque bloc a un état vide honnête avec l'action suivante (« Définir l'objectif », « Ajouter un employé »). Remplace `/hq` + `/hq/cockpit` (stubs `cockpit-interactive.tsx:820-842`).
2. **Conversation → mission** : une proposition d'un membre porte « Valider en mission » ; la mission est créée via la machine à états existante (brouillon → approbation `0030_mission_approval_binding.sql`) en reprenant titre, objectif, responsable, contexte, lien retour vers le message. Aucune ressaisie. Prérequis backend : conversations persistantes (aujourd'hui mono-message `joris-dock.tsx:68`).
3. **Atelier inspectable** : trois colonnes Résultat | Aperçu | Changements (empilées en onglets sur mobile), action unique « Demander une correction » qui crée un tour de conversation lié à la mission. Prérequis : retour des artefacts par le runtime (absent aujourd'hui, cf. carte factuelle OpenHands).

Évaluation : comparer avec l'UI actuelle sur 4 tâches réelles (ajouter un employé, valider une proposition, comprendre un blocage, demander une correction) en comptant étapes/clics ; ne retenir que les patterns qui réduisent les étapes.

## 6. États
Appliqués là où ils ont du sens (pas tous partout) : première utilisation, vide, chargement (skeleton, pas de faux chiffres), activité réelle, intervention requise, erreur (message + action de reprise), accès refusé, succès **vérifié** (uniquement si preuve serveur). Interdit : afficher seeds/démo comme réels ; à défaut, badge « Démo » explicite.

## 7. Plan accessibilité (WCAG 2.2 AA)
- Retirer `maximumScale: 1` (`src/app/layout.tsx`) ; tester zoom 200 % et reflow 320 px.
- Anneau de focus global `:focus-visible` (2 px accent, offset 2) ; supprimer `outline-none` du login.
- Contrastes : remplacer neutral-500/600 par `--fg-muted` vérifié.
- Cibles ≥ 24×24 px (2.5.8), focus non masqué par barres collantes (2.4.11).
- Lien d'évitement, landmarks (`nav`, `main`), `aria-current` dans la nav, annonces `aria-live="polite"` pour l'activité de run.
- Palette ⌘K et tous les dialogues entièrement clavier (piège de focus + Échap).
- Reduced motion global. axe-core (Playwright) en CI sur les écrans clés ; limites documentées (tests manuels lecteur d'écran restent nécessaires).

## 8. Plan d'implémentation incrémental
1. Tokens `@theme` + thème clair + focus global + retrait `maximumScale` + reduced motion (aucun changement de logique).
2. Lint anti-valeurs arbitraires ; migration progressive des `text-[10/11px]` et `neutral-*`.
3. `ActiveContextBar` + `ContextSwitcher` (lecture seule tant que le résolveur workspace est mono-tenant, `workspace-context.ts:33`) ; nouvelle nav dans `cockpit-shell.tsx`, routes existantes conservées (redirections, aucune route API modifiée).
4. `DataProvenanceBadge` + EmptyState ; suppression/étiquetage des seeds visibles (liste §9).
5. Fiche vivante (fusion HQ/Cockpit) sur données réelles existantes.
6. Équipe : nom/intitulé éditables — dépend de la table employé (lot backend).
7. Conversation → mission — dépend des conversations persistantes.
8. Atelier inspectable — dépend du retour d'artefacts runtime.
9. axe en CI + captures Playwright de régression.

## 9. Valeurs figées / démo à retirer (chemins)
- Seeds UI : `src/features/hq/seed.ts` (modelProfiles, billionaireBoard, hqModules ; modèles `:85-127`), `src/features/agents/seed.ts:23` (Joris actif), `src/features/missions/seed.ts:3`, `workflow-run-seed.ts` + fallback `workflows-page-data.ts:85`, `ventures/suggestion-seed.ts`, `src/features/memory/seed.ts:187` (moneyboard mock), mock runtime, stubs `src/features/cockpit/components/cockpit-interactive.tsx:820-842`.
- Persona/propriétaire : Joris (`agent-council-run-contract.ts:28`, `daily-direction-generator.ts:62`, `src/config/workspaces/michael-hq.config.ts:19`), Michael (`charter-seed.ts:29`, `src/features/cockpit/components/cockpit-shell.tsx:145`, `founder-zero-state.tsx:177`, `loi96-profile.ts:100`), `local-michael` (`src/server/auth/user-context.ts:7`).
- Modèles : `src/server/ai/model-config.ts:15-21`, `skill-dispatcher.ts:184,206`, `openhands-launch-contract.ts:26,34,46`.
- Entreprises : Buckingham/Gatineau (`public-inventory-allowlist.ts:6,15`, `listing-packet.ts:128,159`, `follow-up-draft.ts:71`), Suivia (`contact-lead-repository.ts:87`, `contact-notification-service.ts:28`), `ORYA_VENTURES` (`llm-cash-action-packet-generator.ts:52`).
- Preuves fabriquées : `venture-council-cash-run-composer.ts:137` (`isVerified:true`) — ne jamais afficher comme succès vérifié.
- Bugs UI à corriger au passage : timer `agent-terminal-feed.tsx:49`, brouillons perdus `notes-workspace.tsx:80,88`, masquage secrets client seul `venture-asset-panel.tsx:38`.

## 10. Captures
`design-captures/current/` : état actuel local (`next dev`, sans Supabase/session) — seul `/login` (et `/`) est atteignable ; toutes les routes `/hq/*` redirigent vers `/login?next=…`. `design-captures/mock/` : maquettes HTML statiques (cockpit sombre/clair, atelier + conversation→mission), desktop 1440 et mobile 390, toutes en états vides honnêtes (aucune donnée inventée).
