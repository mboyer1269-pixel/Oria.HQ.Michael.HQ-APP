"use client";

// src/features/ventures/components/agent-score-snapshot-panel.tsx
//
// The owner's trigger for an agent scoring pass.
//
// A score sitting in a table nobody queries is not a measurement, it is a row.
// This turns the pass into something that can be run and read in seconds, which
// is the only way its numbers get judged rather than trusted.
//
// It renders what came back and nothing else — no averages invented on the
// client, no "no data yet" standing in for a failed call.

import { useState } from "react";

type DimensionScores = Record<string, number>;

type Snapshot = {
  snapshotId: string;
  agentId: string;
  totalOperatorScore: number;
  operatorScoreBand: string;
  operatorStatus: string;
  dimensionScores: DimensionScores;
  outcomeCount: number;
};

type SnapshotResult = {
  trigger: string;
  scoredAt?: string;
  agentsScored?: number;
  signalsConsidered?: number;
  snapshots?: Snapshot[];
  error?: string;
  reason?: string;
  partialWritePossible?: boolean;
};

const BAND_STYLE: Record<string, string> = {
  strong: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  steady: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  weak: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  critical: "border-rose-500/30 bg-rose-500/10 text-rose-200",
};

export function AgentScoreSnapshotPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SnapshotResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSnapshot() {
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/ventures/agent-scores/snapshot", { method: "POST" });
      const payload = (await response.json()) as SnapshotResult;

      if (!response.ok) {
        // The route flags a partial write on failure. Surfacing it matters:
        // some agents may already be persisted at this timestamp.
        setError(
          payload.partialWritePossible
            ? `${payload.reason ?? "échec"} — certains agents ont pu être écrits avant l'erreur.`
            : (payload.reason ?? "échec du passage"),
        );
        return;
      }

      setResult(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Requête impossible.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Scores d&apos;opérateur</h3>
          <p className="mt-1 max-w-prose text-xs text-slate-400">
            Score chaque agent qui détient une preuve de trésorerie capturée, et enregistre un
            point par agent. Répété dans le temps, cela donne une courbe plutôt qu&apos;un chiffre.
          </p>
        </div>

        <button
          type="button"
          onClick={runSnapshot}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          {running ? "Passage en cours…" : "Lancer un passage"}
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4">
          <p className="text-xs text-slate-400">
            {result.agentsScored} agent(s) scoré(s) · {result.signalsConsidered} signal(aux)
            considéré(s)
            {result.scoredAt ? ` · ${new Date(result.scoredAt).toLocaleString("fr-CA")}` : null}
          </p>

          {result.agentsScored === 0 ? (
            // Distinct from a failure, and it must read that way: the pass ran,
            // and no agent holds captured proof yet.
            <p className="mt-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-400">
              Le passage a bien tourné. Aucun agent ne détient encore de preuve capturée — il n&apos;y
              a donc rien à scorer, ce qui n&apos;est pas une erreur.
            </p>
          ) : null}

          <ul className="mt-3 space-y-2">
            {result.snapshots?.map((snapshot) => (
              <li
                key={snapshot.snapshotId}
                className="rounded-lg border border-slate-800 bg-slate-900/40 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-100">{snapshot.agentId}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      BAND_STYLE[snapshot.operatorScoreBand] ??
                      "border-slate-700 bg-slate-800 text-slate-300"
                    }`}
                  >
                    {snapshot.totalOperatorScore}/100 · {snapshot.operatorScoreBand}
                  </span>
                  <span className="text-[10px] text-slate-500">{snapshot.operatorStatus}</span>
                  <span className="text-[10px] text-slate-500">
                    {snapshot.outcomeCount} preuve(s)
                  </span>
                </div>

                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {Object.entries(snapshot.dimensionScores).map(([dimension, value]) => (
                    <li key={dimension} className="text-[11px] text-slate-400">
                      <span className="text-slate-500">{dimension}</span>{" "}
                      <span className="font-medium text-slate-300">{value}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
