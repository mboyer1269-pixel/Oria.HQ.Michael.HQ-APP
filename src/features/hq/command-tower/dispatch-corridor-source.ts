// src/features/hq/command-tower/dispatch-corridor-source.ts
//
// Bridges the execution-corridor contract (src/server/runtime/
// execution-corridors.ts) to the Command Tower dispatch board. Two parts:
//   - mapExecutionCorridorsToBoard: PURE mapping, exported for tests.
//   - loadRailCorridors: reads the real registries + environment, fail-closed —
//     any error returns null and the model renders "unavailable".
//
// The mapping never invents a status. A corridor is shown as live only when the
// contract says the Sentinelle would accept an intent on it AND the destination
// is configured; otherwise the guard's own sentence is what the operator reads.

import type { ExecutionCorridor } from "@/server/runtime/execution-corridor-contract";
import { listExecutionCorridors } from "@/server/runtime/execution-corridors";
import type { DispatchCorridor } from "./command-tower-model";

/** Why a declared destination is unusable, in the operator's words. */
const CONFIGURATION_NOTE: Record<string, string> = {
  destination_env_missing: "destination non configurée (variable d'environnement absente)",
  destination_url_invalid: "destination configurée mais l'URL est invalide",
  destination_hostname_not_allowed: "destination hors de la liste d'hôtes autorisés",
  destination_localhost_in_production: "destination localhost refusée en production",
};

function noteFor(corridor: ExecutionCorridor, liveCount: number): string {
  if (corridor.status === "blocked") {
    // Verbatim from the guard. Paraphrasing is how "unsupported skill" became
    // "seul corridor actif" in the first place.
    return `Bloqué par la Sentinelle : ${corridor.guard.reason}`;
  }
  if (corridor.status === "not_configured") {
    const why =
      CONFIGURATION_NOTE[corridor.webhook.configuration] ?? corridor.webhook.configuration;
    return `Éligible côté politique, mais ${why} (${corridor.webhook.destinationEnvKey}).`;
  }
  const others = liveCount - 1;
  const company =
    others === 0
      ? "Seul corridor éligible aujourd'hui."
      : `${liveCount} corridors éligibles aujourd'hui.`;
  return `${company} L'intent reste une proposition tant que le CEO n'approuve pas.`;
}

/** Pure mapping from contract corridors to dispatch-board corridors. */
export function mapExecutionCorridorsToBoard(
  corridors: readonly ExecutionCorridor[],
): DispatchCorridor[] {
  const liveCount = corridors.filter((corridor) => corridor.status === "eligible").length;

  return corridors.map((corridor) => ({
    id: `n8n_rail:${corridor.id}`,
    label: `n8n · ${corridor.id}`,
    mode:
      corridor.status === "eligible"
        ? ("governed_live" as const)
        : corridor.status === "not_configured"
          ? ("not_configured" as const)
          : ("blocked" as const),
    requiresApproval: true as const,
    action:
      corridor.status === "eligible"
        ? { label: "Préparer un intent (requires approval)", href: "/hq/agents" }
        : null,
    note: noteFor(corridor, liveCount),
  }));
}

/**
 * Loads the rail corridors for this render. Fail-closed: any error yields null
 * so the tower renders its honest "unavailable" placeholder rather than an
 * empty board, which an operator would read as "no corridor exists".
 */
export function loadRailCorridors(): DispatchCorridor[] | null {
  try {
    return mapExecutionCorridorsToBoard(listExecutionCorridors());
  } catch {
    return null;
  }
}
