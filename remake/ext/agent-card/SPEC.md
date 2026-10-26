# Fiche agent standard — SPEC (Oria Design)

Statut : proposition de design, maquette statique. Rien n'est branché.
Inspiration : structure des fiches de [agency-agents](https://github.com/msitarzewski/agency-agents)
(MIT, commit `b37b5bb`). Voir `THIRD_PARTY_NOTICES` pour la notice de copyright exacte.

## 1. Schéma retenu

**Source de vérité : `src/core/types.ts` (`AgentProfile`, l.554) fait foi.** Le garde
runtime l'importe (`src/server/runtime/execution-guard.ts:29`). Le contrat
`src/server/agents/agent-profile-contract.ts` est une dette (voir l'issue #436) et
la fiche ne s'appuie pas dessus.

Numéros de ligne vérifiés sur `origin/main` (2026-10-26).

| Bloc | Champ fiche | Champ réel du code Oria | État |
|---|---|---|---|
| Identité | `name` | `AgentProfile.name` (`src/core/types.ts:556`) | existe |
| Identité | `role` | `AgentProfile.role: AgentRoleId` (`types.ts:559`). 10 valeurs (`types.ts:538-548`), dont `closer` (`:547`) | existe |
| Identité | `tagline` | `AgentProfile.tagline` (`types.ts:560`) | existe |
| Identité | `description` | `AgentProfile.description` (`types.ts:561`) | existe |
| **Mission** | `mission` | `AgentCharter.mission` (`src/features/agents/agent-charter.ts:59`) | existe |
| **Méthode** | `principles[]` | `AgentCharter.dna.operatingPrinciples` (`agent-charter.ts:64`) | existe |
| **Méthode** | `workflows[]` | `AgentCharter.workflows` (`agent-charter.ts:70`), type `AgentWorkflowDef` (`:29`) : `trigger` :34, `inputs` :37, `outputs` :39, `validation` :41, `nextAction` :43 | existe |
| **Livrables** | `deliverables[]` | dérivé de `AgentWorkflowDef.outputs` (`agent-charter.ts:39`) ; aucun champ dédié | à brancher |
| **Livrables** | critères / KPI | `successCriteria` (`agent-charter.ts:72`), `kpis` (`:73`) | existe |
| Garde-fous | interdits | `AgentProfile.constraints` (`types.ts:567`) | existe |
| Garde-fous | escalade | `AgentCharter.escalation` (`agent-charter.ts:75`) | existe |
| Capacités | compétences | `AgentProfile.skillIds` (`types.ts:565`) | existe |
| Capacités | autonomie | `AgentProfile.autonomyLevel` (`types.ts:563`), `AutonomyLevel = 0…5` (`types.ts:23`) | existe |
| Capacités | ventures | `AgentProfile.ventures` (`types.ts:569`), `AgentVenture` (`:552`) | existe |
| Cadence | revue humaine | `AgentProfile.reviewCadence` (`types.ts:571`) | existe |
| Statut | `status` | `AgentProfile.status` (`types.ts:562`), `AgentStatus` (`:532-536`). Aucune table ni API de création | lu en base, à brancher |

Garde-fous et capacités sont retenus parce que le code les porte déjà. Ils ne sont pas inventés.

### Ce qui n'existe PAS dans le code (à brancher)
- Aucun écran ni route de **création** d'agent sur `origin/main` : le registre est un
  seed statique (`src/features/agents/seed.ts`, `charter-seed.ts`).
- Aucune table Supabase d'agents trouvée : la persistance est à brancher.
- `deliverables` dédié : à brancher. `vibe`, `color` et `emoji` ne sont pas repris.

### Règle de statut (obligatoire)
Aucun statut d'agent n'est écrit en dur. Ne pas reproduire le motif de
`src/app/hq/page.tsx:170-173` (« Joris branché au contexte actif » codé en dur, l.172).
La fiche affiche uniquement : **vide**, **erreur**, **non branché**. L'état réel
(`active / standby / locked / planned`) est étiqueté « lu en base, à brancher ».
Dans `index.html`, ces libellés proviennent d'une constante unique, `AGENT_STATUS_DISPLAY`.

## 2. Correspondance avec agency-agents

Structure source : `CONTRIBUTING.md` § « Agent File Structure » et
`design/design-ui-designer.md`.

| agency-agents | Fiche Oria |
|---|---|
| frontmatter `name` | `name` |
| frontmatter `description` | `description` |
| frontmatter `vibe` | `tagline` (le plus proche) |
| frontmatter `color`, `emoji` | non repris (pas de champ Oria) |
| frontmatter `services` (name, url, tier) | non repris ; à rapprocher du catalogue Skills plus tard |
| `## 🧠 Your Identity & Memory` | `role` + `description` |
| `## 🎯 Your Core Mission` | **Mission** |
| `## 🚨 Critical Rules You Must Follow` | **Garde-fous** (`constraints`, `escalation`) |
| `## 📋 Your Technical Deliverables` | **Livrables** (à brancher) |
| `## 🔄 Your Workflow Process` | **Méthode** (`workflows[]`) |
| `## 🎯 Your Success Metrics` | `successCriteria` + `kpis` |
| `## 💭 Your Communication Style` | non repris |
| `## 🔄 Learning & Memory` | non repris (mémoire gérée ailleurs) |
| `## 🚀 Advanced Capabilities` | **Capacités** (`skillIds`, `autonomyLevel`) |

## 3. Validation du formulaire (maquette)
- Requis : nom, rôle, mission, au moins 1 étape de méthode, au moins 1 livrable,
  au moins 1 garde-fou. Erreurs listées en résumé (`role="alert"`) avec liens
  vers les champs, et `aria-invalid` + `aria-describedby` par champ.
- Mission : 1 phrase, ≤ 200 caractères.
- Une seule région `role="status"` `aria-live="polite"` (masquée visuellement) annonce le résultat de validation (« N erreur(s) » ou « Fiche valide »). L'aperçu n'est pas annoncé.
- Rôle : les 10 valeurs d'`AgentRoleId`. Autonomie : 0 à 5 (`AutonomyLevel`).

## 4. Accessibilité (WCAG 2.2 AA)
Labels explicites, focus visible (2.4.7 / 2.4.11), cibles ≥ 24 px (2.5.8),
contraste des tokens war-room vérifié par axe (bordure des champs : `#646d7c`), résumé d'erreurs focalisé,
aucune information portée par la couleur seule (texte d'état).

## 5. Tokens
Repris de `remake/ext/war-room/index.html` (branche `design/war-room`) :
`--bg #0c0e12`, `--p1 #13161c`, `--p2 #1a1e26`, `--line #2c323d`, `--tx #eceef1`,
`--mu #aab1bc`, `--ok #5fd39a`, `--er #ff8a8a`, `--wa #ffb86b`, `--blue #3d8bff`, `--r 14px`.

## 6. Attribution
Structure inspirée de agency-agents, © 2025 AgentLand Contributors, licence MIT.
Aucun contenu d'agent copié. Notice complète : `THIRD_PARTY_NOTICES`.
