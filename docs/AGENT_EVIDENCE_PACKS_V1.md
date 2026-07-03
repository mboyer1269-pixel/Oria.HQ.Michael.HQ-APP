# Agent Evidence Packs v1 — Runtime & Memory

> **Doctrine :** Oria = GOVERN. Memex = ORIENT. Hermes/Joris = ACT.
> Memex central comme mémoire. Oria central comme autorité. Evidence central comme preuve.

## Pourquoi la preuve vient avant l'action

Deux corridors sont sur la roadmap : le dispatch runtime (Claude Code /
Codex, #328 probe mergé) et l'injection mémoire live (Memex, #329 contrat
mergé). Aucun des deux ne s'ouvre sans sa boîte noire :

- **Un dispatch sans Runtime Evidence Pack** est un agent qui agit sans
  enregistreur de vol. Oria ne peut ni croire son succès, ni auditer son
  échec, ni prouver qui a approuvé quoi.
- **Un Memex live sans Memory Evidence Pack** est une boîte noire qui
  chuchote dans l'oreille de Joris. Une mémoire injectée sans provenance
  est une hallucination persistante.

Ces deux packs sont des **contrats purs** (aucun I/O, aucun subprocess,
aucun appel MCP, aucun réseau, aucune lecture de `process.env`). Ils
définissent la forme de la preuve avant que quoi que ce soit ne produise de
la preuve — le même pattern qui a porté le Local Runtime Gate (#325) vers le
probe (#328), et le Memex Bridge Reality Gate (#329).

Test obligatoire du flux agentique (Observer → Journaliser → Approuver →
Persister → Auditer) : chaque pack répond aux six questions — observe quoi,
journalise quelle preuve, approuvé par qui, persisté où, auditable comment,
et qui garde l'autorité finale (Oria, toujours).

## Runtime Evidence Pack v1

`src/server/agents/evidence/runtime-evidence-pack.ts`

Champs : `runtimeKind`, `runtimeId`, `requestedBy`, `taskIntent`,
`mode` (`probe | dry_run | execution`), `exposure` (`personal_local`
uniquement), `allowedTools`, `deniedTools`, `commandSummary`,
`filesTouched`, `repoStatusBefore/After`, `validationSummary`, `riskLevel`,
`sentinelleDecision`, `outcome`, `enablesDispatch: false`,
`ledgerRequired: true`, `evidenceItems` (avec provenance),
`redactionsApplied`, `nextAction`, `createdAtIso`.

Règles clés (toutes testées) :

| # | Règle |
|---|---|
| 1 | Chaque evidence item exige une provenance (`capturedBy` + timestamp) |
| 2 | Les noms de champs secrets/tenant sont rejetés en profondeur ; redaction comptée |
| 3 | `execution_success` impossible sans `validationSummary` **passed** ET items de preuve |
| 4 | `probe`/`dry_run` ne peuvent pas réclamer de fichiers touchés ni de changement de repo |
| 5 | `enablesDispatch` est le littéral `false` — un témoin n'est pas une permission |
| 6 | `ledgerRequired` est le littéral `true` — le Ledger n'a pas d'opt-out |
| 7 | `mode: execution` exige une décision Sentinelle **approuvée avec référence écrite** |
| 8 | `runtimeId` doit mapper vers un `runtimeKind` connu |
| 9 | Outil inconnu = refusé par défaut ; `deniedTools` gagne sur `allowedTools` |
| 10 | `nextAction` : enum fermé `approve/reject/fix/park/merge_manually/retry` |
| 11 | Exposition tenant/customer rejetée — runtimes personnels seulement |
| 12 | Taille bornée : ≤ 16 000 caractères JSON, ≤ 50 items |

## Memory Evidence Pack v1

`src/server/agents/evidence/memory-evidence-pack.ts`

Champs : `source` (`memex | local_vault | session | imported_doc`),
`sourceTool`, `namespace`, `zone` (`human | agent | system`),
`agentZonePolicyReference`, `memoryIds`, `provenance`,
`deprecatedExcluded: true`, `trustLevel`, `freshness`, `conflictPolicy`,
`conflicts`, `contextBudget`, `injectedCharCount`, `redactionsApplied`,
`routingHintAdvisoryOnly: true`, `oriaAuthority: true`, `createdAtIso`.

Règles clés (toutes testées) :

| # | Règle |
|---|---|
| 1 | Provenance obligatoire dans les deux sens : chaque `memoryId` a son entrée, chaque entrée matche le namespace du pack |
| 2 | `deprecatedExcluded` est le littéral `true` — pas d'opt-in en v1 |
| 3 | Zone inconnue rejetée ; seuls `human/agent/system` sont injectables |
| 4 | Zone `agent` exige un `agentZonePolicyReference` explicite |
| 5 | Traversal de chemin rejeté dans les `memoryIds` (`..`, absolu, drive letter) |
| 6 | `applyMemoryRoutingHint` retourne la décision Oria **identique** — preuve exécutable |
| 7 | `toolUseAuthorizationFromMemory` refuse toujours — l'outil est décidé par Oria, gaté par Sentinelle |
| 8 | Les noms de champs d'autorité (`sentinelle_bypass`, `ledger_write`, `routing_authority`…) sont inexprimables |
| 9 | Conflit = marqué (`mark_conflicts`) ou exclu — la fusion silencieuse est inexprimable |
| 10 | `injectedCharCount ≤ contextBudget ≤ 20 000` — le budget est un mur |
| 11 | Valeurs secrètes (emails, clés, bearers, handles `amh1.*`) redactées et comptées |
| 12 | v1 lecture seule : aucune source write/propose/consolidation n'est exprimable |

## Pourquoi Memex est stratégique mais pas l'autorité

Memex Core est le substrat mémoire officiel : vault zoné, provenance,
sleep cycle, trust ledger, retrieval à zéro token. C'est l'avantage
structurel — Oria pense mieux parce qu'il se souvient proprement. Mais la
mémoire ORIENTE, elle ne GOUVERNE pas :

- Memex ne décide jamais le modèle final (`applyMemoryRoutingHint` est la
  preuve exécutable, `routingAuthority: "oria"` dans le bridge #329).
- Memex ne bypass jamais Sentinelle, ne déclenche jamais une action, ne
  remplace ni le Ledger ni Oria.
- Toute mémoire injectée est prouvée (provenance), bornée (budget),
  sourcée (namespace + tool), révocable (deprecated exclu) et auditable
  (le pack lui-même).

## Hors scope (ratifié)

NOORKI et Suivia sont hors scope. Allô Maude est hors scope sauf mention
explicite future. Focus unique : Michael HQ / Oria HQ / Memex Core /
Hermes / Joris.

## Frontières de sécurité

- Aucun subprocess, aucun appel MCP, aucun appel réseau, aucune exécution
  runtime dans ces modules — validation pure.
- Aucun champ token/cookie/session/OAuth exprimable ; scan profond des
  noms interdits dans les deux packs.
- Aucune exposition tenant/customer exprimable.
- Aucune dépendance ajoutée, aucune migration DB.

## Non-goals v1

- Pas de dispatch runtime live, pas d'exécution de prompt Claude/Codex.
- Pas de connecteur Memex live, pas de remplacement du Memory Vault.
- Pas de write/propose/consolidation.
- Pas d'autorité de routing modèle, pas de changement OpenRouter.
- Pas d'appel Zapier live, pas de migration DB, pas d'exposition tenant.

## Prochaines PRs (ordre CEO ratifié)

1. Memex live read-only context source (obéit au bridge #329 + Memory Evidence Pack)
2. Claude Code dry-run dispatch (produit des Runtime Evidence Packs `dry_run`)
3. Codex CLI dry-run dispatch
4. Runtime Evidence Pack UI dans la Command Tower
5. Memory Evidence Pack UI dans la Command Tower
6. Memex propose/approve write bridge (derrière Sentinelle)
7. Zapier MCP dry-run corridor
8. OpenRouter rework à travers le registry #324
