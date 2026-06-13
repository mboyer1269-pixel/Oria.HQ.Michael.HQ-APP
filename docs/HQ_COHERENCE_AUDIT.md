# HQ Coherence Audit

> **But.** Recenser les incohérences de **vocabulaire** et de **contrats** présentes
> dans le code de Oria HQ, priorisées, comme référence de travail pour la
> consolidation. Ce document ne change aucun code applicatif — c'est un état des
> lieux pour décider quoi solidifier en premier.
>
> **Méthode.** Lecture directe du code (read-only), 2026-06-13, branche
> `feat/workflows-live-board`. Chaque constat cite le fichier source.
>
> **Portée.** Vocabulaire d'agents, couches « workflow / run », chaînes
> d'intégrité/lignée, statut réel des capacités, sprawl documentaire. Hors
> portée : refactors (aucun mandat), comportement runtime.

## Légende de sévérité

| Niveau | Sens |
|--------|------|
| 🔴 | **Référence/contrat cassé** — un identifiant ne résout vers rien, ou deux contrats se contredisent. |
| 🟠 | **Dérive / ambiguïté** — enums ou notions divergentes qui devraient être alignées ou explicitement reliées. |
| 🟡 | **Surcharge / présentation** — un même mot porte plusieurs sens, ou une capacité paraît plus active qu'elle ne l'est. |
| 🟢 | **Cohérent — à préserver** (listé pour ne pas casser par mégarde). |

## Synthèse priorisée

| # | Sévérité | Constat | Effet |
|---|----------|---------|-------|
| P1 | ✅ 🟢 | **RÉSOLU (2026-06-13)** — résolveur unique `councilRoleId → agent \| lentille synthétique` dans `naming.ts`, verrouillé par test | (était : « demandes entre agents » référençant des acteurs fantômes) |
| P2 | ✅ 🟢 | **RÉSOLU (2026-06-13)** — glossaire `docs/HQ_RUN_GLOSSARY.md` + phase canonique unique (`run-lifecycle-phase.ts`), sans renommer d'enum | (était : confusion « prévu vs délibéré vs exécuté » + dérive d'enums) |
| P3 | 🟠 | Deux « chaînes » distinctes regroupées sous « line chain » sans lien explicite | Intégrité d'audit ≠ lignée de savoir, mais traitées comme une seule |
| P4 | 🟡 | Capacités fortes mais **dormantes** présentées comme vivantes (council non câblé, hash-chain en shadow) | HQ peut sembler « plus actif qu'il ne l'est » |
| P5 | 🟡 | Sprawl des documents « source of truth / contract / plan » sans index | Difficile de savoir quel doc fait foi |
| P6 | 🟡 | Hygiène : `next-env.d.ts` est suivi par git (non ignoré) | Bruit de diff récurrent dans les commits/stashes |

---

## P1 — ✅ RÉSOLU (2026-06-13) — Vocabulaire d'agents fragmenté

> **Résolution.** `naming.ts` expose désormais un résolveur unique
> (`COUNCIL_ROLE_TO_AGENT`, `SYNTHETIC_COUNCIL_ROLES`,
> `resolveCouncilRoleToAgentId`, `getCouncilRoleDisplayName`). Chaque `roleId` de
> council est classé **agent-adossé XOR lentille synthétique** ; la couverture
> exacte contre `AGENT_COUNCIL_ROLE_IDS` est verrouillée par
> `naming-contract.test.mjs`. Matrice : `docs/AGENT_NAMING.md` § « Rôles de
> council ». Constat d'origine ci-dessous, conservé pour mémoire.

Trois vocabulaires coexistent pour désigner « qui sont mes agents », sans
résolveur commun.

**1. IDs du registre** (`src/features/agents/seed.ts`) — source de vérité, IDs immuables :

| ID registre | Nom d'affichage (naming v1) | Champ `role` |
|-------------|------------------------------|--------------|
| `joris`     | Joris   | `orchestrator` |
| `hermes`    | Relay   | `operator` |
| `orion`     | Radar   | `scout` |
| `sentinel`  | Sentinel| `auditor` |
| `scribe`    | Scribe  | `memory` |
| `finops`    | FinOps  | `money` |
| `builder`   | Forge   | `builder` |
| `closer`    | Closer  | `closer` |
| `marketing` | Studio  | `operator` |
| `inventor`  | Lab     | `scout` |

**2. roleIds du council** (`src/server/agents/agent-council-run-contract.ts`, lignes 45-54) :
`joris_orchestrator, t_gravity, hermes, orient, builder, scribe, closer, auditor, operator`.

**3. Noms d'affichage** résolus uniquement via `src/features/agents/naming.ts`,
qui ne connaît que deux alias : `joris_orchestrator → joris` et `agent_hermes → hermes`.

### Références cassées / non résolues

| roleId council | Résout vers un agent ? | Problème |
|----------------|------------------------|----------|
| `joris_orchestrator` | ✅ `joris` (alias présent) | OK |
| `hermes` | ✅ `hermes` (Relay) | OK |
| `builder` | ✅ `builder` (Forge) | OK |
| `scribe` | ✅ `scribe` | OK |
| `closer` | ✅ `closer` | OK |
| `orient` | ❌ | Aucun agent `orient`. Le registre a `orion` (Radar). Typo de `orion`, **ou** concept distinct (council = « buyer context / positioning » ; Radar = « scan marché »). À trancher. |
| `t_gravity` | ❌ | Aucun agent. Rôle « gravité économique / ROI » propre au council. Plus proche : `finops`. |
| `auditor` | ❌ (comme ID) | Même concept que `sentinel` (dont `role = "auditor"`), mais token différent. |
| `operator` | ❌ (comme ID) | Ambigu : `hermes` **et** `marketing` ont `role = "operator"`. Pas de 1:1. |

### Surcharge supplémentaire : `role` (catégorie) vs roleId

Le **champ `role`** du registre (`orchestrator, operator, scout, auditor, memory,
money, builder, closer`) puise dans le **même pool de mots** que les roleIds du
council (`auditor, operator, builder, closer`). Un même token (`auditor`) est donc
à la fois une *catégorie de registre* et un *roleId de council* — piège de
cohérence subtil mais réel.

### Acteurs absents du council

`finops`, `marketing`, `inventor` n'ont aucun rôle council ; `sentinel` n'y figure
que sous le token `auditor`.

### Direction recommandée (sans code pour l'instant)

1. Un **résolveur unique** `councilRoleId → registry agentId → displayName`,
   centralisé dans `naming.ts`, avec une table explicite `COUNCIL_ROLE_TO_AGENT`.
2. Déclarer explicitement les **rôles synthétiques** (fonctions de délibération,
   pas des agents : `t_gravity`, `auditor`-as-lens, `operator`-as-lens) pour
   qu'ils soient *intentionnels*, pas accidentels.
3. Trancher `orient` vs `orion` (alias ou renommage).

---

## P2 — ✅ RÉSOLU (2026-06-13) — « Run / workflow » surchargé sur 3 couches + dérive d'enums

> **Résolution.** Glossaire des couches (`docs/HQ_RUN_GLOSSARY.md`) + une phase
> canonique unique (`not_started · in_progress · waiting · blocked · done ·
> failed · cancelled`) sur laquelle TOUS les enums de statut mappent, via
> `src/features/workflows/run-lifecycle-phase.ts`. Aucun token d'enum renommé
> (plusieurs sont persistés) : l'alignement vit à la couche affichage. Couverture
> exhaustive garantie au typecheck (`Record<Union, Phase>`) + verrouillée par
> `run-lifecycle-phase.test.mjs`. Constat d'origine ci-dessous, conservé.

Trois notions partagent le vocabulaire « workflow / run » :

| Couche | Fichier | Sens | Statuts |
|--------|---------|------|---------|
| **Définition** (`AgentWorkflowDef`) | `src/features/agents/agent-charter.ts` | ce qu'un workflow *devrait faire* | — |
| **Exécution** (`WorkflowRun`) | `src/features/workflows/workflow-run.ts` (l.27) | ce qui *a été fait*, dérivé du ledger | `queued / running / completed / failed / blocked` |
| **Délibération** (`AgentCouncilRun`) | `src/server/agents/agent-council-run-contract.ts` (l.36-43) | ce qu'on *en pense* (proposal-only) | `draft / running / waiting_for_agent / ready_for_ceo / blocked / completed / failed` |

### Dérive d'enums constatée

- **État « pas encore démarré »** : `WorkflowRun` utilise `queued` ; `AgentCouncilRun`
  utilise `draft`. Même sémantique, token différent.
- **Statuts d'étape** : `WorkflowStepStatus` = `pending / active / done / failed /
  skipped` (l.24) ; `AgentCouncilTurnStatus` = `pending / completed / failed /
  skipped`. → `done` (step) vs `completed` (turn), et le step a `active` que le
  turn n'a pas.

### Point cohérent à préserver

`workflow-run.ts` **dérive** ses étapes directement de `AgentWorkflowDef` (les 5
étapes canoniques `trigger → inputs → output → validation → next` mappent 1:1 sur
les champs de la charte). Le lien **Définition → Exécution est donc déjà
cohérent** ; la surcharge concerne surtout la **Délibération** (council), isolée
des deux autres.

### Direction recommandée

1. Nommer les trois couches sans ambiguïté (Definition / Execution-run /
   Deliberation-run) dans un seul glossaire.
2. Soit unifier les tokens d'état partagés (`queued`≡`draft`, `done`≡`completed`),
   soit documenter la table de correspondance dans un seul endroit.
3. Câbler la couche Délibération aux deux autres (cf. boucle canonique, P4).

---

## P3 — 🟠 Deux « chaînes » sous le terme « line chain »

| Chaîne | Fichiers | Rôle | État |
|--------|----------|------|------|
| **Ledger integrity chain** | `src/server/ledger/hash-chain-*` | Preuve qu'aucune action n'a été altérée (`prev_hash` genesis `null`, `entry_hash` recalculé, HMAC optionnel, fail-closed — `hash-chain-verifier.ts`) | **Code prêt, écriture OFF** (`hash-chain-write-flag.ts` l.24-30 ; mandate-gated, exige migration Phase 1 + `LEDGER_HMAC_KEY`) |
| **Memory lineage chain** | `src/server/memory/memory-graph.ts` | Lignée décisions → leçons → actions (liens `[[…]]`) | Logique pure, fichier-backed v0.1 |

Les deux portent « chaîne » mais servent deux couches (audit vs savoir). Elles ne
sont aujourd'hui ni nommées distinctement ni reliées.

### Direction recommandée

Noms distincts (*Ledger integrity chain* / *Memory lineage chain*) et lien
explicite : chaque entrée mémoire `decision`/`action` pointe vers son entrée
`[[ledger:…]]` (déjà prévu par les règles du vault `.claude/rules/memory-vault.md`).

---

## P4 — 🟡 Capacités fortes mais dormantes

Plusieurs briques bien construites ne sont **pas encore en service**, ce qui peut
faire croire le HQ plus actif qu'il ne l'est :

- **Agent Council** : contrat pur complet (`agent-council-run-contract.ts`) +
  **un seul** consommateur (`src/features/ventures/venture-council-cash-run-composer.ts`).
  Aucune persistance ni UI vivante — la « délibération entre agents » est une
  capacité *déclarée*, pas une *boucle qui tourne*.
- **Ledger hash-chain** : en shadow (flag d'écriture OFF par défaut).

### Direction recommandée

Un **registre de statut des capacités** (`live` / `shadow` / `contract-only`) pour
que chaque surface HQ affiche l'état réel, et qu'on **active délibérément** plutôt
que d'accumuler. C'est aussi la cible de la « boucle canonique » à câbler :

```
Charter workflow (plan)
   → Council run (délibération, proposal-only, auditor veto / t_gravity kill)
   → Verdict (approvalRequired, noExecutionAuthorized)
   → Next Action Mandate / Money Strategy routing
   → Approbation CEO
   → Execution-attempt (no-exec-without-approval)
   → Ledger entry  →  Workflow run (trace) → KPI / run-health
   → Leçon gouvernée (memory)  ↺ alimente le prochain Council run
```

Les maillons existent tous ; ils ne sont pas encore chaînés bout-à-bout.

---

## P5 — 🟡 Sprawl documentaire « source of truth »

Plusieurs documents font autorité sans index commun :
`docs/HQ_RUN_HEALTH_SOURCE_OF_TRUTH.md`, `docs/MEMORY_VAULT_CONTRACT.md`,
`docs/REPO_CONSOLIDATION.md`, `docs/memory-vault/ARCHITECTURE.md`,
`docs/AGENT_NAMING.md` (référencé par `seed.ts`),
`docs/security/action-ledger-hash-chain-plan.md` (référencé par le verifier).

### Direction recommandée

Un `docs/README.md` index unique listant chaque doc, son domaine et son statut
(contrat verrouillé / plan / référence).

---

## P6 — 🟡 Hygiène : `next-env.d.ts` suivi par git

Fichier auto-généré par Next.js, actuellement **tracké** (il apparaît dans les
diffs et est revenu dans 2 des 5 stashes archivés). Bruit de diff récurrent.

### Direction recommandée

L'ignorer (`.gitignore`) et le retirer du suivi — changement isolé, sans impact
runtime.

---

## Déjà cohérent — à NE PAS casser

| 🟢 | Évidence |
|----|----------|
| **Principe de nommage** : IDs immuables, affichage uniquement via `naming.ts` | `naming.ts` l.3-10 |
| **Spine de gouvernance** : council `noExecutionAuthorized: true` partout ; `deriveMissionApprovalConfirmation` = source unique de `approvalConfirmed` ; no-exec-without-approval | `agent-council-run-contract.ts`, `src/server/missions/approval-derivation.ts` |
| **Définition → Exécution cohérente** : `WorkflowRun` dérive ses 5 étapes des champs de `AgentWorkflowDef` | `workflow-run.ts` l.97-111 |
| **Contrat charte ↔ registre** : `skillIds` d'un workflow doivent être un sous-ensemble des skills du registre ; chartes manquantes/orphelines détectées | `agent-charter.ts` l.159-201 |
| **Hub-and-spoke** : Joris seul orchestrateur, les modules ne se parlent jamais directement | `agent-charter.ts` l.13-16 |

---

## Ordre d'attaque suggéré

1. **P1** (résolveur unique d'agents) — plus petit diff, plus fort effet de
   cohérence, zéro risque runtime. Débloque tout le reste.
2. **P2** (glossaire des 3 couches « run » + alignement des enums).
3. **P3** (nommer/relier les deux chaînes).
4. **P4** (registre de statut des capacités + câblage de la boucle canonique).
5. **P5 / P6** (index docs + hygiène) — rapides, opportunistes.

> Chaque étape reste **mandat-gated** (`AGENTS.md`) et doit passer les 4 gates
> (`typecheck`, `lint`, `build`, `smoke:joris`) avant d'être déclarée terminée.
