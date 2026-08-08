import "server-only";

import type { AgentExecutionIntent } from "@/features/agents/execution-intent";
import {
  THEATRE_LEDGER_LIMIT,
  deriveLedgerTone,
  type TheatreLedgerLine,
  type TheatrePendingIntent,
  type TheatreSseEvent,
} from "@/features/hq/theatre/theatre-events";
import { extractEstimatedCostFromIntentData } from "@/server/michael-hq/telemetry-extract";
import { listActionLedgerForWorkspace } from "@/server/actions/action-ledger-read";
import { listPendingAgentExecutionIntents } from "@/server/agents/execution-intent-repository";

export type TheatrePollSnapshot = {
  workspaceId: string;
  ledgerSource: "supabase" | "local";
  ledger: TheatreLedgerLine[];
  intents: TheatrePendingIntent[];
};

export function mapLedgerEntryToTheatreLine(entry: {
  id: string;
  summary: string;
  eventType?: string | null;
  agentId?: string | null;
  skillId?: string | null;
  actionType?: string | null;
  autonomyLevel?: number | null;
  createdAt: string;
}): TheatreLedgerLine {
  return {
    id: entry.id,
    summary: entry.summary,
    eventType: entry.eventType ?? null,
    agentId: entry.agentId ?? null,
    skillId: entry.skillId ?? null,
    actionType: entry.actionType ?? null,
    autonomyLevel: entry.autonomyLevel ?? null,
    createdAt: entry.createdAt,
    tone: deriveLedgerTone({ eventType: entry.eventType, summary: entry.summary }),
  };
}

export function mapIntentToTheatrePending(intent: AgentExecutionIntent): TheatrePendingIntent | null {
  if (intent.status !== "pending") return null;
  const data = intent.payload?.data as Record<string, unknown> | undefined;
  const estimated = extractEstimatedCostFromIntentData(data);
  return {
    intentId: intent.intentId,
    agentId: intent.agentId,
    skillId: intent.skillId,
    toolName: intent.toolName,
    autonomyLevel: intent.autonomyLevel,
    status: "pending",
    createdAt: intent.createdAt,
    actionType: intent.payload?.actionType,
    client: intent.payload?.client,
    ...(estimated
      ? {
          estimatedCostUsd: estimated.totalUsd,
          estimatedCostCents: estimated.totalCents,
          telemetryModelId: estimated.modelId,
        }
      : {}),
  };
}

export async function loadTheatrePollSnapshot(workspaceId: string): Promise<TheatrePollSnapshot> {
  const [ledgerResult, pending] = await Promise.all([
    listActionLedgerForWorkspace({ workspaceId, limit: THEATRE_LEDGER_LIMIT }),
    listPendingAgentExecutionIntents(workspaceId),
  ]);

  return {
    workspaceId,
    ledgerSource: ledgerResult.source,
    ledger: ledgerResult.entries.map((entry) =>
      mapLedgerEntryToTheatreLine({
        id: entry.id,
        summary: entry.summary,
        eventType: entry.eventType,
        agentId: entry.agentId,
        skillId: entry.skillId,
        actionType: entry.actionType,
        autonomyLevel: entry.autonomyLevel,
        createdAt: entry.createdAt,
      }),
    ),
    intents: pending
      .map(mapIntentToTheatrePending)
      .filter((intent): intent is TheatrePendingIntent => intent !== null),
  };
}

/**
 * Diff two snapshots into discrete SSE events. Pure — no I/O.
 * Ledger is append-oriented (new ids only). Intents upsert/remove by intentId.
 */
export function diffTheatreSnapshots(
  previous: TheatrePollSnapshot | null,
  next: TheatrePollSnapshot,
  emittedAt: string,
): TheatreSseEvent[] {
  if (!previous) {
    return [
      {
        type: "ledger.snapshot",
        workspaceId: next.workspaceId,
        source: next.ledgerSource,
        entries: next.ledger,
        emittedAt,
      },
      {
        type: "intent.snapshot",
        workspaceId: next.workspaceId,
        intents: next.intents,
        emittedAt,
      },
    ];
  }

  const events: TheatreSseEvent[] = [];
  const knownLedgerIds = new Set(previous.ledger.map((entry) => entry.id));

  // Newest-first list: append events in chronological order for the terminal.
  const newLedger = next.ledger.filter((entry) => !knownLedgerIds.has(entry.id));
  for (const entry of [...newLedger].reverse()) {
    events.push({
      type: "ledger.append",
      workspaceId: next.workspaceId,
      entry,
      emittedAt,
    });
  }

  const prevIntentIds = new Set(previous.intents.map((intent) => intent.intentId));
  const nextIntentIds = new Set(next.intents.map((intent) => intent.intentId));

  for (const intent of next.intents) {
    if (!prevIntentIds.has(intent.intentId)) {
      events.push({
        type: "intent.upsert",
        workspaceId: next.workspaceId,
        intent,
        emittedAt,
      });
    }
  }

  for (const intentId of prevIntentIds) {
    if (!nextIntentIds.has(intentId)) {
      events.push({
        type: "intent.remove",
        workspaceId: next.workspaceId,
        intentId,
        emittedAt,
      });
    }
  }

  return events;
}
