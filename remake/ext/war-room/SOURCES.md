# SOURCES — état affiché ↔ source backend (main `ac34e85`)

Règle : un état sans source s'affiche « non branché » / « non instrumenté » ; toute donnée de démo porte « exemple ». Aucune logique backend n'est modifiée par cette branche.

## Approbation au payload exact
| Élément affiché | Source | Statut |
|---|---|---|
| Empreinte `payloadHash` (reçu de dispatch) | `src/server/orchestration/paperclip-dispatch.ts:10` | réel |
| `confirmedBy` (qui a confirmé) | `src/server/orchestration/paperclip-dispatch-store.ts:35` | réel |
| `payloadHash` / `launchHash` OpenHands | `src/core/openhands-launch-contract.ts:54` | réel |
| `sandbox_unavailable` | `src/server/atelier/atelier-mission.ts:642`, `src/app/api/atelier/missions/handlers.ts:29` | réel (atelier) |
| `approveUnsandboxed` | `src/app/api/atelier/missions/handlers.ts:116`, `.../[missionId]/verify/route.ts:9` | réel (atelier) |
| Double verrou kill-switch + `confirm:true` | PR #420 `src/server/permissions/risky-action-gate.ts` (non fusionnée, non câblée) | proposé |
| File d'approbations transverse, expiration, diff, journal qui/quand/canal | aucune source | non instrumenté (gabarit exemple) |
| Empreinte affichée dans la maquette | SHA-256 calculé dans le navigateur sur le payload exemple | maquette |

## Vie de mission
| État | Source | Statut |
|---|---|---|
| draft, queued, running, needs_approval, completed, failed, cancelled | `src/core/types.ts:192-199` (`MissionStatus`, 7 valeurs, « no runtime wiring yet ») | type réel, non câblé au runtime |
| outcome_unknown | `src/scripts/development-mission.mjs:14` (CLI uniquement) ; réponses 503 `src/app/api/missions/development/handlers.ts:13` | partiel |
| waiting_approval | aucune source | non instrumenté |
| worker bloqué / dernier signal (heartbeat) | aucune source | non instrumenté |
| annulation en cours / annulée confirmée / non confirmée | aucune source | non instrumenté |
| « résultat non vérifié » | `independentValidationPassed` lu par `src/app/hq/atelier/page.tsx` | réel (lecture) |
| Pendant ton absence (décisions, inconnus, dépenses) | aucune source | non branché |

## Coûts et quotas
| Élément | Source | Statut |
|---|---|---|
| Claude (brûlage tokens, restant « non rapporté ») | PR #419 `src/server/ai/subscription-quota.ts` (non fusionnée) | proposé, mesuré |
| Codex `rate_limits.used_percent` | PR #419 | proposé, mesuré |
| Cursor, Gemini | aucune source | non branché |
| Source d'auth « vue à l'initialisation » | aucune source | non instrumenté |
| `costMicroUsd`, `traceId` | absents de `src/` sur main | non branché |
| « aucun appel d'API payante » | garde-fou de politique (pas de clé API) | seul affichage réel |

## Proposition (aucun code) : table `mission_events`
| Champ | Type | Rôle |
|---|---|---|
| id | uuid pk | |
| workspace_id | uuid | isolation |
| mission_id | uuid | rattachement |
| seq | bigint | ordre strict par mission |
| state | text (MissionStatus + waiting_approval, outcome_unknown, cancel_requested, cancel_unconfirmed) | état |
| trace_id | text | corrélation, cliquable |
| payload_hash | char(64) | empreinte exacte approuvée/exécutée |
| approved_by / channel | text / text (screen, voice, cli) | journal Sentinelle |
| approval_expires_at | timestamptz | expiration |
| cost_micro_usd | bigint null | coût, null = non mesuré |
| cost_kind | text (measured, estimated) | badge |
| provider | text | claude, codex, cursor, gemini |
| source | text | fichier/route émetteur |
| worker_signal_at | timestamptz | dernier signal |
| created_at | timestamptz | |

## Mise à jour : source sur main vs source dans #425 (non fusionnée)
**Source sur main (`ac34e85`) — seule base de l'écran Approbation :** reçus de dispatch `payloadHash` (`src/server/orchestration/paperclip-dispatch.ts:10`), `confirmedBy` (`src/server/orchestration/paperclip-dispatch-store.ts:35`), `payloadHash`/`launchHash` (`src/core/openhands-launch-contract.ts:54`). Journal possible : `governance_decisions` (`db/migrations/0008`, l. 40), `events` (`0017`, l. 22) → affiché « non vérifié ».

**Source dans #425, non fusionnée, brouillon bloqué (P0 : un client peut forger `approval_granted`)** — https://github.com/mboyer1269-pixel/Oria.HQ.Michael.HQ-APP/pull/425 (`db/migrations/0037_mission_events.sql`, `src/core/mission-events-contract.ts`, `docs/architecture/MISSION-EVENTS-SPEC.md`) :
- `event_type` : mission_queued, mission_started, step_started, tool_call_completed, run_cost_recorded, approval_requested, approval_granted, approval_rejected, approval_consumed, payload_changed, mission_blocked, mission_cancelled, mission_succeeded, mission_failed, outcome_unknown.
- `state` : queued, running, waiting_approval, approved, approval_stale, blocked, cancelled, succeeded, failed, outcome_unknown.
- `cost_micro_usd` + `cost_source` (measured | estimated, CHECK cohérence) → la maquette somme mesuré et estimé séparément.
- `payload_hash`, `expires_at`, `grant_id` requis sur approval_requested/granted/consumed ; vue `mission_approval_status` → « approbation périmée ».
- CHECK `mission_events_voice_no_irreversible_approval` : voice interdit pour external_send, payment, merge, delete.
- Capacités de la liste fermée : repo.read, repo.write_branch, test.run, build.run, llm.subscription, harness_change, unsandboxed ; tout le reste = gabarit « Nouvelle capacité », accord valable une seule fois.
- La proposition de table plus haut est remplacée par ce contrat #425.

Origine de l'accord : affichée « non vérifié » tant qu'un accord n'est pas prouvé émis côté serveur ; jamais affichée comme valide.

## Constats Sentinelle sur #425 (affichés sur l'écran Approbation)
- Expiration mesurée à l'heure du serveur, pas à `occurred_at`.
- Voix : liste blanche (et non liste noire comme le CHECK actuel de #425).
- `approval_granted` valide seulement si actor = utilisateur connecté (humain) ET précédé d'un `approval_requested` ; sinon « accord non valide ». La maquette ne peut le prouver : elle affiche toujours « accord non valide » / origine « non vérifié ».
