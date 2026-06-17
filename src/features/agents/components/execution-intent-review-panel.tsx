"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Check, Clock, Info, Loader2, PlugZap, RefreshCw, ShieldCheck } from "lucide-react";
import type { AgentExecutionIntent } from "@/features/agents/execution-intent";
import {
  projectExecutionIntentsForReview,
  resolveExecutionIntentPanelState,
  type ExecutionIntentPanelState,
  type ExecutionIntentReviewRow,
} from "@/features/agents/execution-intent-review-projection";

type ExecutionIntentReviewPanelProps = {
  /** Agent whose pending intents are listed. v1 is bound to the strict registry (hermes). */
  agentId: string;
};

type ListStatus = "loading" | "ready" | "not_configured";

const labelClass = "text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500";

/**
 * CEO review surface for governed execution intents (/hq/agents).
 *
 * Strictly client-side and bound to a single agent: it reads the EXISTING
 * per-agent route GET /api/agents/:agentId/execution-intents, and fires the
 * SINGLE existing mutation POST /api/agents/execution-intents/:id/approve.
 *
 * No new global route, no direct repository/DB access, no Reject (no route
 * exists). Because the fetch is isolated here, /hq/agents never crashes: any
 * non-ok list response degrades to "Execution rail not configured yet."
 */
export function ExecutionIntentReviewPanel({ agentId }: ExecutionIntentReviewPanelProps) {
  const [listStatus, setListStatus] = useState<ListStatus>("loading");
  const [rows, setRows] = useState<ExecutionIntentReviewRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  // No synchronous setState here: state mutations happen only after the await,
  // so the mount effect never triggers a cascading render (react-hooks rule).
  // The initial `loading` state covers the first paint; the refresh handler
  // sets `loading` itself (outside any effect).
  const loadIntents = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/agents/${encodeURIComponent(agentId)}/execution-intents`,
        { method: "GET", headers: { Accept: "application/json" } },
      );
      if (!response.ok) {
        // No structured "not configured" signal exists; any non-ok list
        // response (e.g. 500 when migration 0024 is absent) degrades gracefully.
        setListStatus("not_configured");
        return;
      }
      const data = (await response.json().catch(() => ({}))) as { intents?: AgentExecutionIntent[] };
      setRows(projectExecutionIntentsForReview(data.intents ?? []));
      setListStatus("ready");
    } catch {
      setListStatus("not_configured");
    }
  }, [agentId]);

  // Defer the initial fetch to a macrotask (house pattern, see
  // mission-draft-pending-panel): keeps the effect body free of synchronous
  // setState so it never triggers a cascading render.
  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadIntents();
    }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadIntents]);

  function handleRefresh() {
    setListStatus("loading");
    void loadIntents();
  }

  async function handleApprove(intentId: string) {
    if (busyId) return;
    setBusyId(intentId);
    setError(null);
    setSuccessId(null);
    try {
      const response = await fetch(
        `/api/agents/execution-intents/${encodeURIComponent(intentId)}/approve`,
        { method: "POST", headers: { "Content-Type": "application/json" } },
      );
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? `API ${response.status}`);
      }
      setSuccessId(intentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approbation impossible.");
    } finally {
      setBusyId(null);
      // Reconcile with server truth after EVERY attempt (success or failure):
      // a terminal failure (Sentinelle BLOCK / dispatch error) has already
      // moved the intent out of `pending` server-side, so refetching removes
      // the stale, still-actionable row. The error banner persists.
      await loadIntents();
    }
  }

  // ── loading ────────────────────────────────────────────────────────────────
  if (listStatus === "loading") {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement des intentions d&apos;exécution…
      </div>
    );
  }

  // ── not configured (rail/table absent, GET non-ok) ───────────────────────────
  if (listStatus === "not_configured") {
    return (
      <div className="flex items-start gap-2 rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
        <PlugZap className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
        <div>
          <p className="text-sm font-medium text-neutral-300">Execution rail not configured yet.</p>
          <p className="mt-1 text-xs leading-5 text-neutral-500">
            La table des intentions d&apos;exécution gouvernées n&apos;est pas disponible sur cet
            environnement (migration 0024 non appliquée). Aucune action n&apos;est possible ici tant
            que le rail n&apos;est pas configuré.
          </p>
        </div>
      </div>
    );
  }

  const panelState: ExecutionIntentPanelState = resolveExecutionIntentPanelState({
    railConfigured: true,
    rows,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 rounded-2xl border border-amber-500/15 bg-amber-500/5 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p className="text-xs leading-5 text-neutral-400">
          Approuver est le <span className="text-neutral-300">seul</span> déclencheur qui exécute
          réellement l&apos;intention via le webhook n8n. Aucune action n&apos;est lancée tant que tu
          n&apos;as pas approuvé. Pas de rejet en un clic tant que la route dédiée n&apos;existe pas.
        </p>
      </div>

      {error ? (
        <div
          className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      {panelState === "empty" ? (
        <p className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 text-xs text-neutral-600">
          Aucune intention d&apos;exécution en attente d&apos;approbation pour {agentId}.
        </p>
      ) : (
        <div className="grid gap-2">
          {rows.map((row) => {
            const busy = busyId === row.intentId;
            const approved = successId === row.intentId;
            return (
              <div
                key={row.intentId}
                className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
                    {row.agentId} · {row.skillId} · {row.status}
                  </span>
                  <span className="flex items-center gap-1 font-mono text-xs text-neutral-600">
                    <Clock className="h-3 w-3" />
                    {row.createdAt.slice(0, 16).replace("T", " ")}
                  </span>
                </div>

                <h3 className="mt-2 text-sm font-semibold text-white">{row.actionType}</h3>

                <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-neutral-400 sm:grid-cols-2">
                  <div className="flex gap-1">
                    <dt className={labelClass}>Client</dt>
                    <dd className="text-neutral-300">{row.payloadSummary.client}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className={labelClass}>Email</dt>
                    <dd className="text-neutral-300">{row.payloadSummary.email}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className={labelClass}>Mission</dt>
                    <dd className="font-mono text-neutral-300">{row.payloadSummary.missionId}</dd>
                  </div>
                  {row.payloadSummary.ventureId ? (
                    <div className="flex gap-1">
                      <dt className={labelClass}>Venture</dt>
                      <dd className="font-mono text-neutral-300">{row.payloadSummary.ventureId}</dd>
                    </div>
                  ) : null}
                  <div className="flex gap-1">
                    <dt className={labelClass}>Tool</dt>
                    <dd className="font-mono text-neutral-300">{row.toolName}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className={labelClass}>Autonomie</dt>
                    <dd className="text-neutral-300">L{row.autonomyLevel}</dd>
                  </div>
                </dl>

                {row.payloadSummary.dataKeys.length > 0 ? (
                  <p className="mt-2 text-xs text-neutral-600">
                    <span className={labelClass}>Payload</span>{" "}
                    <span className="font-mono text-neutral-500">
                      {row.payloadSummary.dataKeys.join(", ")}
                    </span>
                  </p>
                ) : null}

                <p className="mt-2 truncate font-mono text-[11px] text-neutral-700">{row.intentId}</p>

                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={busy || approved}
                    onClick={() => void handleApprove(row.intentId)}
                    aria-busy={busy}
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-neutral-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    {approved ? "Approuvé" : "Approuver"}
                  </button>
                  {approved ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-400/80">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Dispatch déclenché
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={handleRefresh}
        className="inline-flex items-center gap-1.5 self-start text-xs text-neutral-500 transition hover:text-neutral-300"
      >
        <RefreshCw className="h-3 w-3" />
        Rafraîchir
      </button>
    </div>
  );
}
