# Lot E1 → D — atelier qualifié (2026-10-25)

Base : PR #409 (`lot-b/subscription-runtimes`, `261c8e7`), non modifiée ; réutilise `subscriptionEnvironment` (env en liste blanche) et le catalogue d'abonnement.

## Choix du chemin : Codex CLI abonnement (ChatGPT), un seul chemin
Test borné (preuves dans `atelier-e1-d-evidence/`) :
- **OpenHands** (`openhands-bounded-test.txt`, exécuté sur `oria-hq-orchestrator@e70e8aa`) : `dossier.prepare` d'un dossier v3 → `InvalidDossier Unexpected contract fields` (constat 1 confirmé) ; `provider_preflight` avec politique valide → `unsupported_provider_profile` (constat 2 confirmé) ; `run_mission.execute` code `claude-agent-acp` en dur et ne transmet aucun modèle (constat 3 confirmé). Sur la machine : pas de Docker, pas de `openhands-sdk`, pas de `claude-agent-acp` ; le consumer suppose une base HQ distante (interdite ici). Chemin non exécutable sans 4 réparations + infra ⇒ éliminé.
- **Codex CLI** (`cli-bounded-test.head.jsonl`, `rollout-model-cli-bounded.txt`) : `codex exec -m gpt-5.6-luna -s workspace-write` sans clé API → fichier créé en 7,4 s, modèle `gpt-5.6-luna` lu dans la session CLI.
Critères éliminatoires du comité (refus, interruption, reprise, isolation) : seul le CLI les passe aujourd'hui. Claude Code reste possible derrière le même module plus tard (limité jusqu'à ~7h20 HAE ce jour, non testé).

## Ce qui est livré
- `src/server/atelier/atelier-mission.ts` : mission sur branche `atelier/<id>`, étapes agent (`codex exec` / `codex exec resume <session>`), étapes runner (tests, aperçu), commit par le runner, artefacts hachés, verrou exclusif + reprise **explicite** d'un verrou orphelin (runner mort) avec récupération de l'id de session, refus si `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`/`CODEX_API_KEY` présent ou si `codex login status` ≠ ChatGPT, preuve de modèle observé (session CLI).
- `src/scripts/atelier/mission.mjs` : CLI opérateur. API lecture `src/app/api/atelier/missions/**`. Panneau `/hq/atelier`. Contrat : `docs/atelier-contract.md`. Tests : `src/server/atelier/atelier-mission.test.mjs` (6/6).

## Mission réelle (dépôt jetable local `/workspace/atelier-sandbox/tip-calc`, mission `329674b0…`)
| Étape | Preuve | Résultat |
|---|---|---|
| besoin → mission + branche | `01-create.txt` | branche `atelier/329674b0`, base `5754292` |
| spec | `02-spec.txt` | SPEC.md, commit `9f1ecd6`, modèle observé gpt-5.6-luna |
| code | `03-code.txt` | commit `d980971` |
| tests (runner) | `0db9c3ff-test.log` | 10/10 |
| aperçu | `preview-before.png` | rendu Chrome headless |
| correction demandée (CAD « 1,50 $ », boutons 15/18/20 %) | `06`… | lancée 09:06:04Z |
| interruption | `mission.json` étape revision `interrupted/runner_died` | SIGKILL runner + groupe Codex à 05:06:16 HAE |
| refus sans reprise explicite | `07-refused-without-resume.txt` | `stale_lock_requires_explicit_resume` |
| reprise | `08-resume.txt`, `baa3be99-code.diff` | même session `01a1724f…` (`resumedFrom`), commit `d390943` |
| tests après correction | `aa514f34-test.log` | 11/11 |
| aperçu après | `preview-after-revision.png` | « 1,50 $ », boutons rapides |
| artefacts visibles côté app | `11-app-handler-proof.txt` | handler API : 17 artefacts, `modelProof.matches=true`, PNG servi avec sha256 |

Limites : l'étape reprise est étiquetée `code` dans cette exécution (corrigé ensuite : la reprise garde le type de l'étape interrompue) ; la preuve « app » passe par les handlers des routes, pas par un navigateur connecté (auth Supabase = base distante, exclue) ; l'interruption a été provoquée par SIGKILL, pas par un redémarrage machine ; pas de bouton de lancement dans l'UI ; OpenHands non réparé (voir ci-dessous).

## OpenHands — état (non retenu, non modifié)
1. v3 vs v1/v2 : confirmé. 2. profil refusé : confirmé. 3. ACP Claude en dur, modèle non transmis : confirmé. 4. reprise : verrou `started.json` en `open('x')` + pas de reprise auto — confirmé par lecture, non exécuté. 5. artefacts non renvoyés : confirmé par lecture. 6. SDK épinglé 1.50.0 (asserts dans `openhands-qualification/*.py`), PyPI publie 1.58.2 (`pip index versions`, 2026-10-25). Recommandation : geler OpenHands hors V1 ; si repris, migrer vers Agent Server 1.58.x plutôt que réparer l'ancien chemin Docker.

## Garde abonnement en cours d'étape et limites (SENT-412-17 / 412-18)
- Claude Code est lancé avec `--setting-sources ""` : aucun réglage utilisateur/projet/local (clé `env`, apiKeyHelper, skills, plugins).
  Le runner lit `system/init` du stream-json : `apiKeySource` ≠ `"none"` (ou `apiProvider` ≠ firstParty) → groupe tué (SIGKILL),
  étape `failed`, raison `subscription_auth_required`, aucun commit ; rien n'est détruit : les changements (suivis et non suivis) sont mis de côté
  par `git stash push --include-untracked -m "atelier-quarantine-<missionId>-<stepId>"`, sha du stash dans `step.quarantineRef` (null si rien).
- Codex : `--json` n'expose pas la méthode d'authentification ; la garde reste `codex login status` (« Logged in using ChatGPT ») avant
  lancement + `forced_login_method="chatgpt"` + `model_provider="openai"`. Pas de vérification équivalente en cours d'exécution.
- Étape `test` (runner) : environnement minimal (PATH/LANG/TERM, NODE_ENV=test, CI=1), HOME/TMPDIR privés par mission, cwd = dépôt,
  timeout 120 s (SIGKILL). Ce n'est **pas** un bac à sable OS : même uid, un chemin absolu (ex. `~/.codex/auth.json`) reste lisible ;
  le timeout ne tue que le processus direct. Le `Bash(npm test:*)` autorisé à l'agent Claude hérite de l'environnement de la CLI
  (liste blanche, HOME réel nécessaire à la connexion claude.ai) : non confiné. Vrai confinement = conteneur / bubblewrap (hors lot).

## Réaudit fa7c404 (SENT-412-20…29)
- **Worktree par mission** : `git worktree add -b atelier/<id> <store>/<mission>/worktree <baseSha>` ; le checkout partagé n'est
  jamais basculé. HEAD + branche vérifiés (`repo_head_mismatch`) avant chaque étape (sous verrou) et avant chaque commit. La
  quarantaine ne touche que le worktree de la mission ; ref nommé `refs/atelier/quarantine/<mission>/<step>` = stash réellement produit.
- **Claude, avant lancement (diagnostic seulement, 412-31)** : `claude auth status` ne voit pas les surcharges projet/settings (vérifié
  sur la vraie CLI) ; il ne refuse que l'absence de connexion. **Seule protection pendant l'étape** : env enfant nettoyé (liste blanche
  moins ANTHROPIC_*, OPENAI_*, *_BASE_URL, *TOKEN*, *_KEY), `--setting-sources ""`, et garde du flux init : init non abonnement → kill
  du groupe ; pas d'init avant 30 s → kill ; init jamais vu → `subscription_auth_required` (fail closed), quarantaine, aucun commit.
- **Marge résiduelle (412-21)** : pas de blocage réseau sans privilège (pas de netns/pare-feu par processus). Si un vecteur non couvert
  par `--setting-sources ""` et la liste blanche d'env faisait passer la CLI en clé API, la requête
  facturable partie entre l'émission de init et le SIGKILL (ordre de la ms, lecture en flux) n'est pas empêchée. Piste : proxy local
  `HTTPS_PROXY` qui retient les CONNECT jusqu'à init validé (non fait : non validé sur la vraie CLI sans dépenser de quota).
- **Agent Claude sans Bash (412-23)** : outils Read/Edit/Write/Glob/Grep ; refusés : Bash, WebFetch, WebSearch, et Read/Edit/Write sur
  ~/.claude, ~/.codex, ~/.ssh, ~/.config, ~/.aws, ~/.npmrc, ~/.netrc, ~/.gitconfig, ~/.git-credentials. Les tests passent par l'étape
  test du runner. Risque restant : Read par chemin absolu vers un autre fichier sensible non listé ; écriture limitée au cwd par acceptEdits.
  Codex garde son shell dans son bac à sable `workspace-write` (HOME réel lisible par ce shell).
- **Codex (412-24)** : `-c openai_base_url="https://chatgpt.com/backend-api/codex"` forcé (l'URL du config HOME est ignorée).
- **Étape test (412-29)** : la commande est chef de son propre groupe (superviseur node) ; au timeout tout le groupe est tué.
- La fermeture d'étape libère le verrou et sauvegarde l'état même si git lève (412-27).
- La sortie de la CLI passe par un tube : si le runner meurt, l'enfant reçoit SIGPIPE à sa prochaine écriture (reprise explicite inchangée).

## Réaudit 488609a (SENT-412-30…35, MERGE-4)
- **Étape test, fermeture (412-30a)** : si le diff de la mission (vs baseSha, commité ou non, non suivi ou ignoré) touche package.json,
  lockfiles, .npmrc/.yarnrc, configs jest/vitest/mocha/…, .husky/.githooks ou node_modules, l'étape n'est pas lancée :
  `needs_human_review` / `test_harness_changed`. Reprise seulement par `POST /verify {"approveHarnessChange": true}` (propriétaire),
  tracée dans `harnessApprovedBy`.
- **Bac à sable (412-30b)** : bwrap sans sudo disponible ici → `npm test` tourne sous `bwrap --unshare-net --unshare-pid
  --die-with-parent`, système en lecture seule, `/tmp` tmpfs, ni /home ni /root réels, HOME privé, seul le worktree (et ce HOME privé)
  en écriture ; `step.sandbox = "bwrap"`. Sans bwrap : `sandbox = "none"` (confinement réduit à l'env nettoyé + groupe tué).
- **Worktrees (412-32/33)** : `worktree prune` avant création ; échec de création → dossier supprimé, `branch_in_use` si la branche
  existe ; `closeMission` retire le worktree (jamais forcé : `worktree_dirty`) puis prune.
- **Quarantaine (412-34)** : `git add -A` + `git stash create` → ref nommé vérifié (arbre = arbre de travail), puis seulement remise
  à HEAD du worktree ; `refs/stash` n'est jamais touché.
- **412-35** : Grep/Glob refusés aussi sur les chemins sensibles ; lancement refusé (`repo_symlink_escape`) si un lien symbolique sort du worktree.
- **Ajouts Ronny** : l'agent Claude n'a ni Edit ni Write sur package.json, lockfiles, .npmrc/.yarnrc (racine et `**/`), en plus de
  `test_harness_changed` ; l'étape test n'hérite d'aucun identifiant (HOME privé, env limité à PATH/LANG/LC_ALL/TERM, bwrap sans
  /home réel). Refus Claude avant lancement = clé ou bascule payante dans l'env (ANTHROPIC_API_KEY, *_AUTH_TOKEN,
  CLAUDE_CODE_USE_BEDROCK/VERTEX/FOUNDRY, ANTHROPIC_BASE_URL) ou `apiKeyHelper`/`env` dans les réglages chargés (seuls les nôtres) ;
  pendant l'étape = `apiKeySource` de init. `auth status` n'est plus qu'un diagnostic de connexion.

## Réaudit e3fb099 (SENT-412-36, 37, 32)
- **412-36** : plus de repli silencieux. Sans bwrap utilisable, l'étape test n'est pas lancée (`sandbox_unavailable`,
  `needs_human_review`) ; exécution sans bac à sable seulement via `POST /verify {"approveUnsandboxed": true}` (owner + titulaire),
  tracée dans `unsandboxedApprovedBy`.
- **412-37** : la CLI Codex tourne elle-même sous bwrap : système en lecture seule, `/tmp` et tout le HOME en tmpfs (donc
  ~/.claude, ~/.ssh, ~/.config, ~/.aws… invisibles), dossiers du PATH et installation de Codex en lecture seule, ~/.codex = dossier
  propre à la mission (`<mission>/codex-root/.codex`, sessions + notre `config.toml`), `~/.codex/auth.json` réel monté en lecture
  seule, worktree en écriture. Réseau conservé (chatgpt.com). Sans bwrap : Codex refusé (`sandbox_unavailable`).
  **Limite assumée** : le jeton ChatGPT de Codex (auth.json) reste lisible par le processus Codex et son shell ; plus ceux de Claude
  ni ~/.ssh. auth.json étant en lecture seule, un rafraîchissement du jeton par Codex n'est pas réécrit (si la session expire,
  se reconnecter hors Atelier avec `codex login`).
- Transcripts et journaux de test : lisibles par les owners de l'espace seulement (403 `atelier_owner_only` pour un member).
  Le flux d'événements reste lisible par les membres (statuts, sans contenu CLI).
- **412-32** : `POST /missions/:id/close` (owner + titulaire) appelle `closeMission` : retire le worktree (refus si sale ou étape
  vivante) puis prune. Pas de fermeture automatique : la fin de mission (revue) est une décision humaine.
