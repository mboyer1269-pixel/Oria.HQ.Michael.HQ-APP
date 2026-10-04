# Accès propriétaire et reprise de formulaire — résultat

**Auteur :** Claude Code (session de correction ciblée)
**Date :** 1er octobre 2026
**Mandat :** `C:/Users/micha/Documents/ChatGPT/Orchestrator/docs/directives-2026-10-01/claude.md` — corriger deux défauts établis, sans reprendre le backend d'Antigravity ni le routage Cursor.
**Rapport de départ :** `CLAUDE-AUDIT-COHERENCE-FINALISATION.md`, constats 1 et 4.
**Autorisé par :** Michael.

---

## 1. Base effective et arbre de travail

| Élément | Valeur |
| :--- | :--- |
| Dépôt produit | `C:/Users/micha/Dev/Oria.HQ` |
| Branche source | `codex/hq-mission-dossier` |
| Base effective | `e9ff840` — « Persist observed OpenHands launch closure with identity binding » |
| Copie isolée | `C:/Users/micha/Dev/Oria.HQ/.claude/worktrees/claude-acces-reprise` |
| Branche de travail | `claude/acces-reprise`, créée **sur `e9ff840`** |
| Arbre au départ | propre (seul `?? .claude/worktrees/` non suivi) |
| Commit livré | voir §7 |
| Poussée / fusion | **aucune** |

La base demandée par le mandat (`e9ff840`) est bien la base effective : le worktree a été créé avec
`git worktree add … -b claude/acces-reprise e9ff840`, pas depuis `origin/main`.

**Non fait, volontairement :** aucun `reset`, aucun `push`, aucune fusion, aucun changement de droits,
aucune lecture ni écriture de secret, `.env` ou credential, aucune action sur la production, aucun
appel de modèle payant, aucun sous-agent.

---

## 2. Périmètre tenu

Fichiers écrits — strictement le périmètre autorisé (`owner.ts`, le formulaire, leurs tests directs, ce rapport) :

| Fichier | État | Rôle |
| :--- | :--- | :--- |
| `src/server/auth/owner.ts` | modifié | phase 1 — garde de production sur la dérivation de test |
| `src/features/missions/components/development-mission-form.tsx` | modifié | phase 2 — reprise explicite |
| `src/features/missions/development-mission-session.ts` | **créé** | phase 2 — logique de reprise, pure, hors React |
| `src/features/missions/development-mission-session.test.mjs` | **créé** | phase 3 — 32 tests comportementaux |
| `src/server/auth/owner-api-session-guard.test.mjs` | **créé** | phase 3 — 6 tests sur la barrière |
| `src/server/memory/memory-production-write.test.mjs` | modifié | **dépassement assumé, voir §6** |
| `docs/CLAUDE-ACCES-REPRISE-RESULTAT.md` | **créé** | ce rapport |

Aucun contrat serveur n'a été touché : les mêmes `GET /api/missions/development?requestId=…` et
`POST /api/missions/development` sont appelés, avec les mêmes charges. Aucune refonte esthétique :
les classes, la palette et la structure de la section sont celles d'origine.

---

## 3. Phase 1 — la barrière propriétaire des routes API

### Constat reproduit

`src/server/auth/owner.ts:96-103` (base `e9ff840`) consultait `globalThis.__ownerApiSessionTestResult`
**avant** toute vérification de session et **sans garde d'environnement**. La propriété présente
valait « réponse imposée » ; `?? null` faisait de `null` **et** de `undefined` un « autorisé ».
44 fichiers de route sous `src/app/api` appellent cette fonction.

Reproduction : la dérivation a été appelée directement sur le module réel, sous `NODE_ENV=production`,
sans aucune variable Supabase. Avant correction, la propriété posée à `null` **franchissait** la
barrière ; le test `owner-api-session-guard.test.mjs` fixe désormais l'inverse et échoue si la garde
disparaît.

### Portée honnête de ce défaut

**Ce n'est pas une exploitation distante démontrée.** Poser une propriété sur `globalThis` côté serveur
suppose déjà d'exécuter du code dans le processus. Aucun module de production ne pose cette propriété
aujourd'hui. Il s'agit de défense en profondeur : la barrière ne devait pas être désactivable par une
variable globale, quelle que soit la façon dont elle y arrive (utilitaire de test embarqué par
mégarde, dépendance compromise, crochet d'instrumentation).

### Correction

La dérivation n'est lue **qu'hors production**, avec la garde explicite déjà employée ailleurs dans le
dépôt (`src/server/arena/get-arena-service.ts:13`) :

```ts
if (process.env.NODE_ENV !== "production") {
  const globals = globalThis as typeof globalThis & { __ownerApiSessionTestResult?: NextResponse | null };
  if (Object.prototype.hasOwnProperty.call(globals, "__ownerApiSessionTestResult")) {
    return globals.__ownerApiSessionTestResult ?? null;
  }
}
const user = await getCurrentAuthUser();
```

### Preuve qu'en production le global ne court-circuite plus rien

`node --test --test-reporter=spec src/server/auth/owner-api-session-guard.test.mjs`, verbatim :

```
✔ hors production, la dérivation de test reste honorée (0.879564ms)
✔ en production, la dérivation ne court-circuite pas la barrière (4.81629ms)
✔ en production, une dérivation posée à undefined ne franchit pas la barrière (0.59028ms)
✔ en production, une réponse imposée par la dérivation est ignorée (0.341823ms)
✔ sans dérivation, la barrière répond pareil dans les deux environnements (0.708933ms)
✔ la propriété est restaurée proprement entre les cas (0.119525ms)
ℹ tests 6   pass 6   fail 0
```

En production, les trois formes du contournement (`null`, `undefined`, réponse 200 forgée) donnent
toutes `401 {"error":"Authentification requise."}` : la vraie barrière répond.

**Limite de méthode, explicite.** `NODE_ENV` est basculé au moment de l'**appel**, pas à l'import :
`src/lib/server-env.ts:126` échoue volontairement au chargement sous `NODE_ENV=production` sans
identifiants réels. Le test mesure donc la sémantique runtime. Dans un vrai build Next,
`process.env.NODE_ENV` est inliné et la branche est **éliminée à la compilation** — strictement plus
fort que ce que le test mesure. Aucun déploiement n'a été fait pour l'observer.

### Les tests utiles sont conservés

Six suites existantes posent cette propriété. Toutes passent après correction :

```
node --test src/server/memory/memory-production-write.test.mjs \
            src/server/orchestration/paperclip-read.test.mjs \
            src/server/arena/arena-api.test.mjs \
            src/server/ventures/agent-score-snapshot-route.test.mjs \
            src/server/ventures/shadow-pass.test.mjs \
            src/server/agents/execution-intent-rail-api.test.mjs
→ tests 69   pass 69   fail 0      REAL_EXIT=0
```

Une seule a dû être recâblée — voir §6.

---

## 4. Phase 2 — reprise contre nouvelle mission

### Constat reproduit par lecture

`development-mission-form.tsx:11` (base `e9ff840`) :

```ts
id = requestId ?? previous ?? crypto.randomUUID();
if (previous && !requestId) readOnly = true;
```

`requestId` est un `useState` jamais réhydraté — aucun `useEffect` dans le composant. Après un
rechargement, `requestId` vaut `null` et `sessionStorage` conserve l'identifiant : un envoi
(`run(false)`) était donc **réécrit en relecture**, la construction de la charge (`:12`, gardée par
`!readOnly`) était sautée, et la ligne d'état annonçait `Mission enregistrée : <ancien titre>`.
Aucune écriture, saisie perdue, et le bouton d'enregistrement disparaissait.

### Correction

La logique de reprise est isolée hors React dans `development-mission-session.ts`, pour être
vérifiable sans navigateur. Cinq changements de comportement :

1. **Réhydratation explicite.** Un `useEffect` lit `sessionStorage` au montage et à chaque changement
   de projet. L'identifiant retrouvé devient `pendingRequestId` — « en attente d'une décision », pas
   « demande active ».
2. **Une création n'est jamais convertie en relecture.** Avec un `pendingRequestId`, l'intention
   `create` produit un refus `resume-decision-required`, et `requestMethodFor()` vaut `null` : aucune
   requête, et surtout aucun `GET`. La saisie reste à l'écran, intacte.
3. **Reprise et nouvelle mission sont deux boutons.** « Reprendre cette demande » adopte l'identifiant
   et relit son reçu. « Commencer une nouvelle mission » met l'identifiant de côté — il reste affiché
   et **relisible** (`read-released`), parce que c'est la seule voie restante vers son reçu ; le
   bouton d'enregistrement ne réapparaît qu'après ce choix.
4. **Même identifiant, même charge pour tout renvoi.** La charge est figée au premier envoi et
   réutilisée telle quelle. Un renvoi sans charge figée (cas réel après rechargement : le contenu
   n'est pas conservé, seul l'identifiant l'est) exige une saisie complète plutôt que d'envoyer du vide.
5. **Reçu relu ≠ création.** Trois formulations distinctes : `Reçu existant relu : … Aucun envoi,
   aucune création.` / `Mission enregistrée : … Aucun agent lancé.` / `Enregistrement confirmé sous le
   même identifiant : … Aucune seconde mission.`

**Honnêteté sur le troisième message.** `retried` ne prétend pas savoir si l'écriture a eu lieu à cet
instant ou si elle était déjà là : l'admission est idempotente par `requestId`
(`development-mission.ts:14-18`), donc le client **ne peut pas** distinguer les deux. La formulation
couvre les deux cas sans inventer. Si le contenu diffère de ce qui a été écrit, le serveur répond
`conflict` (le `payloadHash` de `development-mission.ts:33` inclut les quatre champs, le mode et
l'acteur) et le message existant « Aucun écrasement effectué » s'applique — comportement non modifié.

### Cas couverts

| Cas | Comportement livré |
| :--- | :--- |
| Rechargement | décision explicite exigée ; aucun `GET` sous l'ancien identifiant ; saisie conservée |
| `sessionStorage` absent / indisponible | `tracking: "unavailable"` → aucun envoi ni reprise, annoncé en `role="alert"`, saisie conservée à l'écran |
| Valeur stockée corrompue | `tracking: "corrupt"` → écriture refusée, reprise impossible, et **une sortie** : « Écarter ce suivi illisible » (l'ancien code restait bloqué sans issue) |
| Double clic | verrou `lock.current` synchrone (inchangé) **plus** refus d'état `submission-already-active` sur toute seconde création |
| Workspace différent | clé de suivi cloisonnée par projet ; aucune reprise croisée ; saisie et charge réinitialisées à la frontière |
| Tentative réseau à issue inconnue | écriture → `outcome_unknown` ; relecture → `unavailable` ; aucun renvoi automatique, aucun nouvel identifiant |

### Point de revue intégré — réponse obsolète après changement de projet

Signalé en cours de mandat : si `workspaceId` change pendant un `fetch`, l'`useEffect` réinitialise la
session mais une réponse tardive de l'ancien projet pouvait encore appeler `setResult` et
`router.refresh()` dans le nouveau — et afficher le reçu d'un autre workspace.

Corrigé dans le formulaire, sans backend nouveau : chaque requête porte un jeton
`{generation, trackingKey}`. Le changement de projet incrémente la génération et **annule** la requête
en vol ; au retour, `isResponseApplicable()` compare le jeton émis à l'état courant et abandonne toute
réponse obsolète — `setResult`, `setOrigin`, `router.refresh()`, `busy` et le verrou inclus. La saisie
et la charge sont remises à zéro à la frontière de projet, pour qu'un contenu destiné au projet A ne
puisse pas être envoyé sous le projet B.

Vérifié par le test `transition A vers B pendant un POST lent : la réponse de A ne s’applique pas
dans B` : la réponse de A est bien produite (`status: "saved"`, `title: "Mission A"`) et
`isResponseApplicable` vaut `false` — donc rien de A ne s'affiche dans B.

---

## 5. Phase 3 — tests et commandes réellement exécutées

### Toolchain

Node 22.14.0 sous WSL Ubuntu-24.04
(`/home/michael_/.gemini/antigravity/scratch/tools/node/bin`), conforme au pin
`engines: node >=22.0.0 <23.0.0`. `engine-strict=true` a été **respecté** : aucun contournement.
`npm ci --no-audit --no-fund` dans cette copie isolée → exit 0.

Toute sortie canalisée vers `tail` a été capturée avec le **vrai** code de sortie de la commande, pas
celui de `tail` (runner jetable hors dépôt qui écrit le log puis relit `$?`).

### Commandes exécutées, résultats réels

| Commande | Résultat |
| :--- | :--- |
| `npm ci --no-audit --no-fund` | exit 0 |
| `node --test src/features/missions/development-mission-session.test.mjs src/server/auth/owner-api-session-guard.test.mjs` | **tests 38, pass 38, fail 0** — exit 0 |
| `node --test` sur les 6 suites qui posent `__ownerApiSessionTestResult` | **tests 69, pass 69, fail 0** — exit 0 |
| `node --test --test-reporter=spec src/server/auth/owner-api-session-guard.test.mjs` | 6/6 — exit 0 |
| `node --test --test-reporter=spec src/features/missions/development-mission-session.test.mjs` | 32/32 — exit 0 |

Aucun skip. Aucun échec. Aucun test rendu vert en désactivant une assertion.

### Les 4 gates globaux : délégués, non exécutés dans cette copie

`npm run typecheck`, `npm run lint`, `npm run build` et `npm run smoke:joris` **n'ont pas été exécutés
ici**, sur instruction explicite de Michael : ils seront passés une seule fois sur la branche
d'intégration assemblée, pour éviter que chaque agent les rejoue. Cette copie livre donc une
**correction ciblée validée par ses tests ciblés**, pas une livraison globale complète.

Ce que cela laisse ouvert, nommément : la vérification de types de ce diff
(`tsc --noEmit`) n'a pas tourné. Les deux modules TypeScript sont chargés et exécutés par les tests
via `jiti`, qui transpile sans vérifier les types ; un test charge en plus le composant corrigé pour
confirmer qu'il parse et que ses imports résolvent (`le formulaire se charge et consomme bien cette
logique`). C'est une preuve de syntaxe et de résolution, **pas** une preuve de typage.

### Ce qui n'a pas été vérifié

- Aucun test navigateur, mobile ou clavier. Les cas de reprise sont prouvés sur la logique que le
  formulaire exécute, pas sur un DOM rendu : il n'y a pas d'environnement DOM dans les dépendances du
  dépôt et le mandat n'autorise pas d'en ajouter une.
- Aucune exécution contre une base réelle. Les réponses serveur sont injectées via un `fetch` de test.
  **Les fixtures prouvent un contrat, jamais une exécution réelle.**
- La maquette de la décision « reprendre / nouvelle mission » n'est pas validée par Michael (§6).

---

## 6. Dépassements et contrats à trancher

### 6.1 Un fichier hors périmètre strict : `memory-production-write.test.mjs`

**Pourquoi c'était inévitable.** Son second test, `authenticated production memory writes fail before
touching the ephemeral store`, posait `__ownerApiSessionTestResult = null` **et**
`NODE_ENV = 'production'` pour prouver qu'une écriture mémoire authentifiée en production est refusée
par la garde de **persistance** (503 `memory_persistence_unavailable`) et non par l'authentification.
La garde de la phase 1 rend ces deux conditions incompatibles par construction : en production la
dérivation n'est plus lue, donc la route répondait 401 et le test devenait rouge.

**Ce qui a été fait.** La session propriétaire est désormais injectée en remplaçant le **module**
`@/server/auth/owner` via l'alias `jiti` — exactement le motif que le **premier test du même fichier**
utilise déjà. L'intention du test est intégralement conservée (503 sur les trois actions, puis 401
quand la session refuse), et il ne dépend plus d'une dérivation que la production doit ignorer.
Aucune assertion n'a été retirée ni affaiblie.

**Contrat proposé au coordinateur :** si ce fichier appartient à un autre périmètre, la modification
est isolée dans le commit et peut être reprise telle quelle ou refaite par son propriétaire ; la
garde de la phase 1 est indépendante de ce choix, mais le test restera rouge tant que le recâblage
n'est pas fait d'une façon ou d'une autre.

### 6.2 UI à valider avant intégration

La décision « Reprendre cette demande / Commencer une nouvelle mission » est une **affordance
nouvelle**, imposée par le mandat (« rendre reprise vs nouvelle mission explicites »). Elle réutilise
les classes, la palette et les tailles de cible existantes de la section, sans refonte esthétique.
Conformément à la règle « maquette à valider par Michael avant intégration UI », **cette présentation
reste à valider** : le comportement est figé par les tests, la forme ne l'est pas.

### 6.3 Hors mandat, non touché

Constats 2, 3, 5, 6, 7 et 8 de l'audit : non traités, par mandat. En particulier le suivi de coûts
(lot Cursor, corrigé et validé côté Michael) n'a pas été approché. Le backend et la vraie base
appartiennent à Antigravity. L'identification Hermes livrée en `b91b218` a été laissée en lecture
seule, sans relance de recherche.

---

## 7. Commit

Un seul commit, sur `claude/acces-reprise`, basé sur `e9ff840`. Aucune poussée, aucune fusion.

Le SHA exact est inscrit par le commit lui-même ; il est reporté dans le message de livraison de la
session et lisible par `git -C .claude/worktrees/claude-acces-reprise log -1`.

---

## 8. Autocritique

**Ce qui pourrait invalider ce travail.** La garde de la phase 1 repose sur `process.env.NODE_ENV`.
Si un déploiement ne pose pas `NODE_ENV=production` — ou si un runtime évalue la route dans un
contexte où la variable est absente — la dérivation redevient lisible. Le dépôt dépend déjà de cette
variable pour `get-arena-service.ts` et pour le fail-fast de `server-env.ts:126`, donc la correction
n'ajoute pas de dépendance nouvelle ; elle en hérite. Une garde indépendante de l'environnement
(supprimer la dérivation et injecter le module, comme §6.1 le fait désormais pour la mémoire) serait
plus forte, et sortait du périmètre « deux lignes » demandé.

**Scénario adverse vérifié.** J'ai cherché à faire tomber la phase 2 : un balayage exhaustif
(`aucun refus n'émet de requête`) parcourt les 5 intentions × 3 états de suivi × 2 états de saisie et
vérifie qu'aucun refus n'émet de requête **et** qu'aucune intention d'écriture ne produit jamais un
`GET` — c'est l'invariant exact du défaut d'origine. J'ai aussi vérifié que `outcome_unknown`,
`conflict` et `unavailable` restent **hors** des états qui offrent un renvoi : fabriquer une sortie
facile là aurait dévalué le seul signal qui bloque une relance aveugle.

**Ce qui demeure inconnu.** Le comportement réel en production n'a pas été observé (aucun déploiement).
Le rendu du formulaire corrigé n'a pas été vu dans un navigateur. Les quatre gates du dépôt n'ont pas
tourné dans cette copie, donc ce diff n'est pas type-vérifié : c'est la revue centrale qui le
qualifiera. Je ne déclare pas la livraison globale complète.

---

## 9. Rectificatif — lint bloquant et fuite de charge entre projets

Après le commit `13930e1`, deux défauts ont été relevés sur ce formulaire et corrigés.

**Lint.** `react-hooks/set-state-in-effect` (remise à zéro synchrone dans un effet) et
`react-hooks/refs` (`payload.current` lu pendant le rendu, 8 diagnostics). Corrigés à la racine, sans
`eslint-disable`, sans règle désactivée et sans microtask : le suivi de session est désormais lu **au
moment de l'action**, comme `openhands-launch.tsx` — plus aucune lecture de stockage au rendu, donc
plus d'écart d'hydratation possible ; l'effet restant ne fait que du nettoyage (annulation de la
requête en vol et invalidation de son ticket au démontage) ; et `frozen` sert au rendu là où la ref
était lue, la ref restant réservée aux actions.

**Fuite de charge entre projets.** La charge figée vivait dans une ref partagée par tous les projets.
Un enregistrement dans B pouvait donc poster l'identifiant et le contenu de A tout en inscrivant un
nouvel identifiant B dans `sessionStorage`. `DevelopmentMissionForm` est maintenant un enveloppe qui
rend une instance interne sous `key={workspaceId}` : le changement de projet démonte réellement
l'instance, état et refs inclus. Seul le `requestId` persistant subsiste, relu à l'action — revenir
en A propose une reprise explicite, jamais un envoi silencieux.

**Vérifications.** Elles sont le fait de **Codex**, en indépendant, sur un snapshot Linux natif
(base `c4659f1` plus ce diff) : 110 tests ciblés et dépendants passants, typecheck, lint (0 erreur,
5 avertissements préexistants), build et `smoke:joris`. Journaux dans
`Orchestrator/.validation/hq-candidate-native/`. De mon côté : `eslint` sur les fichiers touchés,
sortie vide, exit 0.

**Limites.** Les tests React ajoutés portent sur le **chargement du module et la clé d'instance**, pas
sur un rendu navigateur : le démontage par `key` est une garantie de React, non une observation faite
ici. Aucun test mobile ni clavier. Aucune mission réelle n'a été admise et ce rapport n'affirme pas
l'absence de bogues.
