# Memex Bridge Reality Gate

Statut : reality gate + contrats purs (branche `feat/memex-bridge-reality-gate`).
Doctrine : **Oria = GOVERN · Memex = ORIENT · Hermes/Joris = ACT.**
Contrat : `src/server/mcp/memex-bridge-contract.ts` (+ tests).

## 1. Executive verdict

**GO Option A — Memex Read-Only Context Bridge v1, en deux temps.**
Memex Core existe réellement (`C:\Users\micha\Dev\memex-core`, v0.7.0, branche
`main` propre) : serveur MCP stdio + gateway SSE, SQLite (better-sqlite3),
10 tools exposés par fixture d'autorisation, fabric policy avec scopes
(`read_only`/`propose_only`/…) où **`oria_hq` est déjà un client first-class**.
Le rapport analysé est juste sur la direction (8/10) et le piège identifié est
réel : Memex ne doit jamais devenir le gouverneur ni le model router final.

Ce PR livre le **temps 1 : le contrat**. Le connecteur live est le temps 2,
car il exige deux décisions que ce PR ne doit pas prendre seul :
(a) ajouter `@modelcontextprotocol/sdk` aux dépendances d'Oria, et
(b) choisir le transport (spawn stdio du serveur memex-core vs gateway SSE
locale) — memex-core tourne en `--experimental-strip-types` et n'est pas un
service permanent aujourd'hui.

## 2. What Oria owns

Command Tower, décisions, intents, dispatch, approbations, Sentinelle, Ledger,
Model Policy / Provider Registry (#322/#324), Runtime Gate + Probe (#325/#328),
ventures, auth, workspaces. **Le choix du modèle, du risque, de l'approbation
et de la preuve reste dans Oria — toujours.**

## 3. What Memex owns

Mémoire persistante durable, graph SQLite, context packs, librarian briefs,
vault fichiers avec zoning `Human/`/`Agent/`, consolidation/oubli actif,
provenance et deprecated flags. Memex dit « voici ce qu'on sait, d'où ça
vient, ce qui est périmé » — jamais « voici quoi faire ».

## 4. What MCP owns

Le corridor, rien d'autre : transport (stdio/SSE), découverte de tools,
schémas d'appels. Un serveur MCP est **non fiable par défaut** — sa sortie est
du matériau de contexte à filtrer, jamais des commandes.

## 5. What must not be duplicated

- Oria ne recode pas le graph, le librarian, la consolidation, le zoning —
  c'est Memex.
- Memex ne recode pas Sentinelle, le Ledger, le model routing, l'approval
  rail — c'est Oria.
- Le Memory Vault d'Oria (`src/server/memory/`) n'est **pas remplacé** :
  il reste le rail vérifié des leçons (learning loop) tant que le pont n'a
  pas prouvé sa valeur en lecture.

## 6. Current Oria memory state (scan réel)

- `src/server/memory/memory-vault-repository.ts` — vault propose/approve,
  in-memory + fichier (`memory-file-vault.ts`), contrat verrouillé
  (`docs/MEMORY_VAULT_CONTRACT.md`) : Supabase/pgvector interdits sans mandat.
- `src/server/memory/memory-graph.ts` — graphe pur + chainlines (fichiers
  `memory/` à la racine du repo).
- Injection Joris : `brain.ts` lit `readVerifiedVaultContext` →
  `buildVaultContextNote` + `composeVerifiedLessonsContext`
  (`src/server/agents/context/verified-lessons-context.ts`) — bloc advisory,
  borné (5 leçons / 2000 chars), sanitisé, subordonné aux guardrails.
  **C'est exactement le point d'accueil du pont Memex : une source
  additionnelle optionnelle à côté de l'existant, jamais un remplacement.**
- Learning loop : `agent-learning-loop.ts` + `learning-loop-service.ts`.
- Reste dans Supabase : ledger d'actions, intents d'exécution, bookings —
  la preuve opérationnelle. Reste dans Oria : tout ce qui gouverne.
  Peut venir de Memex : contexte durable, briefs, SOP, faits consolidés.

## 7. Current Memex capability scan (code réel, pas le rapport)

- **Tools MCP réels** (fixture `fixtures/mcp-tools-list.expected.json`, servie
  par `src/mcp/capabilities.ts`) : `agentmemory_graph_query`,
  `agentmemory_context_pack`, `agentmemory_librarian_brief`,
  `agentmemory_latest_updates`, `agentmemory_project_state`,
  `agentmemory_tool_catalog_search`, `agentmemory_submit_proposal`,
  `agentmemory_read_vault_file`, `agentmemory_write_vault_file`,
  `agentmemory_search_vault`. Resources : `agentmemory://health`,
  `agentmemory://schema`.
- **Transports** : stdio (`src/mcp/server.ts`) et SSE Express
  (`src/mcp/gateway.ts`). Node `--experimental-strip-types`.
- **Fabric** (`src/fabric/`) : scopes `read_only|propose_only|read_propose|
  write|admin|none`, `resolveClientProfile`, `effectiveScope`,
  `admitMemory`, `isContextEligible` — **zoning et deprecated sont réels au
  niveau policy** ; `oria_hq` et `hermes_agent` sont des client kinds
  first-class.
- **SQLite réel** (better-sqlite3), vault réel (`src/vault/`), intake réel.
- **Ollama/router** : présent seulement comme vocabulaire client
  (`gemini_api_adapter`, etc.) — pas de model router autoritaire trouvé. Bien.
- **Écarts rapport vs code** : le rapport parle de « Smart Model Router » dans
  Memex — le code n'en a pas (tant mieux, ça ne doit pas naître). La
  consolidation/oubli actif existe en policy (`admitMemory`,
  `isContextEligible`) mais l'exécution planifiée n'est pas visible.

## 8. Integration options

- **Option A — Read-Only Context Bridge v1 : GO.** Oria lit un context pack
  avant Joris. Aucun write, aucun remplacement, rollback = retirer une source
  optionnelle. Ce PR en livre le contrat exécutoire.
- **Option B — Propose/Approve Write Bridge v2 : plus tard.**
  `agentmemory_submit_proposal` existe déjà côté Memex ; côté Oria ça passera
  par Sentinelle + Ledger, symétrique du vault propose/approve actuel.
- **Option C — Remplacer le Memory Vault : NON.** Trop risqué, casse le rail
  de leçons vérifié, aucune preuve de valeur encore.
- **Option D — Memex Smart Model Router authority : NON, jamais.**
  `applyMemexRoutingHint` dans le contrat est la preuve exécutable : un hint
  entre, la décision Oria ressort identique.

## 9. Recommended MVP

1. **Ce PR** : contrat + tests + ce doc (aucune dep, aucun réseau).
2. **PR suivant** (après mandat sur dep + transport) : connecteur live
   read-only `src/server/mcp/memex-connector.ts` obéissant au contrat, source
   optionnelle `memex-context-source` branchée à côté de
   `composeVerifiedLessonsContext` dans `brain.ts` — fallback silencieux si
   Memex est absent.

## 10. Security boundaries (encodées dans le contrat)

- MCP non fiable par défaut ; sortie = contexte advisory, jamais commandes.
- Allowlist v1 par **nom exact** : `context_pack`, `librarian_brief`,
  `project_state`, `latest_updates`. Pas de wildcard. Write/propose/vault
  **inexprimables** dans une policy valide (validator les rejette).
- Aucun live write v1 ; `sentinelleRequiredForWrites: true` littéral pour v2.
- `routingAuthority: "oria"` littéral — toute autre valeur invalide la policy.
- Path traversal rejeté (`isSafeVaultRelativePath`) avant même que des tools
  vault existent côté Oria.
- Aucune valeur secrète ; namespace strict (`/^[a-z][a-z0-9._-]{0,63}$/`).
- `tenantExposureForbidden: true` — fabric personnelle, jamais les tenants.
- Timeout borné 500 ms–15 s + `failClosed: true` : Memex down ⇒ contexte
  existant inchangé (`mergeMemexContext(existing, null) === existing`).
- Provenance obligatoire par item (tool source + namespace + timestamp) et
  citée inline dans le bloc injecté ; deprecated exclus par défaut ; zone
  `unknown` rejetée ; zone `agent` derrière `allowAgentZone` explicite.
- Contexte borné (`maxContextChars` ≤ 20 000, budget appliqué item par item).
- Ledger : enregistrement des décisions du pont prévu en v2+ (pas requis v1).

## 11. Rollback plan

- v1 (ce PR) : fichiers purs sans consommateur runtime — révert trivial.
- v2 (connecteur live) : la source Memex est optionnelle dans `brain.ts` ;
  la retirer restaure exactement le comportement actuel. Aucun état migré,
  aucune donnée déplacée, le Memory Vault d'Oria n'a jamais bougé.

## 12. Next PRs

1. Memex context pack read-only live source (dep MCP SDK + transport, sous mandat).
2. Memex propose/approve write bridge (Sentinelle + Ledger).
3. Vault zoning UI dans la Command Tower.
4. Active forgetting evidence feed.
5. Oria model policy accepte les routing hints Memex — Oria reste l'autorité.
6. VPS deployment hardening (hors repo Oria).
