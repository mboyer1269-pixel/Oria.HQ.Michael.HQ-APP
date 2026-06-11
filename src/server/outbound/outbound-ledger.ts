// ---------------------------------------------------------------------------
// Outbound Ledger Adapter — maps Send Desk events to the Action Ledger
// ---------------------------------------------------------------------------
// Production wiring (static `@/` import — not node-tested; the service and
// bridge are tested with injected fakes). Mirrors green-lane-ledger.ts.
//
// autonomyLevel 0: the CEO personally triggers every send (`ceo_single_send`).
// requiresConfirmation false: the click IS the confirmation.
// ---------------------------------------------------------------------------

import type { WorkspaceContext } from "@/core/workspace-context";
import { recordLedgerEvent } from "@/server/actions/ledger-events";
import type { LiveLedgerEventInput } from "./outbound-executor-live.ts";

export function createOutboundLedgerWriter(ctx: WorkspaceContext) {
  return async (event: LiveLedgerEventInput): Promise<{ ledgerEventId: string }> => {
    const entry = await recordLedgerEvent(ctx, {
      eventType: event.eventType,
      actionType: event.actionType,
      summary: event.summary,
      autonomyLevel: 0,
      requiresConfirmation: false,
      workspaceId: event.workspaceId,
      agentId: "agent_hermes",
      effect: {
        kind: event.eventType === "action" ? "external_call" : "runtime_result",
        operation: "send",
        target: "send_desk",
      },
      metadata: event.metadata,
    });
    return { ledgerEventId: entry.id };
  };
}
