// src/features/hq/command-tower/dispatch-corridor-source.ts
//
// Projects the execution-corridor contract onto the Command Tower dispatch
// board. Two parts:
//   - mapExecutionCorridorsToBoard: pure mapping, exported for tests.
//   - loadRailCorridors: reads the real registries and environment; any error
//     is logged and returns null, which the model renders as "unavailable".
//
// The mapping never invents a status. A corridor reads as live only when the
// contract reports that all three ends agree — policy, receiver, configuration.

import { logger } from "@/lib/logger";
import type {
  CorridorStatus,
  ExecutionCorridor,
} from "@/server/runtime/execution-corridor-contract";
import { listExecutionCorridors } from "@/server/runtime/execution-corridors";
import type { WebhookConfigurationState } from "@/server/runtime/webhook-registry";
import type { DispatchCorridor, DispatchCorridorMode } from "./command-tower-model";

/**
 * Why a declared destination is unusable, in the operator's words. Exhaustive
 * over the state union: a new state forces a translation here rather than
 * falling through to a raw identifier on screen.
 */
const CONFIGURATION_NOTE: Record<WebhookConfigurationState, string> = {
  configured: "destination configurée",
  destination_env_missing: "destination non configurée (variable d'environnement absente)",
  destination_url_invalid: "destination configurée mais l'URL est invalide",
  destination_hostname_not_allowed: "destination hors de la liste d'hôtes autorisés",
  destination_localhost_in_production: "destination localhost refusée en production",
  static_secret_missing: "secret de transfert absent (N8N_SECRET)",
  signing_secret_missing: "secret de signature absent (AGENT_WEBHOOK_SIGNING_SECRET)",
};

const MODE_BY_STATUS: Record<CorridorStatus, DispatchCorridorMode> = {
  eligible: "governed_live",
  blocked: "blocked",
  receiver_rejects: "receiver_rejects",
  not_configured: "not_configured",
};

/**
 * How an intent is prepared today. There is no UI for it: /hq/agents lists and
 * approves existing intents and is bound to a single agent, so a button
 * claiming to prepare one would not.
 */
const PREPARATION_SURFACE = "POST /api/agents/:agentId/execution-intents";

function noteFor(corridor: ExecutionCorridor, liveCount: number): string {
  switch (corridor.status) {
    case "blocked":
      return `Bloqué par la Sentinelle : ${corridor.guard.reason}`;
    case "receiver_rejects":
      return (
        `Autorisé côté Oria, refusé par le récepteur n8n : le workflow déployé n'accepte pas ` +
        `la route ${corridor.id}. Un intent approuvé échouerait en validation_error.`
      );
    case "not_configured":
      return `Accepté aux deux bouts, mais ${CONFIGURATION_NOTE[corridor.webhook.configuration]}.`;
    case "eligible": {
      const company =
        liveCount === 1
          ? "Seul corridor éligible aujourd'hui."
          : `${liveCount} corridors éligibles aujourd'hui.`;
      return (
        `${company} Préparation via ${PREPARATION_SURFACE} ; l'intent reste une proposition ` +
        `tant que le CEO n'approuve pas.`
      );
    }
    default: {
      const exhaustive: never = corridor.status;
      throw new Error(`unmapped corridor status: ${String(exhaustive)}`);
    }
  }
}

/** Pure mapping from contract corridors to dispatch-board corridors. */
export function mapExecutionCorridorsToBoard(
  corridors: readonly ExecutionCorridor[],
): DispatchCorridor[] {
  const liveCount = corridors.filter((corridor) => corridor.status === "eligible").length;

  return corridors.map((corridor) => ({
    id: `n8n_rail:${corridor.id}`,
    label: `n8n · ${corridor.id}`,
    mode: MODE_BY_STATUS[corridor.status],
    requiresApproval: true as const,
    // No screen prepares an intent, so no corridor offers an action control.
    // The note names the API surface that does.
    action: null,
    note: noteFor(corridor, liveCount),
  }));
}

/**
 * Loads the rail corridors for this render. Fail-closed: any error is logged and
 * yields null, so the tower renders its "unavailable" placeholder rather than an
 * empty board, which an operator would read as "no corridor exists".
 */
export function loadRailCorridors(): DispatchCorridor[] | null {
  try {
    return mapExecutionCorridorsToBoard(listExecutionCorridors());
  } catch (error) {
    // listExecutionCorridors reads registries, licences and the guard; a throw
    // means a real defect, and the operator only sees "indisponible".
    logger.error("hq.command-tower.rail-corridors.failed", {
      reason: error instanceof Error ? error.message : "unknown",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return null;
  }
}
