# Contrat de données — écran Atelier (`atelier-mission/v1`)

Destinataire : agent Oria Design. Source : `src/server/atelier/atelier-mission.ts`.
Exemple réel complet : `docs/atelier-e1-d-evidence/mission.json` (mission exécutée le 2026-10-25).

## Endpoints (lecture seule, propriétaire uniquement — `requireOwnerApiSession`)
| Méthode | Chemin | Réponse |
|---|---|---|
| GET | `/api/atelier/missions` | `{ contract: "atelier-mission-list/v1", missions: MissionView[] }` triées par `updatedAt` desc |
| GET | `/api/atelier/missions/:missionId` | `MissionView` ou 404 `{ error }` |
| GET | `/api/atelier/missions/:missionId/artifacts/:artifactId` | octets bruts ; en-têtes `content-type`, `x-artifact-sha256` |

401/403 si pas de session propriétaire. Aucun endpoint d'écriture : lancer/reprendre se fait aujourd'hui via
`node src/scripts/atelier/mission.mjs` (opérateur local). Stockage : `$ORIA_ATELIER_ROOT` (défaut `~/.oria-atelier/missions/<id>/`).

## MissionView
```ts
{
  contract: "atelier-mission/v1";
  id: string;            // UUID
  title: string; need: string;               // besoin exprimé
  createdAt: string; updatedAt: string;      // ISO-8601 UTC (afficher en heure locale)
  status: "created" | "running" | "interrupted" | "awaiting_review" | "failed" | "blocked";
  runtime: { runtimeId: "codex"; consumptionMode: "subscription"; authMode: "chatgpt_session"; requestedModelId: string };
  repo: { path: string; baseBranch: string; branch: string; baseSha: string; headSha: string };
  sessionId: string | null;                  // fil Codex courant (reprise)
  lock: { runnerPid: number; childPid: number | null; stepId: string; since: string } | null; // non nul = en cours
  steps: Step[];                             // ordre chronologique
  artifacts: Artifact[];
  modelProof: { requested: string; observed: string | null; matches: boolean };
}
Step = {
  id: string; kind: "spec" | "code" | "test" | "preview" | "revision";
  status: "running" | "succeeded" | "failed" | "interrupted" | "blocked";
  startedAt: string; endedAt: string | null;
  executor: "codex_cli" | "runner";          // runner = vérification exécutée par Oria, pas déclarée par l'agent
  sessionId: string | null; resumedFrom: string | null;   // resumedFrom non nul ⇒ badge « reprise »
  requestedModelId: string | null; observedModelId: string | null; // observé = lu dans la session CLI
  exitCode: number | null;
  reason: string | null;   // runner_died | signal_SIGKILL | subscription_quota | codex_nonzero_exit
  commitSha: string | null;
}
Artifact = { id: string; kind: "spec" | "diff" | "test_log" | "preview" | "transcript" | "commit";
  stepId: string; path: string; sha256: string; bytes: number; createdAt: string }
```

## Règles d'affichage
- `status` → libellés FR : created « Créée », running « En cours », interrupted « Interrompue — reprise possible »,
  awaiting_review « À relire », failed « Échec », blocked « Bloquée (abonnement/quota) ».
- `modelProof.matches === false` avec `observed` non nul ⇒ alerte rouge (modèle substitué). `observed === null` ⇒ « non prouvé ».
- Les étapes `executor: "runner"` (tests, aperçu) sont des preuves ; les messages de l'agent (transcript) n'en sont pas.
- Artefact `preview` `.png` ⇒ image ; `.diff` ⇒ vue diff ; `test_log` ⇒ bloc monospace ; `transcript` (JSONL Codex) ⇒ repliable.
- Aucune donnée démo : liste vide ⇒ « Aucune mission atelier locale ».
- Un panneau minimal existe déjà : `src/features/atelier/components/atelier-local-missions.tsx` (inséré dans `/hq/atelier`).
