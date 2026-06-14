# Agent Naming v1 — « Un visage, des modules »

Statut : appliqué (2026-06-12). Source de vérité des noms : `src/features/agents/seed.ts`.
Couche de résolution : `src/features/agents/naming.ts`.

## Direction

Joris est la seule persona nommée du HQ — c'est le seul agent conversationnel
(dock, chat, presence, plan du jour). Tous les autres agents sont des pipelines
gouvernés ; ils portent des **noms de modules fonctionnels** : un mot, lisible en
français et en anglais, qui dit la fonction sans explication. Pas de panthéon,
pas de personnages décoratifs — un command center.

## Règles

1. **Les IDs techniques ne se renomment jamais.** Ledger, execution licenses,
   webhook bindings, council `roleId`, lignes DB et fichiers `hermes-*` y sont
   couplés. Le rename est purement une couche d'affichage.
2. **Aucun nom d'agent en dur dans l'UI ou les prompts.** Toute surface qui
   affiche un agent résout le nom via `getAgentDisplayName()` (`naming.ts`),
   qui accepte les ids canoniques, les alias ledger (`agent_hermes`,
   `joris_orchestrator`) et les anciens noms mythologiques (données legacy).
3. **Un nouveau nom doit** : fonctionner en FR et en EN, tenir dans une UI SaaS
   sérieuse, clarifier la fonction de l'agent, et être validé contre le rôle
   réel dans le code avant adoption.

## Matrice ancien → nouveau

| ID technique | Ancien nom | Nouveau nom | Rôle | Justification |
|---|---|---|---|---|
| `joris` | Joris | **Joris** | orchestrator | Conservé — seule persona conversationnelle, identité produit établie. |
| `hermes` | Hermès | **Relay** | operator | Prépare SOPs, outreach et cash-actions puis les *relaie* vers le Send Desk — rien ne part sans le clic CEO. |
| `orion` | Orion | **Radar** | scout | Scan marché lecture seule : signaux, leads, opportunités. |
| `sentinel` | Thémis | **Sentinel** | auditor | Gate red-team bloquant — l'ID disait déjà la fonction. |
| `scribe` | Mnémosyne | **Scribe** | memory | Décisions, daily logs, résumés — aligné sur l'ID. |
| `finops` | Ploutos | **FinOps** | money | Cash, runway, coûts IA — terme métier établi, aligné sur l'ID. |
| `builder` | Héphaïstos | **Forge** | builder | Specs et prototypes MVP internes. |
| `closer` | Peithô | **Closer** | closer | Vente/conversion (agent gelé) — aligné sur l'ID. |
| `marketing` | Phémé | **Studio** | operator | Production de contenu et campagnes. |
| `inventor` | Dédale | **Lab** | scout | Idéation, concepts, design MVP — tout reste interne. |

### Passe adversariale (Studio / Lab)

- **Studio** : alternatives rejetées — *Broadcast* implique l'envoi (contraire à
  la posture « préparer, jamais émettre »), *Signal* collisionne avec Suivia
  « Signal-to-Client » et `HQ_SIGNAL_WIRING`, *Press* est ambigu en français.
  Studio dit la production sans impliquer la diffusion.
- **Lab** : « Venture Lab » (surface Phase 3, `PRODUCT_MAP.md` — scoring
  d'idées, états de décision) recouvre exactement les skills de `inventor`
  (`opportunity.score`, `concept.generate`, `mvp.design`). Convergence voulue :
  l'agent Lab est le moteur prévu de la surface Venture Lab, comme Relay l'est
  du Send Desk. Même famille de nom = même pipeline.

### Garde-fou

`src/features/agents/naming-contract.test.mjs` verrouille le contrat : IDs
gelés, noms uniques, panthéon banni du registre, résolution des alias ledger
et des anciens noms, **et la résolution des rôles de council** (couverture
exacte agent XOR lentille contre `AGENT_COUNCIL_ROLE_IDS`). Tout rename futur
passe par ce test.

## Rôles de council (résolution)

Les `roleId` du contrat Agent Council
(`src/server/agents/agent-council-run-contract.ts`) se résolvent via `naming.ts`
(`getCouncilRoleDisplayName`, `resolveCouncilRoleToAgentId`) en **deux familles
intentionnelles** — un seul mécanisme, plus aucun token fantôme.

**Adossés à un agent** — le rôle EST un agent du registre :

| roleId council | Agent (id) | Affichage |
|---|---|---|
| `joris_orchestrator` | `joris` | Joris |
| `hermes` | `hermes` | Relay |
| `auditor` | `sentinel` | Sentinel |
| `builder` | `builder` | Forge |
| `scribe` | `scribe` | Scribe |
| `closer` | `closer` | Closer |

**Lentilles synthétiques** — fonctions de délibération council-only, sans agent
dédié (`resolveCouncilRoleToAgentId` renvoie `null`) :

| roleId council | Affichage | Raison |
|---|---|---|
| `orient` | Cadrage | Contexte acheteur / positionnement — distinct du scan marché de Radar. |
| `t_gravity` | Gravité éco. | Priorisation ROI / speed-to-cash / risque — fonction, pas agent. |
| `operator` | Opérateur | Préparation du handoff next-work — fonction, pas agent. |

> Décision 2026-06-13 (audit de cohérence P1, `docs/HQ_COHERENCE_AUDIT.md`) :
> `orient`, `t_gravity`, `operator` sont des **lentilles**, pas des agents.
> Avant ce passage, 4 des 5 rôles de la séquence cash réelle
> (`orient, t_gravity, hermes, auditor, operator`) ne résolvaient vers aucun
> agent — `naming-contract.test.mjs` empêche désormais toute régression.

## Références techniques volontairement inchangées

- IDs d'agents et alias ledger (`hermes`, `orion`, `agent_hermes`,
  `joris_orchestrator`), council `roleId` (`hermes`).
- Noms de fichiers `hermes-prep-tick.ts`, `hermes-prep-plan.ts`,
  `hermes-outreach-plan.ts` et types `Hermes*` (couplés à l'ID).
- Champs de contrat `originalOryaEligible` / `originalOryaCandidate`,
  constante `ORYA_VENTURES`, ventureId `orya-hq`, header
  `X-Orya-Idempotency-Key` (idempotence et données persistées).
- Migration `0013_prepared_actions.sql` et toute SQL historique.

## Dérive de nom produit corrigée au passage

Le prompt système de Joris disait « Hermès HQ » et plusieurs chaînes visibles
disaient « Orya HQ ». Les chaînes visibles (UI, prompts, courriels sortants,
disclosure IA) disent désormais **Oria HQ** ; les identifiants techniques en
`orya` restent (voir ci-dessus).
