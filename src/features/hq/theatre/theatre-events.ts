/**
 * Pure contracts for the Command Tower Execution Theatre SSE feed.
 * No I/O — shared by the API route and client parsers.
 */

export type TheatreLedgerLine = {
  id: string;
  summary: string;
  eventType: string | null;
  agentId: string | null;
  skillId: string | null;
  actionType: string | null;
  autonomyLevel: number | null;
  createdAt: string;
  /** Derived UI tone for the cyber terminal palette. */
  tone: TheatreLineTone;
};

export type TheatrePendingIntent = {
  intentId: string;
  agentId: string;
  skillId: string;
  toolName: string;
  autonomyLevel: number;
  status: "pending";
  createdAt: string;
  actionType?: string;
  client?: string;
  estimatedCostUsd?: number;
  estimatedCostCents?: number;
  telemetryModelId?: string;
};

export type TheatreLineTone = "neon" | "amber" | "red" | "neutral";

export type TheatreSseEvent =
  | { type: "hello"; workspaceId: string; emittedAt: string }
  | { type: "heartbeat"; emittedAt: string }
  | {
      type: "ledger.snapshot";
      workspaceId: string;
      source: "supabase" | "local";
      entries: TheatreLedgerLine[];
      emittedAt: string;
    }
  | {
      type: "ledger.append";
      workspaceId: string;
      entry: TheatreLedgerLine;
      emittedAt: string;
    }
  | {
      type: "intent.snapshot";
      workspaceId: string;
      intents: TheatrePendingIntent[];
      emittedAt: string;
    }
  | {
      type: "intent.upsert";
      workspaceId: string;
      intent: TheatrePendingIntent;
      emittedAt: string;
    }
  | {
      type: "intent.remove";
      workspaceId: string;
      intentId: string;
      emittedAt: string;
    }
  | { type: "error"; message: string; emittedAt: string };

export const THEATRE_POLL_INTERVAL_MS = 2_000;
export const THEATRE_LEDGER_LIMIT = 24;

export function encodeTheatreSse(event: TheatreSseEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function deriveLedgerTone(input: {
  eventType?: string | null;
  summary?: string;
}): TheatreLineTone {
  const eventType = (input.eventType ?? "").toLowerCase();
  const summary = (input.summary ?? "").toLowerCase();

  if (
    eventType === "result" &&
    (summary.includes("fail") || summary.includes("blocked") || summary.includes("reject"))
  ) {
    return "red";
  }
  if (summary.includes("reject") || summary.includes("failed") || summary.includes("error")) {
    return "red";
  }
  if (
    summary.includes("pending") ||
    summary.includes("approval") ||
    summary.includes("queued") ||
    eventType === "decision"
  ) {
    return "amber";
  }
  if (eventType === "action" || eventType === "result" || eventType === "cost") {
    return "neon";
  }
  return "neutral";
}

export function formatTheatreSseComment(comment: string): string {
  return `: ${comment}\n\n`;
}
