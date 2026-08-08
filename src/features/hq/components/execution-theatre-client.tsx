"use client";

import { useMemo } from "react";
import { AgentTerminalFeed } from "@/features/hq/components/agent-terminal-feed";
import { ApprovalRailRealtime } from "@/features/hq/components/approval-rail-realtime";
import type {
  TheatreLedgerLine,
  TheatrePendingIntent,
} from "@/features/hq/theatre/theatre-events";
import { useTheatreStream } from "@/features/hq/theatre/use-theatre-stream";

export type ExecutionTheatreClientProps = {
  workspaceId: string;
  initialLedger: TheatreLedgerLine[];
  initialIntents: TheatrePendingIntent[];
  initialSource: "supabase" | "local" | null;
};

/**
 * Client island for the Command Tower Execution Theatre.
 * Server Components load the initial snapshot; this island owns the SSE session.
 */
export function ExecutionTheatreClient({
  workspaceId,
  initialLedger,
  initialIntents,
  initialSource,
}: ExecutionTheatreClientProps) {
  const stream = useTheatreStream({
    workspaceId,
    initialLedger,
    initialIntents,
    initialSource,
  });

  const animateIds = useMemo(
    () => new Set(stream.recentLedgerIds),
    [stream.recentLedgerIds],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <AgentTerminalFeed
          lines={stream.ledger}
          connection={stream.connection}
          source={stream.ledgerSource}
          animateIds={animateIds}
        />
        <ApprovalRailRealtime
          intents={stream.pendingIntents}
          recentIntentIds={stream.recentIntentIds}
          connectionLive={stream.connection === "live"}
        />
      </div>
      {stream.lastError ? (
        <p className="font-mono text-xs text-red-400" role="alert">
          theatre.error: {stream.lastError}
        </p>
      ) : null}
    </div>
  );
}
