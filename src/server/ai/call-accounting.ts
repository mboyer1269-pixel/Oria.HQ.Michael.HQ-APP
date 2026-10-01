import type { RoutingCostKind } from "@/core/types";

/**
 * Process-local journal for routing and provider attempts.
 * It is not a budget, not a reservation ledger, and not durable.
 * `chooseModel` may append an estimation. It must not add that weight to a spend store.
 *
 * Durable budget is not implemented. A shared HQ migration would be required
 * before any claim of a persisted budget. Proposed contract, not a table:
 *   hq_model_call_cost (
 *     workspace_id, attempt_id, kind, chosen_model_id, executed_model_id,
 *     input_tokens, output_tokens, monetary_usd null, provider_request_reached,
 *     created_at
 *   )
 * monetary_usd null means unknown, not zero. No row is written by this module.
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

const log: CallAccountingEvent[] = [];

export function recordCallAccounting(event: CallAccountingEvent): CallAccountingEvent {
  log.push(event);
  return event;
}

export function getCallAccountingLog(workspaceId?: string): readonly CallAccountingEvent[] {
  if (!workspaceId) return log.slice();
  return log.filter((event) => event.workspaceId === workspaceId);
}

export function clearCallAccountingLog(): void {
  log.length = 0;
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
