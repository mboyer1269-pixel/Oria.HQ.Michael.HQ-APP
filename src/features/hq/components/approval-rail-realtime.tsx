"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, ShieldAlert, X } from "lucide-react";
import type { TheatrePendingIntent } from "@/features/hq/theatre/theatre-events";

type ActionKind = "approve" | "reject";

const ACTION_ROUTE: Record<ActionKind, (id: string) => string> = {
  approve: (id) => `/api/agents/execution-intents/${encodeURIComponent(id)}/approve`,
  reject: (id) => `/api/agents/execution-intents/${encodeURIComponent(id)}/reject`,
};

export type ApprovalRailRealtimeProps = {
  intents: TheatrePendingIntent[];
  recentIntentIds?: readonly string[];
  connectionLive: boolean;
  onActionComplete?: () => void;
};

/**
 * Live Approval Rail — pending intents stream in via SSE.
 * Explicit CEO click is the only path that fires approve/reject APIs.
 * Positive friction: confirm step before POST.
 */
export function ApprovalRailRealtime({
  intents,
  recentIntentIds = [],
  connectionLive,
  onActionComplete,
}: ApprovalRailRealtimeProps) {
  const [confirming, setConfirming] = useState<{ intentId: string; kind: ActionKind } | null>(
    null,
  );
  const [busy, setBusy] = useState<{ intentId: string; kind: ActionKind } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ intentId: string; kind: ActionKind } | null>(null);

  const newIds = useMemo(() => new Set(recentIntentIds), [recentIntentIds]);

  const sorted = useMemo(
    () => [...intents].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [intents],
  );

  async function runAction(intentId: string, kind: ActionKind) {
    if (busy) return;
    setBusy({ intentId, kind });
    setError(null);
    setConfirming(null);
    try {
      const response = await fetch(ACTION_ROUTE[kind](intentId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? `API ${response.status}`);
      }
      setFlash({ intentId, kind });
      onActionComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action impossible.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      aria-label="File d'approbation temps réel"
      className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950"
    >
      <header className="flex items-center justify-between gap-3 border-b border-zinc-800/80 px-4 py-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-amber-400/90">
            approval.rail
          </p>
          <h3 className="mt-0.5 font-mono text-sm text-zinc-100">Human-in-the-Loop</h3>
        </div>
        <span
          className={`font-mono text-[10px] tracking-[0.18em] ${
            connectionLive ? "text-emerald-400" : "text-amber-400"
          }`}
        >
          {connectionLive ? "STREAM·ON" : "STREAM·WAIT"} · {sorted.length} PENDING
        </span>
      </header>

      <div className="space-y-3 p-4">
        <p className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 font-mono text-[11px] leading-5 text-amber-200/90">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Aucune exécution sans clic CEO explicite. Approuver = seul déclencheur.
        </p>

        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-xs text-red-200"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        ) : null}

        {sorted.length === 0 ? (
          <p className="font-mono text-xs text-zinc-600">
            queue empty — les intents PENDING apparaîtront ici en direct.
          </p>
        ) : (
          <ul className="space-y-2">
            {sorted.map((intent) => {
              const isNew = newIds.has(intent.intentId);
              const isBusy = busy?.intentId === intent.intentId;
              const isConfirm =
                confirming?.intentId === intent.intentId ? confirming.kind : null;
              const done = flash?.intentId === intent.intentId ? flash.kind : null;

              return (
                <li
                  key={intent.intentId}
                  className={`rounded-xl border p-3 transition ${
                    isNew
                      ? "border-amber-400/50 bg-amber-500/10 shadow-[0_0_24px_rgba(251,191,36,0.12)]"
                      : "border-amber-500/25 bg-amber-500/[0.04]"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-amber-300">
                      PENDING
                    </span>
                    <span className="font-mono text-[10px] text-zinc-500">
                      {intent.createdAt.slice(0, 19).replace("T", " ")}
                    </span>
                  </div>

                  <p className="mt-2 font-mono text-sm text-zinc-100">
                    {intent.agentId}
                    <span className="text-zinc-600"> · </span>
                    {intent.skillId}
                    {intent.actionType ? (
                      <>
                        <span className="text-zinc-600"> · </span>
                        <span className="text-amber-200">{intent.actionType}</span>
                      </>
                    ) : null}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-zinc-500">
                    tool={intent.toolName} · autonomy={intent.autonomyLevel}
                    {intent.client ? ` · client=${intent.client}` : ""}
                  </p>
                  {typeof intent.estimatedCostUsd === "number" ? (
                    <p className="mt-2 inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] text-emerald-300">
                      <span className="uppercase tracking-wider text-emerald-400/80">coût estimé</span>
                      <span className="font-bold text-emerald-200">
                        ${intent.estimatedCostUsd.toFixed(4)}
                      </span>
                      {intent.telemetryModelId ? (
                        <span className="text-emerald-400/70">· {intent.telemetryModelId}</span>
                      ) : null}
                    </p>
                  ) : null}
                  <p className="mt-1 truncate font-mono text-[10px] text-zinc-700">
                    {intent.intentId}
                  </p>

                  {done ? (
                    <p
                      className={`mt-3 flex items-center gap-2 font-mono text-xs ${
                        done === "approve" ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" />
                      {done === "approve" ? "APPROVED — dispatch engagé" : "REJECTED"}
                    </p>
                  ) : isConfirm ? (
                    <div className="mt-3 space-y-2 rounded-lg border border-zinc-700 bg-zinc-900/80 p-3">
                      <p className="font-mono text-[11px] text-zinc-300">
                        Confirmer {isConfirm === "approve" ? "APPROVE + EXECUTE" : "REJECT"} ?
                        Friction positive requise.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => void runAction(intent.intentId, isConfirm)}
                          className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 font-mono text-xs font-bold transition ${
                            isConfirm === "approve"
                              ? "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                              : "bg-red-500 text-zinc-950 hover:bg-red-400"
                          }`}
                        >
                          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          Confirmer le clic
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => setConfirming(null)}
                          className="inline-flex min-h-10 items-center rounded-lg border border-zinc-700 px-3 font-mono text-xs text-zinc-300 hover:bg-zinc-900"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => setConfirming({ intentId: intent.intentId, kind: "approve" })}
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 font-mono text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/20"
                      >
                        <Check className="h-3.5 w-3.5" />
                        APPROVE
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => setConfirming({ intentId: intent.intentId, kind: "reject" })}
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 font-mono text-xs font-bold text-red-300 transition hover:bg-red-500/20"
                      >
                        <X className="h-3.5 w-3.5" />
                        REJECT
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
