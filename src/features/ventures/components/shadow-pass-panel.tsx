"use client";

// src/features/ventures/components/shadow-pass-panel.tsx
//
// The surface that makes shadow mode reachable.
//
// Everything it drives already existed as API routes, but only a curl call with
// a session cookie could reach them — so the one judgement the whole feature was
// built for, reading the rationales and deciding whether the reasoning holds,
// had no way in.
//
// Deliberately read-and-judge, not act: nothing here changes a venture. The
// panel runs a pass and shows what the agent produced.

import { useState } from "react";
import { Loader2, Play, ShieldAlert, ShieldCheck } from "lucide-react";

type Source =
  | { kind: "none" }
  | { kind: "internal"; ref: string }
  | { kind: "external"; url: string };

type Evidence = {
  dimension: string;
  value: number;
  rationale: string;
  source: Source;
};

type Proposal = {
  proposalId: string;
  ventureId: string;
  overallScore: number;
  recommendation: string;
  gatesPassed: boolean;
  failedGates: { id: string; missing?: string }[];
  evidence: Evidence[];
};

type PassResult = {
  considered: number;
  proposed: number;
  skipped: number;
  deferred: number;
  deduped: number;
  dedupDegraded?: boolean;
  balanced?: boolean;
  skippedReasons?: { ventureId: string; reason: string }[];
  proposals?: Proposal[];
  error?: string;
  reason?: string;
};

const RECOMMENDATION_LABEL: Record<string, string> = {
  go: "Go",
  test_small: "Tester petit",
  hold: "En attente",
  kill: "Abandonner",
};

function SourceTag({ source }: { source: Source }) {
  if (source.kind === "external") {
    return (
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-sky-400 underline underline-offset-2 hover:text-sky-300"
      >
        {source.url.replace(/^https?:\/\//, "").slice(0, 60)}
      </a>
    );
  }
  if (source.kind === "internal") {
    return <span className="text-xs text-slate-500">interne · {source.ref}</span>;
  }
  // A dimension reaches this state either because the model admitted it had no
  // evidence, or because the source verifier found the cited page did not
  // resolve. Both mean the same thing for judgement: nothing backs this score.
  return <span className="text-xs text-amber-500">aucune source vérifiable</span>;
}

export function ShadowPassPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PassResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runPass() {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/ventures/shadow-pass", { method: "POST" });
      const body = (await response.json()) as PassResult;
      if (!response.ok) {
        setError(body.reason ?? body.error ?? `Échec (HTTP ${response.status})`);
        setResult(null);
        return;
      }
      setResult(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Échec de l'appel");
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Mode ombre</h3>
          <p className="mt-1 text-xs text-slate-500">
            L&apos;agent propose une note pour chaque venture candidate. Rien n&apos;est
            appliqué — vous notez normalement, le système mesure l&apos;écart.
          </p>
        </div>
        <button
          type="button"
          onClick={runPass}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {running ? "Passage en cours…" : "Lancer un passage"}
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-rose-900/60 bg-rose-950/40 p-3 text-xs text-rose-300">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-4 text-xs text-slate-400">
            <span>{result.considered} candidate(s)</span>
            <span className="text-slate-200">{result.proposed} proposée(s)</span>
            {result.skipped > 0 ? <span>{result.skipped} sautée(s)</span> : null}
            {result.deduped > 0 ? <span>{result.deduped} déjà faite(s) aujourd&apos;hui</span> : null}
            {result.deferred > 0 ? <span>{result.deferred} reportée(s)</span> : null}
          </div>

          {result.dedupDegraded ? (
            <p className="text-xs text-amber-500">
              ⚠️ Le garde anti-doublon était inactif ce passage — une venture a pu être
              proposée deux fois aujourd&apos;hui.
            </p>
          ) : null}
          {result.balanced === false ? (
            <p className="text-xs text-rose-400">
              ⚠️ Compte non équilibré — une venture a été perdue de vue. À signaler.
            </p>
          ) : null}

          {result.skippedReasons?.length ? (
            <ul className="space-y-1 text-xs text-slate-500">
              {result.skippedReasons.map((skip) => (
                <li key={skip.ventureId}>
                  {skip.ventureId} — {skip.reason}
                </li>
              ))}
            </ul>
          ) : null}

          {result.considered === 0 ? (
            <p className="text-xs text-slate-500">
              Aucune venture au statut <code>candidate</code>. Le mode ombre ne note que
              celles-là : au-delà, la décision est déjà prise et il n&apos;y a plus rien à
              comparer.
            </p>
          ) : null}

          {result.proposals?.map((proposal) => (
            <article
              key={proposal.proposalId}
              className="rounded-lg border border-slate-800 bg-slate-900/40 p-3"
            >
              <header className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-semibold text-slate-200">
                  {proposal.overallScore}/100
                </span>
                <span className="text-xs text-slate-400">
                  {RECOMMENDATION_LABEL[proposal.recommendation] ?? proposal.recommendation}
                </span>
                {proposal.gatesPassed ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                    <ShieldCheck className="h-3.5 w-3.5" /> portes franchies
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-500">
                    <ShieldAlert className="h-3.5 w-3.5" /> portes non franchies
                  </span>
                )}
              </header>

              {proposal.failedGates.length > 0 ? (
                <ul className="mt-2 space-y-0.5 text-xs text-amber-500/90">
                  {proposal.failedGates.map((gate) => (
                    <li key={gate.id}>
                      {gate.id}
                      {gate.missing ? ` — ${gate.missing}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}

              <p className="mt-3 text-xs text-slate-500">
                Les portes vérifient qu&apos;une source existe. Elles ne vérifient pas que le
                raisonnement tient — c&apos;est ce qui suit qu&apos;il faut juger.
              </p>

              <ul className="mt-2 space-y-2">
                {proposal.evidence.map((item) => (
                  <li key={item.dimension} className="border-l border-slate-800 pl-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-medium text-slate-300">
                        {item.value}/10
                      </span>
                      <span className="text-xs text-slate-500">{item.dimension}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">{item.rationale}</p>
                    <div className="mt-0.5">
                      <SourceTag source={item.source} />
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
