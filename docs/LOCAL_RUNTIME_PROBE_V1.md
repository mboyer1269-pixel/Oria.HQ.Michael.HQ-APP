# Local Runtime Probe v1

Statut : livré (branche `feat/local-runtime-probe-v1`).
Mandat : « Michael approved Local Runtime Probe v1 after ruleset unlock and merge train ».
Contrats amont : `docs/LOCAL_SUBSCRIPTION_RUNTIME_GATE.md` (PR #325) ·
`docs/COMMAND_TOWER_V1.md` (PR #327).
Code : `src/server/agents/runtimes/local-runtime-probe.ts` ·
`src/features/hq/command-tower/runtime-status-source.ts`.

## 1. Objectif

Faire passer la carte **Runtime Status** de la Command Tower d'un tableau
statique honnête à des statuts **dérivés d'un probe local sûr** : Oria détecte
ses moteurs locaux (Claude Code CLI, Codex CLI, Gemini CLI), cite ses preuves,
et explique exactement pourquoi un moteur est prêt ou ne l'est pas.

Doctrine : **détection ≠ permission**. Le probe informe la tour ; il n'active
aucun corridor de dispatch, ne modifie aucune approbation, ne touche à rien.

## 2. Ce que le probe fait

- Cherche les binaires sur le PATH (via la commande de version).
- Lit la version quand une commande sûre existe.
- Vérifie une preuve d'auth **non interactive** quand le vendor en offre une.
- Classifie : `not_configured` · `unavailable` · `blocked` · `ready` ·
  `installed_unverified`.
- Produit une evidence citée et **rédactée** (email, orgId, chemins, valeurs
  ressemblant à des secrets → caviardés).
- Dégrade toute erreur (binaire absent, timeout, sortie malformée, échec de
  spawn) en statut avec raison — jamais de crash vers l'UI.
- Expose le snapshot à la Command Tower avec `enablesDispatch: false` littéral.

## 3. Ce que le probe refuse

- ❌ Envoyer un prompt à Claude/Codex/Gemini.
- ❌ Lire ou stocker un token, une clé, un credential.
- ❌ Lire cookies ou sessions ; `findForbiddenEvidenceFields` rejette tout
  champ cookie/session/proxy/token dans l'evidence.
- ❌ Reverse proxy, scraping navigateur, OAuth.
- ❌ Lancer un agent, exécuter une action sur le repo, modifier un fichier.
- ❌ Ouvrir un login (un runtime non connecté est `blocked` avec l'instruction
  de se connecter soi-même).
- ❌ Exécuter quoi que ce soit hors de l'allowlist gelée (rejet avant spawn).
- ❌ Marquer `ready` sans preuve positive (déclassement défensif sinon).

## 4. Claude Code CLI — commandes vérifiées

| Commande | Rôle | Vérifiée live (2026-07-02, v2.1.199) |
|---|---|---|
| `claude --version` | présence + version | ✅ « 2.1.199 (Claude Code) » |
| `claude auth status --json` | preuve d'auth non interactive | ✅ JSON `loggedIn`, `authMethod`, `apiProvider`, `subscriptionType` (+ email/orgId **jamais lus** — whitelist de champs) |

`ready` ⇔ `loggedIn: true`. `loggedIn: false` ⇒ `blocked`. JSON malformé ⇒
`unavailable`.

## 5. Codex CLI — commandes vérifiées

| Commande | Rôle | Vérifiée live (2026-07-02, codex-cli 0.137.0) |
|---|---|---|
| `codex --version` | présence + version | ✅ « codex-cli 0.137.0 » |
| `codex login status` | preuve d'auth non interactive | ✅ « Logged in using ChatGPT », exit 0, aucun login déclenché |

`ready` ⇔ sortie « Logged in using ChatGPT » (mandat v1). Login par API key ⇒
`installed_unverified` (seul le compte ChatGPT est une preuve sanctionnée).
« Not logged in » ou exit ≠ 0 ⇒ `blocked`.

## 6. Gemini CLI — statut v1

`gemini --version` vérifié live (0.45.2). **Aucune sous-commande officielle
non interactive de statut d'auth** trouvée dans l'aide CLI ⇒ plafond honnête :
`installed_unverified`. Jamais `ready` en v1.

## 7. Zapier MCP — statut futur

Pas un runtime modèle : corridor d'outils futur (`future_tool_corridor`),
jamais probé, aucun live call en v1. Entrée statique sur le board.

## 8. Security model

1. **Allowlist gelée** (`PROBE_COMMAND_ALLOWLIST`, 5 commandes exactement) —
   toute commande étrangère est rejetée AVANT le spawn, identité complète
   (id + binaire + args) exigée.
2. **Validation de tokens** : binaire `/^[a-z][a-z0-9-]*$/`, args
   `/^-{0,2}[A-Za-z0-9][A-Za-z0-9._-]*$/` — aucune injection shell possible,
   aucun chemin, aucun métacaractère, aucun argument utilisateur n'existe.
3. **Spawn sans shell** partout où possible (`claude.exe` natif). Sur Windows,
   les CLIs npm sont des shims `.cmd` que Node refuse sans shell (CVE-2024-27980) :
   un unique retry utilise le shell avec une ligne de commande construite
   exclusivement de tokens déjà validés — rien de variable, rien à échapper.
4. **Approbation écrite obligatoire** (invariant 11 du contrat #325) : le
   runner par défaut refuse de spawner si `LOCAL_RUNTIME_PROBE_APPROVAL` n'est
   pas `approved` avec une référence valide.
4b. **Gate d'environnement local/cloud** (`resolveProbeExecutionEnvironment`) :
   le probe est local/personnel uniquement. Tout marqueur cloud (`VERCEL`,
   `VERCEL_ENV`, `AWS_LAMBDA_FUNCTION_NAME`, `K_SERVICE`, `FLY_APP_NAME`,
   `RENDER`) interdit le spawn — même flaggé. Un build production ne spawne
   qu'avec `ORIA_ENABLE_LOCAL_RUNTIME_PROBE=1` explicite. Double couche : la
   source Command Tower bail out AVANT tout spawn (fallback honnête
   `probe_unavailable`) et le runner refuse en défense en profondeur. En
   cloud, zéro subprocess sur requête serveur, jamais.
5. **Timeout court** (10 s) + `maxBuffer` 1 Mo + `windowsHide`.
6. **Rédaction systématique** : emails, UUIDs, clés `sk-…`, Bearer, JWT,
   chemins home, tokens ≥ 32 chars → caviardés avant tout stockage/affichage.
   Les champs d'auth Claude passent par une **whitelist** (email/orgId jamais lus).
7. **Fail-closed** : la source Command Tower rend `null` sur toute erreur → la
   tour affiche le fallback « probe indisponible », jamais un faux statut.
8. **Exposition personnelle uniquement** : aucun champ tenant/customer/workspace
   dans le snapshot (épinglé par test) ; le contrat #325 rejette toute
   exposure non `personal_local`.

## 9. Mapping Command Tower

| Probe | Board `RuntimeBoardEntry` |
|---|---|
| `ProbedRuntimeEntry.status` | `status` (identité) — `ready`/`installed_unverified` exigent `probe` + evidence, sinon déclassés `unavailable` par le modèle |
| `evidence[]` (rédigée) | `evidence` (jointe « · ») |
| `reason` | `note` (raison exacte affichée) |
| `version`, `probedAtIso` | `probe: { probedAtIso, version }` |
| — | Zapier MCP ajouté statiquement (`future_tool_corridor`) |

Gate de la carte : `probe_v1` (statuts prouvés ce rendu) ou
`probe_unavailable` (fallback honnête). Le **Dispatch Board ne lit jamais le
probe** : corridors inchangés, `requiresApproval: true` partout (épinglé).

## 10. Limites honnêtes

- Le probe prouve *présence + login CLI*, pas que le quota/abonnement
  fonctionne : seule une invocation réelle le prouverait, et c'est interdit ici.
- La preuve a l'âge de son rendu (cache 30 s, `probedAtIso` affiché) — un
  logout après le probe ne se voit qu'au rendu suivant.
- Gemini plafonne à `installed_unverified` tant qu'aucune commande d'état
  d'auth non interactive officielle n'existe.
- `codex login status` sans TTY est réputé stable mais non documenté comme
  API ; un changement de wording (« Logged in using ChatGPT ») ferait dégrader
  vers `unavailable` — dégradation, jamais faux positif.
- Aucune écriture Ledger en v1 (affichage futur : Runtime Evidence Pack).
