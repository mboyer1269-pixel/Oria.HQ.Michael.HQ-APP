# HQ candidate public bridge — résultat

**Base :** `main@89b0deb`, copie isolée `.claude/worktrees/hq-candidate-public-bridge`.
**Mandat :** raccorder le parcours d'approbation propriétaire et le runner VPS existant
depuis le HQ public (Vercel), sans endpoint public nouveau, sans credential nouveau,
sans contourner un refus de sécurité. Aucune opération VPS/DB/env réelle/deploy/merge/push
dans ce lot. Aucun sous-agent. Revue indépendante par Antigravity (lecture seule) ; auteur
unique : cette session.

## 1. Diagnostic (inchangé depuis la première livraison, non refait)

`runner-executor-connection-probe.ts` (SSH vers le runner VPS) refuse inconditionnellement
sous tout marqueur cloud. `model-emission-launch-gate.ts` l'injecte dans `confirm_launch`, donc
depuis HQ public chaque confirmation échouait sur `account_identity_unverifiable`. Aucun
transport sûr existant ne comblait ce trou (voir rapport précédent pour le détail). Le dispatch
hôte proprement dit (`consume_pending`, `run_host_job` côté Orchestrator) reste hors accès de
cette copie ; ce rapport ne fait toujours aucune affirmation sur son état.

## 2. Corrections apportées sur cette reprise (suite à revue)

Trois défauts réels relevés sur la première livraison, tous corrigés avec tests :

**a) Aucun lien à la politique/version de runner approuvée.** Ni le binding de consommation ni
la ligne persistée ne portaient de digest de politique. Une preuve pouvait rester « valide »
(workspace/provider/runner/container identiques) même après un changement de politique
d'exécution (image, permission policy) sur le runner approuvé — fraîche dans le temps, obsolète
par rapport à la politique. Vérifié : le gate (`model-emission-launch-gate.ts` /
`model-emission-gate.ts`) ne fait **aucun** lien entre `catalogRevision`/`policySha256` et la
preuve de connexion elle-même — ce n'était donc pas déjà assuré, pas de test « déjà couvert » à
produire. Correction : `evidenceRowSchema` porte maintenant `policySha256` (hex64) ; la lecture
compare ce digest contre `providerProfile.policySha256` lu **en direct** depuis
`ORIA_OPENHANDS_LAUNCH_CONFIG` — le même digest canonique que lit déjà
`model-emission-launch-gate.ts`, jamais une seconde autorité indépendante — et refuse
(`policy_mismatch`) sur tout désaccord, y compris quand le binding approuvé lui-même ne nomme
plus le runner actuellement canonique (`policy_unavailable` si aucune config canonique n'est
résoluble). L'écriture opérateur refuse aussi sans `policySha256` valide.

**b) Script d'écriture : identité libre et horodatage après coup.** `runnerId` était un argument
CLI libre, jamais lié à une configuration réelle ; `checkedAtIso` était capturé **après** l'appel
au probe, ce qui aurait daté une vérification plus ancienne comme plus fraîche qu'elle ne l'était
réellement. Correction : une nouvelle fonction testée, `recordFromLiveRunnerProbe`, lit le
binding SSH **une seule fois**, construit le runner et le probe à partir de cette même lecture
(un binding modifié en cours d'exécution ne peut plus produire un conteneur enregistré différent
de celui réellement sondé), capture `checkedAtIso` **avant** d'invoquer le probe, et tire
`runnerId`/`policySha256` de la même configuration canonique — plus aucun argument libre. Le
script `.mjs` n'est plus qu'un appel fin à cette fonction. La sonde SSH reste inchangée et
toujours refusée sous marqueur cloud (régression vérifiée, §4).

**c) Commentaires narratifs.** L'historique des brouillons rejetés et les justifications
génériques ont été retirés du module ; les commentaires restants portent uniquement sur le
contrat et ses limites.

**TTL.** Le plafond dur du schéma est passé de 24 h à **1 h** ; la documentation et l'exemple
recommandent un TTL pilote court (**60 s**), jamais revendiqué comme preuve de lancement — une
preuve persistée, même fraîche, ne remplace jamais la confirmation ACP fraîche exigée de
l'exécutant juste avant le prompt.

## 3. Fichiers (mis à jour depuis la première livraison)

| Fichier | État | Rôle |
| :--- | :--- | :--- |
| `src/server/agents/models/runner-connection-evidence.ts` | réécrit | binding, lien de politique canonique, lecture, écriture primitive, orchestration `recordFromLiveRunnerProbe`, probe persisté |
| `src/server/agents/models/runner-connection-evidence.test.mjs` | réécrit | 29 tests (voir §4) |
| `src/scripts/runner-connection-evidence-record.mjs` | réécrit | wrapper fin sur `recordFromLiveRunnerProbe` — `<workspaceId> <recordedBy>`, plus de `runnerId` libre |
| `db/migrations/0031_runner_connection_evidence.sql` | modifié | ajoute `policy_sha256` (hex64, contrainte) — **candidate uniquement, jamais appliquée** |
| `src/server/db/types.ts` | modifié | ajoute `policy_sha256` à la ligne `provider_connection_evidence` |
| `docs/RUNNER-PROBE-OPERATOR-CONFIG.md` | modifié | activation mise à jour (script 2 arguments, exemple TTL 60 s, exigence `ORIA_OPENHANDS_LAUNCH_CONFIG` côté opérateur) |
| `src/server/missions/model-emission-launch-gate.ts`, `.test.mjs` | inchangés depuis la première livraison | sélection de transport explicite, non re-testés ici car non modifiés (cf. consigne « ne pas rejouer sans modification ») |

## 4. Tests réels (suite ciblée, non rejouée globalement sauf confirmation finale)

```
node --test --test-reporter=spec src/server/agents/models/runner-connection-evidence.test.mjs
→ tests 29   pass 29   fail 0
```

Nouveautés de cette reprise, nommément :
- **preuve fraîche, bonne identité, mauvaise politique → `policy_mismatch`.**
- **aucune config canonique résoluble → `policy_unavailable`**, avant toute requête Supabase.
- **binding approuvé dont le runner ne correspond plus au runner canonique → `policy_mismatch`**,
  avant toute requête Supabase.
- **une seule lecture du binding SSH** pendant toute l'écriture (compteur d'appels vérifié),
  même si le probe est invoqué après — un binding changé en cours d'exécution ne peut pas
  produire un désaccord entre ce qui est enregistré et ce qui a été réellement sondé.
- **`checkedAtIso` capturé avant le probe**, pas après — vérifié avec une horloge et un probe
  artificiellement lents.
- **aucun binding SSH approuvé → refus, probe jamais invoqué** (compteur à 0).
- **aucune config canonique → refus avant même de lire le binding SSH** (compteur à 0).

Confirmation finale (suite complète, pour vérifier l'absence de régression après ces
changements, exécutée une fois) :

```
npm run test → tests 4490   pass 4482   fail 0   skip 8 (préexistants)
npm run typecheck / lint (0 erreur, 9 avertissements préexistants) / build / smoke:joris → tous verts
```

**Portée des tests, explicite.** Tout ce qui précède mocke le client Supabase (objet JS en
mémoire, voir `fakeSupabase()`) et relit le texte SQL de la migration par expression régulière.
**Rien ici ne prouve le comportement RLS réel de Postgres** : cela exige la migration réellement
appliquée sur une vraie base et une tentative d'accès authentifiée en tant que rôle `anon`, ce
que cette copie ne fait pas et ne peut pas faire sans toucher une base réelle (hors mandat).

## 5. Activation exacte

1. Sur l'hôte opérateur (clé SSH + `ORIA_OPENHANDS_RUNNER_PROBE_CONFIG_FILE` déjà présents) :
   `ORIA_OPENHANDS_LAUNCH_CONFIG` doit aussi y être résoluble (même JSON que HQ public).
   ```sh
   ORIA_OPENHANDS_RUNNER_PROBE_CONFIG_FILE=/chemin/binding-ssh.json \
   ORIA_OPENHANDS_LAUNCH_CONFIG='{...}' \
   node src/scripts/runner-connection-evidence-record.mjs <workspaceId> <recordedBy>
   ```
2. Sur HQ public : `ORIA_OPENHANDS_CONNECTION_EVIDENCE_TRANSPORT=persisted` et
   `ORIA_OPENHANDS_CONNECTION_EVIDENCE_BINDING=…` avec `"maxEvidenceAgeMs":60000` (pilote court).

## 6. Ce qui manque encore pour un `confirm_launch` réel depuis HQ public — liste complète, pas un seul item

Ce code ne suffit pas seul. Dans l'ordre où chaque pièce devient nécessaire :

1. **Migration 0031 appliquée** sur la vraie base (non fait ici).
2. **Binding SSH opérateur réellement écrit et approuvé** (`ORIA_OPENHANDS_RUNNER_PROBE_CONFIG_FILE`,
   fichier réel, approbation réelle) — n'existe pas encore dans cette session.
3. **Binding de consommation évidence réellement écrit et approuvé**
   (`ORIA_OPENHANDS_CONNECTION_EVIDENCE_BINDING`) — idem, pas encore produit.
4. **Publication réelle et fraîche** : exécuter le script contre le **vrai** VPS, pas un fixture —
   jamais fait dans cette session, nécessite la clé SSH réelle.
5. **`ORIA_ENABLE_OPENHANDS_CONFIRMATION=1` / `ORIA_ENABLE_OPENHANDS_LAUNCH=1` /
   `ORIA_OPENHANDS_LAUNCH_CONFIG` réels** sur le déploiement — constatés absents/désactivés en
   production au départ de ce mandat ; rien dans ce lot ne les active.
6. **Source de la mission à jour et approbation CEO correspondante déjà persistées** pour la
   mission durable ciblée — pas établi par cette session.
7. **Transport effectivement sélectionné** (`ORIA_OPENHANDS_CONNECTION_EVIDENCE_TRANSPORT=persisted`)
   sur le déploiement Vercel réel — pas fait (aucune variable d'environnement réelle modifiée).
8. **Dispatch hôte et ouverture du résultat dans Atelier** — dépend du pipeline hôte complet
   (hors accès vérifié de cette copie) ; ce rapport ne prétend pas que ce lot y suffit.

Rien de tout cela n'est fait, approuvé ou vérifié par cette session. Le code et ses tests
(mockés, pas RLS/DB réels) sont la seule chose livrée ici.

## 7. Hors périmètre, explicitement

Aucune opération VPS, aucune variable d'environnement réelle modifiée, aucune application de
migration, aucun commit, aucune fusion, aucun push, aucun sous-agent. La mission durable
`4b8e9cf3-fd95-5599-9d01-5b5ae53c2ba8` n'a été ni approuvée ni exécutée par cette session.
