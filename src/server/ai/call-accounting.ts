import type { RoutingCostKind } from "@/core/types";

/**
 * Process-local journal for routing and provider attempts.
 * It is not a budget, not a reservation ledger, and not durable.
 * `chooseModel` may append an estimation. It must not add that weight to a spend store.
 *
 * Durable monetary budget is not implemented in this journal. Relative weights
 * are routing metrics, not a reserve and not dollars. The provider ledger in
 * db/migrations/0028_call_reservation.sql holds integer USD cents from a
 * server quote only when HQ_CALL_RESERVATION=1 and both a ceiling row and a
 * reliable quote exist. It does not convert weights and it does not cap a
 * provider invoice. This module still writes no row.
 */

export const DURABLE_BUDGET_IMPLEMENTED = false;

export type CallAccountingEvent = {
  kind: RoutingCostKind;
  workspaceId: string;
  agentId?: string;
  chosenModelId?: string;
  executedModelId?: string | null;
  relativeWeight?: number;
  monetaryUsd: null;
  networkRequestSent: boolean;
  note: string;
};

/**
 * One journal per process. Jiti can evaluate this file twice when the alias
 * path and the absolute path differ, which Windows does not collapse.
 * Both evaluations must read and clear the same array.
 */
const JOURNAL = Symbol.for("oria.hq.callAccountingJournal");

function journal(): CallAccountingEvent[] {
  const host = globalThis as typeof globalThis & { [JOURNAL]?: CallAccountingEvent[] };
  const existing = host[JOURNAL];
  if (existing) return existing;
  const created: CallAccountingEvent[] = [];
  host[JOURNAL] = created;
  return created;
}

export function recordCallAccounting(event: CallAccountingEvent): CallAccountingEvent {
  const log = journal();
  log.push(event);
  return event;
}

export function getCallAccountingLog(workspaceId?: string): readonly CallAccountingEvent[] {
  const log = journal();
  if (!workspaceId) return log.slice();
  return log.filter((event) => event.workspaceId === workspaceId);
}

export function clearCallAccountingLog(): void {
  journal().length = 0;
}

/** No hold. Selection and refusal do not reserve money. */
export function reservationNotImplemented(workspaceId: string): {
  implemented: false;
  effect: "none";
  monetaryUsd: null;
  workspaceId: string;
} {
  return { implemented: false, effect: "none", monetaryUsd: null, workspaceId };
}
