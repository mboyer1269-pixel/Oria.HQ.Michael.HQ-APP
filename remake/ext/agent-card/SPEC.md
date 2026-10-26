# Fiche agent standard — SPEC (Oria Design)

Statut : proposition de design, maquette statique. Rien n'est branché.
Inspiration : structure des fiches de [agency-agents](https://github.com/msitarzewski/agency-agents)
(MIT, commit `b37b5bb`). Voir `THIRD_PARTY_NOTICES` pour la notice de copyright exacte.

## 1. Schéma retenu

| Bloc | Champ fiche | Champ réel du code Oria (origin/main) | État |
|---|---|---|---|
| Identité | `name` | `AgentProfile.name` (`src/core/types.ts:554`) | existe |
| Identité | `role` | `AgentProfile.role: AgentRoleId` (`src/core/types.ts:538`) | existe |
| Identité | `tagline` (accroche 1 ligne) | `AgentProfile.tagline` | existe |
| Identité | `description` | `AgentProfile.description` | existe |
| **Mission** | `mission` (1 phrase de résultat) | `AgentCharter.mission` (`src/features/agents/agent-charter.ts`) | existe |
| **Méthode** | `principles[]` | `AgentCharter.dna.operatingPrinciples` | existe |
| **Méthode** | `workflows[]` : déclencheur → entrées → sorties → validation → suite | `AgentCharter.workflows[]` (`AgentWorkflowDef`: trigger, inputs, outputs, validation, nextAction) | existe |
| **Livrables** | `deliverables[]` | dérivé de `AgentWorkflowDef.outputs` (aucun champ dédié) | à brancher |
| **Livrables** | critères de réussite / KPI | `AgentCharter.successCriteria`, `AgentCharter.kpis` | existe |
| Garde-fous | interdits | `AgentProfile.constraints` | existe |
| Garde-fous | escalade | `AgentCharter.escalation` | existe |
| Capacités | compétences | `AgentProfile.skillIds` (catalogue Skills) | existe |
| Capacités | autonomie | `AgentProfile.autonomyLevel` | existe |
| Capacités | ventures | `AgentProfile.ventures: AgentVenture[]` | existe |
| Cadence | revue humaine | `AgentProfile.reviewCadence` | existe |
| Statut | `status` | `AgentStatus` existe en type, **mais aucune table ni API de création** | lu en base, à brancher |

Garde-fous et capacités sont retenus car le code les porte déjà (`constraints`,
`escalation`, `skillIds`, `autonomyLevel`) : ils ne sont pas inventés.

### Ce qui n'existe PAS dans le code (à brancher)
- Aucun écran ni route de **création** d'agent sur `origin/main` ; le registre est
  un seed statique (`src/features/agents/seed.ts`, `charter-seed.ts`).
- Aucune table Supabase d'agents trouvée (`git grep` sur `supabase/`) : la
  persistance de la fiche est à brancher.
- `deliverables` dédié, `vibe` (accroche de personnalité) et `color/emoji` : pas
  de champ Oria → non repris, sauf `deliverables` marqué « à brancher ».
- Deux contrats `AgentProfile` coexistent (`src/core/types.ts` et
  `src/server/agents/agent-profile-contract.ts`, ce dernier avec
  `allowedActions/forbiddenActions/approvalGates`). La maquette suit
  `src/core/types.ts` + `AgentCharter` ; l'arbitrage est à faire.

### Règle de statut (obligatoire)
Aucun statut d'agent n'est écrit en dur. Ne pas reproduire le motif de
`src/app/hq/page.tsx:166-172` (« Joris branché au contexte actif » codé en dur).
La fiche affiche uniquement : **vide**, **erreur**, **non branché**. L'état réel
(`active / standby / locked / planned`) est étiqueté « lu en base, à brancher ».

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

## 4. Accessibilité (WCAG 2.2 AA)
Labels explicites, focus visible (2.4.7 / 2.4.11), cibles ≥ 24 px (2.5.8),
contraste des tokens war-room vérifié par axe, résumé d'erreurs focalisé,
aucune information portée par la couleur seule (texte d'état).

## 5. Tokens
Repris de `remake/ext/war-room/index.html` (branche `design/war-room`) :
`--bg #0c0e12`, `--p1 #13161c`, `--p2 #1a1e26`, `--line #2c323d`, `--tx #eceef1`,
`--mu #aab1bc`, `--ok #5fd39a`, `--er #ff8a8a`, `--wa #ffb86b`, `--blue #3d8bff`, `--r 14px`.

## 6. Attribution
Structure inspirée de agency-agents, © 2025 AgentLand Contributors, licence MIT.
Aucun contenu d'agent copié. Notice complète : `THIRD_PARTY_NOTICES`.
