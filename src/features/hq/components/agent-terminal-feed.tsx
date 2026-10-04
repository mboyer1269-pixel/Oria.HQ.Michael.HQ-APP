"use client";

import { useEffect, useState } from "react";
import type { TheatreLedgerLine, TheatreLineTone } from "@/features/hq/theatre/theatre-events";
import type { TheatreConnectionState } from "@/features/hq/theatre/use-theatre-stream";

const TONE_CLASS: Record<TheatreLineTone, string> = {
  neon: "text-emerald-400",
  amber: "text-amber-400",
  red: "text-red-400",
  neutral: "text-zinc-400",
};

const TONE_PREFIX: Record<TheatreLineTone, string> = {
  neon: "▸",
  amber: "◆",
  red: "✖",
  neutral: "·",
};

function TypewriterText({
  text,
  active,
  className,
}: {
  text: string;
  active: boolean;
  className?: string;
}) {
  const [shown, setShown] = useState(active ? "" : text);

  useEffect(() => {
    // Defer to a macrotask (house pattern) — avoids sync setState-in-effect lint.
    const start = window.setTimeout(() => {
      if (!active) {
        setShown(text);
        return;
      }
      setShown("");
      let index = 0;
      const timer = window.setInterval(() => {
        index += 1;
        setShown(text.slice(0, index));
        if (index >= text.length) {
          window.clearInterval(timer);
        }
      }, 12);
      // Store interval id on the timeout cleanup via nested clear.
      (start as unknown as { intervalId?: number }).intervalId = timer;
    }, 0);

    return () => {
      window.clearTimeout(start);
      const intervalId = (start as unknown as { intervalId?: number }).intervalId;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [text, active]);

  return <span className={className}>{shown}</span>;
}

function ConnectionPill({ connection }: { connection: TheatreConnectionState }) {
  const label =
    connection === "live"
      ? "LIVE"
      : connection === "reconnecting"
        ? "RECONNECT"
        : connection === "error"
          ? "ERROR"
          : "SYNC";
  const tone =
    connection === "live"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : connection === "error"
        ? "border-red-500/40 bg-red-500/10 text-red-300"
        : "border-amber-500/40 bg-amber-500/10 text-amber-300";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[10px] tracking-[0.2em] ${tone}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          connection === "live" ? "animate-pulse bg-emerald-400" : "bg-current"
        }`}
      />
      {label}
    </span>
  );
}

export type AgentTerminalFeedProps = {
  lines: TheatreLedgerLine[];
  connection: TheatreConnectionState;
  source: "supabase" | "local" | null;
  /** Newest line ids that should typewriter-animate. */
  animateIds?: ReadonlySet<string>;
};

/**
 * Real-time agent activity terminal. Monospace cyber aesthetic.
 * Consumes live ledger lines — never invents mock events.
 */
export function AgentTerminalFeed({
  lines,
  connection,
  source,
  animateIds,
}: AgentTerminalFeedProps) {
  return (
    <section
      aria-label="Théâtre d'exécution — flux agent"
      className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950"
    >
      <header className="flex items-center justify-between gap-3 border-b border-zinc-800/80 bg-zinc-950 px-4 py-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-emerald-400/80">
            execution.theatre
          </p>
          <h3 className="mt-0.5 font-mono text-sm text-zinc-100">AgentTerminalFeed</h3>
        </div>
        <div className="flex items-center gap-2">
          <ConnectionPill connection={connection} />
          {source ? (
            <span className="font-mono text-[10px] text-zinc-600">
              src={source === "supabase" ? "supabase" : "local"}
            </span>
          ) : null}
        </div>
      </header>

      <div className="max-h-[28rem] overflow-y-auto px-3 py-3">
        {lines.length === 0 ? (
          <p className="font-mono text-xs leading-6 text-zinc-600">
            <span className="text-emerald-500">$</span> awaiting governed ledger events…
            <br />
            <span className="text-zinc-700"># no mock data · HITL only</span>
          </p>
        ) : (
          <ul className="space-y-2">
            {lines.map((line) => {
              const animate = animateIds?.has(line.id) ?? false;
              return (
                <li
                  key={line.id}
                  className="border-l-2 border-zinc-800 pl-3 font-mono text-[12px] leading-5"
                  style={{
                    borderLeftColor:
                      line.tone === "neon"
                        ? "#34d399"
                        : line.tone === "amber"
                          ? "#fbbf24"
                          : line.tone === "red"
                            ? "#f87171"
                            : "#3f3f46",
                  }}
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-zinc-600">{line.createdAt.slice(11, 19)}</span>
                    <span className={TONE_CLASS[line.tone]}>{TONE_PREFIX[line.tone]}</span>
                    <span className="text-zinc-500">{line.eventType ?? "event"}</span>
                    {line.agentId ? (
                      <span className="text-emerald-500/80">@{line.agentId}</span>
                    ) : null}
                  </div>
                  <p className={`mt-0.5 ${TONE_CLASS[line.tone]}`}>
                    <TypewriterText text={line.summary} active={animate} />
                    {animate ? <span className="ml-0.5 animate-pulse text-emerald-400">▌</span> : null}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
