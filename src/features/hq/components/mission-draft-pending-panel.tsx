"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import type { CalendarEvent } from "@/features/hq/types";
import {
  formatMissionDraftExpiryLabel,
  formatMissionDraftSchedule,
  MISSION_DRAFT_CHANGED_EVENT,
  type MissionDraftPendingClientView,
} from "@/features/hq/mission-draft-format";

type ConfirmResponse = {
  summary?: string;
  missionId?: string;
  calendarEvent?: CalendarEvent;
  error?: string;
};

type PanelVariant = "banner" | "embedded";

type MissionDraftPendingPanelProps = {
  variant?: PanelVariant;
  /** When true, refetch after Joris chat responses in Command Center. */
  listenForDraftChanges?: boolean;
};

function dispatchDraftChanged() {
  window.dispatchEvent(new CustomEvent(MISSION_DRAFT_CHANGED_EVENT));
}

export function MissionDraftPendingPanel({
  variant = "banner",
  listenForDraftChanges = true,
}: MissionDraftPendingPanelProps) {
  const [pending, setPending] = useState<MissionDraftPendingClientView | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<"confirm" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResponse | null>(null);
  const [dismissedExpired, setDismissedExpired] = useState(false);

  const loadPending = useCallback(async (options?: { showLoading?: boolean }) => {
    if (options?.showLoading) {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await fetch("/api/missions/draft/pending", { cache: "no-store" });
      const data = (await response.json()) as MissionDraftPendingClientView & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? `API ${response.status}`);
      }

      setPending(data);
      if (data.status !== "expired") {
        setDismissedExpired(false);
      }
      if (data.status === "active") {
        setConfirmResult(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger la proposition.");
      setPending(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/missions/draft/pending", { cache: "no-store" });
        const data = (await response.json()) as MissionDraftPendingClientView & { error?: string };

        if (cancelled) return;

        if (!response.ok) {
          throw new Error(data.error ?? `API ${response.status}`);
        }

        setPending(data);
        if (data.status !== "expired") {
          setDismissedExpired(false);
        }
        if (data.status === "active") {
          setConfirmResult(null);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Impossible de charger la proposition.");
        setPending(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!listenForDraftChanges) return undefined;

    const onDraftChanged = () => {
      void loadPending({ showLoading: false });
    };

    window.addEventListener(MISSION_DRAFT_CHANGED_EVENT, onDraftChanged);
    return () => window.removeEventListener(MISSION_DRAFT_CHANGED_EVENT, onDraftChanged);
  }, [listenForDraftChanges, loadPending]);

  async function runAction(kind: "confirm" | "cancel") {
    if (!pending?.pendingDraftId || action) return;

    setAction(kind);
    setError(null);

    try {
      const response = await fetch(`/api/missions/draft/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingDraftId: pending.pendingDraftId }),
      });

      const data = (await response.json()) as ConfirmResponse;

      if (!response.ok) {
        throw new Error(data.error ?? `API ${response.status}`);
      }

      if (kind === "confirm") {
        setConfirmResult(data);
        if (data.calendarEvent) {
          window.dispatchEvent(new CustomEvent("michael-hq:calendar-changed"));
        }
      }

      dispatchDraftChanged();
      await loadPending();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action impossible.");
    } finally {
      setAction(null);
    }
  }

  if (loading && !pending) {
    if (variant === "embedded") return null;
    return (
      <section
        id="mission-draft-pending"
        data-testid="mission-draft-pending-banner"
        className="rounded-3xl border border-neutral-800 bg-neutral-950/70 p-5"
      >
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement des propositions en attente…
        </div>
      </section>
    );
  }

  if (pending?.status === "expired" && !dismissedExpired) {
    return (
      <section
        id="mission-draft-pending"
        data-testid="mission-draft-pending-banner"
        className="rounded-3xl border border-amber-500/25 bg-amber-500/10 p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
                Proposition expirée
              </p>
              <p className="mt-1 text-sm leading-6 text-neutral-300">
                La mission draft calendrier a expiré. Demande un nouveau rendez-vous via Joris pour générer une
                proposition fraîche.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDismissedExpired(true)}
            className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-neutral-700 px-4 text-sm font-semibold text-neutral-200 transition hover:border-neutral-500"
          >
            Fermer
          </button>
        </div>
      </section>
    );
  }

  if (confirmResult?.calendarEvent && confirmResult.missionId) {
    const event = confirmResult.calendarEvent;
    return (
      <section
        id="mission-draft-pending"
        data-testid="mission-draft-confirmed-banner"
        className="rounded-3xl border border-emerald-500/25 bg-emerald-500/10 p-5"
      >
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Calendrier confirmé
            </p>
            <p className="mt-1 font-medium text-white">{event.title}</p>
            <p className="mt-1 text-sm text-neutral-300">
              {event.dateISO} · {event.startTime} – {event.endTime}
            </p>
            <p className="mt-2 font-mono text-xs text-emerald-200/90">missionId: {confirmResult.missionId}</p>
            {confirmResult.summary ? (
              <p className="mt-2 text-sm leading-6 text-neutral-400">{confirmResult.summary}</p>
            ) : null}
            <Link
              href="#ledger-activity"
              className="mt-3 inline-flex text-sm font-semibold text-emerald-300 underline-offset-2 hover:underline"
            >
              Voir dans Ledger Activity
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (pending?.status !== "active" || !pending.preview) {
    return null;
  }

  const preview = pending.preview;
  const schedule = formatMissionDraftSchedule(preview);
  const expiryLabel = formatMissionDraftExpiryLabel(pending.remainingMs, pending.expiresAt);

  const borderClass =
    variant === "banner"
      ? "border-amber-500/30 bg-amber-500/10"
      : "border-amber-500/25 bg-amber-500/5";

  return (
    <section
      id={variant === "banner" ? "mission-draft-pending" : undefined}
      data-testid={variant === "banner" ? "mission-draft-pending-banner" : "mission-draft-pending-embedded"}
      className={`rounded-2xl border p-4 ${borderClass}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
              {variant === "banner" ? "Mission draft en attente" : "Proposition calendrier"}
            </p>
            <h3 className="mt-1 text-lg font-semibold text-white">{preview.title}</h3>
            <p className="mt-1 text-sm leading-6 text-neutral-300">{preview.objective}</p>
            {schedule ? <p className="mt-2 text-sm font-medium text-amber-100">{schedule}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-200">
                {preview.skillId}
              </span>
              <span className="rounded-md border border-neutral-700 px-2 py-0.5 text-neutral-400">{expiryLabel}</span>
              <span className="rounded-md border border-neutral-700 px-2 py-0.5 font-mono text-neutral-500">
                {pending.pendingDraftId}
              </span>
            </div>
            <p className="mt-3 text-xs leading-5 text-neutral-500">
              Confirmer crée une mission draft locale et booke le calendrier avec missionId sur le ledger. Aucune
              exécution live.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <button
            type="button"
            disabled={Boolean(action)}
            onClick={() => void runAction("confirm")}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {action === "confirm" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Approuver
          </button>
          <button
            type="button"
            disabled={Boolean(action)}
            onClick={() => void runAction("cancel")}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 text-sm font-semibold text-red-200 transition hover:border-red-500/50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {action === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Refuser
          </button>
        </div>
      </div>

      {error ? (
        <div
          className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      {variant === "banner" ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-neutral-500">
          <XCircle className="h-3.5 w-3.5" />
          Tu peux aussi confirmer par chat (« confirme », « oui », « go ») dans le Command Center.
        </p>
      ) : null}
    </section>
  );
}
