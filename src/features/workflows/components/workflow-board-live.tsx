"use client";

import { useEffect, useRef, useState } from "react";
import type { WorkflowLiveBoard } from "../workflow-live-board";
import { WorkflowBoardPanel } from "./workflow-board-panel";

// ---------------------------------------------------------------------------
// Live wrapper for the workflows board. Server-renders the initial board, then
// polls the read-only /api/workflows/board endpoint and swaps in fresh data so
// the step lines advance without a manual refresh. On any fetch error it keeps
// the last good board (never blanks the view).
// ---------------------------------------------------------------------------

type BoardResponse = { board: WorkflowLiveBoard; source: "ledger" | "demo"; note: string };

export function WorkflowBoardLive({
  initialBoard,
  initialNote,
  initialSource,
  pollMs = 15000,
}: {
  initialBoard: WorkflowLiveBoard;
  initialNote?: string;
  initialSource?: "ledger" | "demo";
  pollMs?: number;
}) {
  const [board, setBoard] = useState<WorkflowLiveBoard>(initialBoard);
  const [note, setNote] = useState<string | undefined>(initialNote);
  const [source, setSource] = useState<"ledger" | "demo" | undefined>(initialSource);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let active = true;

    const tick = async () => {
      try {
        const res = await fetch("/api/workflows/board", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as BoardResponse;
        if (active && data?.board) {
          setBoard(data.board);
          setNote(data.note);
          setSource(data.source);
          setRefreshedAt(Date.now());
        }
      } catch {
        // keep the last good board
      }
    };

    timer.current = setInterval(tick, pollMs);
    return () => {
      active = false;
      if (timer.current) clearInterval(timer.current);
    };
  }, [pollMs]);

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2 text-[11px] text-neutral-500">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <span>
          Live · {source === "ledger" ? "ledger réel" : "démonstration"} · rafraîchi toutes les{" "}
          {Math.round(pollMs / 1000)} s
          {refreshedAt ? ` · maj ${new Date(refreshedAt).toLocaleTimeString("fr-CA")}` : ""}
        </span>
      </div>
      <WorkflowBoardPanel board={board} note={note} />
    </div>
  );
}
