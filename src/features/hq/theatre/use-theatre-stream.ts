"use client";

import { useEffect, useState } from "react";
import type {
  TheatreLedgerLine,
  TheatrePendingIntent,
  TheatreSseEvent,
} from "@/features/hq/theatre/theatre-events";

export type TheatreConnectionState = "connecting" | "live" | "reconnecting" | "error";

export type TheatreStreamState = {
  connection: TheatreConnectionState;
  workspaceId: string;
  ledgerSource: "supabase" | "local" | null;
  ledger: TheatreLedgerLine[];
  pendingIntents: TheatrePendingIntent[];
  recentLedgerIds: string[];
  recentIntentIds: string[];
  lastError: string | null;
  lastHeartbeatAt: string | null;
};

type UseTheatreStreamOptions = {
  workspaceId: string;
  enabled?: boolean;
  initialLedger?: TheatreLedgerLine[];
  initialIntents?: TheatrePendingIntent[];
  initialSource?: "supabase" | "local" | null;
};

function parseSseBlock(raw: string): TheatreSseEvent | null {
  const lines = raw.split("\n");
  let data = "";
  for (const line of lines) {
    if (line.startsWith("data:")) {
      data += line.slice(5).trim();
    }
  }
  if (!data) return null;
  try {
    return JSON.parse(data) as TheatreSseEvent;
  } catch {
    return null;
  }
}

/**
 * Client subscription to /api/hq/theatre/stream.
 * Passes workspaceId on the query string; the server re-validates it against
 * the active owner workspace before streaming.
 */
export function useTheatreStream(options: UseTheatreStreamOptions): TheatreStreamState {
  const { workspaceId, enabled = true } = options;
  const [state, setState] = useState<TheatreStreamState>({
    connection: "connecting",
    workspaceId,
    ledgerSource: options.initialSource ?? null,
    ledger: options.initialLedger ?? [],
    pendingIntents: options.initialIntents ?? [],
    recentLedgerIds: [],
    recentIntentIds: [],
    lastError: null,
    lastHeartbeatAt: null,
  });

  useEffect(() => {
    if (!enabled || !workspaceId) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let clearRecentTimer: number | null = null;
    let source: EventSource | null = null;

    const scheduleClearRecent = () => {
      if (clearRecentTimer !== null) window.clearTimeout(clearRecentTimer);
      clearRecentTimer = window.setTimeout(() => {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          recentLedgerIds: [],
          recentIntentIds: [],
        }));
      }, 3_500);
    };

    const applyEvent = (event: TheatreSseEvent) => {
      if (cancelled) return;
      if ("workspaceId" in event && event.workspaceId && event.workspaceId !== workspaceId) {
        return;
      }

      if (event.type === "ledger.append" || event.type === "intent.upsert") {
        scheduleClearRecent();
      }

      setState((prev) => {
        switch (event.type) {
          case "hello":
            return { ...prev, connection: "live", lastError: null, workspaceId: event.workspaceId };
          case "heartbeat":
            return { ...prev, connection: "live", lastHeartbeatAt: event.emittedAt };
          case "ledger.snapshot":
            return {
              ...prev,
              ledger: event.entries,
              ledgerSource: event.source,
              connection: "live",
            };
          case "ledger.append":
            return {
              ...prev,
              ledger: [event.entry, ...prev.ledger.filter((line) => line.id !== event.entry.id)].slice(
                0,
                48,
              ),
              recentLedgerIds: [...new Set([event.entry.id, ...prev.recentLedgerIds])],
              connection: "live",
            };
          case "intent.snapshot":
            return { ...prev, pendingIntents: event.intents, connection: "live" };
          case "intent.upsert": {
            const without = prev.pendingIntents.filter((i) => i.intentId !== event.intent.intentId);
            return {
              ...prev,
              pendingIntents: [event.intent, ...without],
              recentIntentIds: [...new Set([event.intent.intentId, ...prev.recentIntentIds])],
              connection: "live",
            };
          }
          case "intent.remove":
            return {
              ...prev,
              pendingIntents: prev.pendingIntents.filter((i) => i.intentId !== event.intentId),
              connection: "live",
            };
          case "error":
            return { ...prev, connection: "error", lastError: event.message };
          default:
            return prev;
        }
      });
    };

    const connect = () => {
      if (cancelled) return;
      setState((prev) => ({
        ...prev,
        connection: prev.connection === "live" ? "reconnecting" : "connecting",
      }));

      const url = `/api/hq/theatre/stream?workspaceId=${encodeURIComponent(workspaceId)}`;
      source = new EventSource(url);

      source.onopen = () => {
        if (cancelled) return;
        setState((prev) => ({ ...prev, connection: "live", lastError: null }));
      };

      source.onmessage = (message) => {
        const parsed = parseSseBlock(`data: ${message.data}`);
        if (parsed) applyEvent(parsed);
      };

      const namedTypes = [
        "hello",
        "heartbeat",
        "ledger.snapshot",
        "ledger.append",
        "intent.snapshot",
        "intent.upsert",
        "intent.remove",
        "error",
      ] as const;

      for (const type of namedTypes) {
        source.addEventListener(type, (message) => {
          const parsed = parseSseBlock(`data: ${(message as MessageEvent).data}`);
          if (parsed) applyEvent(parsed);
        });
      }

      source.onerror = () => {
        if (cancelled) return;
        source?.close();
        source = null;
        setState((prev) => ({ ...prev, connection: "reconnecting" }));
        retryTimer = setTimeout(connect, 2_500);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (clearRecentTimer !== null) window.clearTimeout(clearRecentTimer);
      source?.close();
    };
  }, [workspaceId, enabled]);

  return state;
}
