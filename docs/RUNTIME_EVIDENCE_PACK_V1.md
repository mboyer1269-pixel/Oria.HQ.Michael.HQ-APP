# Runtime Evidence Pack v1

Statut : contrat pur + tests (branche `feat/runtime-evidence-pack-v1`).
Doctrine : **Oria = GOVERN · Memex = ORIENT · Hermes/Joris = ACT · runtimes = ADAPTERS.**
Code : `src/server/agents/runtimes/runtime-evidence-pack.ts` (+ tests).

## 1. Summary

Le format de preuve **standard** que tout mouvement runtime doit produire
avant qu'Oria ne le croie. Une boîte noire commune à tous les moteurs : un
probe, un dry-run ou une exécution retourne le **même** objet typé, redacté,
borné et gouverné. Ce PR livre le contrat + le builder + 16 tests — il ne
lance rien.

## 2. Why this comes before dispatch

La doctrine dit : « aucun runtime ready ne donne le droit d'exécuter ». Pour
que ce soit vrai en pratique, Oria doit pouvoir **reconstruire chaque
mouvement** : quel moteur, sur ordre de qui, pour quelle intention, quels
outils autorisés/refusés, quels fichiers touchés, quel état du repo avant et
après, quelle validation, quel verdict Sentinelle, quelle preuve citée. Sans
ce format d'abord, chaque PR de dispatch (Claude, Codex, Memex, Zapier)
inventerait sa propre notion de « ça a marché » — et « ça a marché » sans
preuve n'est pas une preuve. Le pack rend `execution_success` **impossible**
sans validation complète ET approbation Sentinelle.

## 3. Contract fields

`runtimeKind` · `runtimeId` (namespacé par le kind) · `requestedBy` ·
`taskIntent` (redacté) · `mode` (`probe|dry_run|execution`) · `outcome`
(`not_applicable|execution_success|execution_failure|execution_partial`) ·
`exposure` (`personal_local|workspace_shared`) · `allowedTools` ·
`deniedTools` · `commandSummary` (redacté, jamais une string exécutable) ·
`filesTouched` · `repoStatusBefore/After` (clean + changedFileCount, jamais
de contenu) · `validationSummary` (typecheck/lint/tests/build) · `riskLevel`
(green/yellow/red) · `sentinelleDecision` (`not_required|pending|approved|
rejected`) · `ledgerRequired: true` (littéral) · `evidenceItems` (avec
provenance obligatoire) · `redactionsApplied` · `nextAction`
(`approve|reject|fix|park|merge_manually|retry`) · `enablesDispatch: false`
(littéral) · `createdAtIso`.

## 4. Security boundaries (les 12 invariants)

1. Chaque `evidenceItem` porte une provenance (source + runtime + timestamp)
   ou le pack est invalide.
2. Un pack `probe` n'active aucun dispatch — `enablesDispatch` littéral false.
3. Un pack `dry_run` ne peut prétendre avoir modifié des fichiers (ni changé
   l'état du repo).
4. Un pack `execution` ne peut annoncer `execution_success` sans
   `validationSummary` (4/4) **et** `sentinelleDecision: "approved"`.
5. Sentinelle requis pour tout mode au-delà de probe/dry_run.
6. `ledgerRequired` littéral true — le Ledger n'a pas d'opt-out.
7. `runtimeId` doit résoudre à un `runtimeKind` connu (namespacing enforced).
8. Outils inconnus refusés par défaut ; un outil ne peut être à la fois
   autorisé et refusé.
9. `nextAction` dans un vocabulaire de gouvernance fermé.
10. Champs en forme de secret/cookie/session/token **inexprimables** ; le
    contenu est redacté et le compte de redactions est enregistré.
11. Un runtime personnel/local (Claude/Codex/Gemini) ne peut jamais viser une
    exposition tenant/customer.
12. Pack borné : ≤ 50 items de preuve, ≤ 100 outils, ≤ 500 fichiers, champs
    texte ≤ 500 chars.

## 5. How Claude / Codex / Memex / Zapier will use it

- **Claude Code dry-run dispatch** : produit un pack `mode: "dry_run"`,
  `exposure: "personal_local"`, `filesTouched: []`, la preuve = sortie du
  dry-run redactée, `nextAction: "approve"` pour passer en exécution.
- **Codex CLI dry-run** : idem, `runtimeKind: "codex_cli"`.
- **Memex live read-only** : `mode: "probe"` (lecture de contexte), preuve =
  provenance des context packs, `enablesDispatch` reste false.
- **Zapier MCP dry-run corridor** : `runtimeKind: "zapier_mcp"`,
  `exposure: "workspace_shared"`, dry-run d'abord, exécution seulement après
  Sentinelle `approved` + validation.
- **n8n execution rail** (déjà live) : `mode: "execution"`,
  `execution_success` uniquement avec le pack complet — c'est la cible de
  référence prouvée par les tests.

## 6. Validation

`npm run typecheck` · `lint` · `test` (+16) · `smoke:joris` ·
`check:layering` · `map:check` · `build` — tous verts.

## 7. Non-goals

Le pack ne lance rien : no subprocess, no MCP, no external call, no DB
migration, no runtime dispatch, no auto-fix, no merge automation. Pur contrat
+ builder + tests. Aucune dépendance ajoutée.

## 8. Next PRs

1. Claude Code dry-run dispatch intent (produit un pack `dry_run`).
2. Codex CLI dry-run dispatch intent.
3. Memex live read-only context source (produit un pack `probe`).
4. Zapier MCP dry-run corridor.
5. Sentinelle runtime dispatch approval (consomme `sentinelleDecision`).
6. Ledger persistence du pack (aujourd'hui `ledgerRequired: true`, écriture = future).
