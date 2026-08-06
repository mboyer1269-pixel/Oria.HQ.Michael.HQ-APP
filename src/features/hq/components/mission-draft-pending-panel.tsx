"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import type { CalendarEvent, CommandResult } from "@/features/hq/types";
import {
  formatMissionDraftExpiryLabel,
  formatMissionDraftSchedule,
  isMissionDraftActionInFlight,
  mapCancelDraftResponse,
  mapConfirmDraftResponse,
  mapPendingLoadToUxState,
  MISSION_DRAFT_CANCELLED_BANNER_MS,
  MISSION_DRAFT_CANCELLED_LABEL,
  MISSION_DRAFT_CHANGED_EVENT,
  type MissionDraftPanelUxState,
  type MissionDraftPendingClientView,
} from "@/features/hq/mission-draft-format";
import { dispatchApprovalResolved } from "@/features/hq/approval-resolved-event";

type PanelVariant = "banner" | "embedded";

type MissionDraftPendingPanelProps = {
  variant?: PanelVariant;
  /** When true, refetch after Joris chat responses in Command Center. */
  listenForDraftChanges?: boolean;
};

type ConfirmedPayload = {
  missionId: string;
  calendarEvent: CalendarEvent;
  summary?: string;
};

const HQ_DRAFT_ANCHOR = "/hq#mission-draft-pending";

function dispatchDraftChanged() {
  window.dispatchEvent(new CustomEvent(MISSION_DRAFT_CHANGED_EVENT));
}

export function MissionDraftPendingPanel({
  variant = "banner",
  listenForDraftChanges = true,
}: MissionDraftPendingPanelProps) {
  const [pending, setPending] = useState<MissionDraftPendingClientView | null>(null);
  const [ux, setUx] = useState<MissionDraftPanelUxState>("loading");
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedPayload | null>(null);
  const [dismissedExpired, setDismissedExpired] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const actionInFlightRef = useRef(false);
  const cancelledTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncUxFromPending = useCallback(
    (nextPending: MissionDraftPendingClientView | null, nextLoading: boolean) => {
      const mapped = mapPendingLoadToUxState({
        loading: nextLoading,
        pending: nextPending,
        dismissedExpired,
      });
      if (mapped === "idle" || mapped === "active" || mapped === "expired" || mapped === "loading") {
        setUx(mapped);
      }
    },
    [dismissedExpired],
  );

  const loadPending = useCallback(
    async (options?: { skipUxSync?: boolean }) => {
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
          setConfirmed(null);
          setFeedbackMessage(null);
        }
        if (!options?.skipUxSync) {
          syncUxFromPending(data, false);
        }
      } catch (err) {
        setFeedbackMessage(
          err instanceof Error ? err.message : "Impossible de charger la proposition.",
        );
        setPending(null);
        setUx("error");
      }
    },
    [syncUxFromPending],
  );

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadPending();
    }, 0);

    return () => window.clearTimeout(initialLoad);
  }, [loadPending]);

  useEffect(() => {
    if (!listenForDraftChanges) return undefined;

    const onDraftChanged = () => {
      void loadPending();
    };

    window.addEventListener(MISSION_DRAFT_CHANGED_EVENT, onDraftChanged);
    return () => window.removeEventListener(MISSION_DRAFT_CHANGED_EVENT, onDraftChanged);
  }, [listenForDraftChanges, loadPending]);

  useEffect(() => {
    return () => {
      if (cancelledTimerRef.current) {
        clearTimeout(cancelledTimerRef.current);
      }
    };
  }, []);

  async function runAction(kind: "confirm" | "cancel") {
    if (!pending?.pendingDraftId || actionInFlightRef.current || isMissionDraftActionInFlight(ux)) {
      return;
    }

    actionInFlightRef.current = true;
    setUx(kind === "confirm" ? "confirming" : "cancelling");
    setFeedbackMessage(null);

    try {
      const response = await fetch(`/api/missions/draft/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingDraftId: pending.pendingDraftId }),
      });

      const data = (await response.json()) as CommandResult & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? `API ${response.status}`);
      }

      if (kind === "confirm") {
        const mapped = mapConfirmDraftResponse(data);
        if (mapped.outcome === "confirmed") {
          setConfirmed({
            missionId: mapped.missionId,
            calendarEvent: mapped.calendarEvent,
            summary: mapped.summary,
          });
          setUx("confirmed");
          window.dispatchEvent(new CustomEvent("michael-hq:calendar-changed"));
          dispatchApprovalResolved({
            source: "mission-draft",
            decision: "approved",
            summary:
              mapped.summary ??
              `Calendrier confirmé — ${mapped.calendarEvent.title} (${mapped.calendarEvent.dateISO} ${mapped.calendarEvent.startTime}).`,
            href: "/hq#agenda-panel",
          });
        } else {
          setFeedbackMessage(mapped.message);
          setUx("unavailable");
        }
      } else {
        const mapped = mapCancelDraftResponse(data);
        if (mapped.outcome === "cancelled") {
          setConfirmed(null);
          setUx("cancelled");
          dispatchApprovalResolved({
            source: "mission-draft",
            decision: "cancelled",
            summary: "Proposition de booking refusée. Aucun événement créé.",
            href: "/hq#command-center",
          });
          if (cancelledTimerRef.current) {
            clearTimeout(cancelledTimerRef.current);
          }
          cancelledTimerRef.current = setTimeout(() => {
            setUx("idle");
            setFeedbackMessage(null);
            cancelledTimerRef.current = null;
          }, MISSION_DRAFT_CANCELLED_BANNER_MS);
        } else {
          setFeedbackMessage(mapped.message);
          setUx("unavailable");
        }
      }

      dispatchDraftChanged();
      await loadPending({ skipUxSync: true });
    } catch (err) {
      setFeedbackMessage(err instanceof Error ? err.message : "Action impossible.");
      setUx("error");
    } finally {
      actionInFlightRef.current = false;
    }
  }

  const actionsDisabled = isMissionDraftActionInFlight(ux);

  if (variant === "embedded") {
    if (ux === "loading") return null;
    if (ux === "idle" && !feedbackMessage) return null;
  }

  if (ux === "loading" && variant === "banner") {
    return (
      <section
        id="mission-draft-pending"
        data-testid="mission-draft-pending-banner"
        data-ux-state="loading"
        className="rounded-3xl border border-neutral-800 bg-neutral-950/70 p-5"
      >
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement des propositions en attente…
        </div>
      </section>
    );
  }

  if (ux === "confirmed" && confirmed) {
    const event = confirmed.calendarEvent;
    return (
      <section
        id="mission-draft-pending"
        data-testid="mission-draft-confirmed-banner"
        data-ux-state="confirmed"
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
            <p className="mt-2 text-sm text-neutral-400">
              Le rendez-vous est réservé. Ce n&apos;est pas une approbation d&apos;exécution de mission
              (Phase 2 reste mock sur Mission Control).
            </p>
            {confirmed.summary ? (
              <p className="mt-2 text-sm leading-6 text-neutral-500">{confirmed.summary}</p>
            ) : null}
            <details className="mt-3 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-neutral-400">
                Détails techniques
              </summary>
              <p className="mt-2 font-mono text-xs text-emerald-200/90">missionId: {confirmed.missionId}</p>
            </details>
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

  if (ux === "cancelled") {
    return (
      <section
        id="mission-draft-pending"
        data-testid="mission-draft-cancelled-banner"
        data-ux-state="cancelled"
        className="rounded-3xl border border-neutral-600/40 bg-neutral-800/40 p-5"
      >
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-neutral-300" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-300">
              {MISSION_DRAFT_CANCELLED_LABEL}
            </p>
            <p className="mt-1 text-sm leading-6 text-neutral-300">
              Aucun rendez-vous n&apos;a été créé. Tu peux demander une nouvelle proposition via Joris.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (ux === "unavailable" && feedbackMessage) {
    if (variant === "embedded") return null;
    return (
      <section
        id="mission-draft-pending"
        data-testid="mission-draft-unavailable-banner"
        data-ux-state="unavailable"
        className="rounded-3xl border border-sky-500/25 bg-sky-500/10 p-5"
      >
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">
              Proposition indisponible
            </p>
            <p className="mt-1 text-sm leading-6 text-neutral-300">{feedbackMessage}</p>
          </div>
        </div>
      </section>
    );
  }

  if (ux === "error" && feedbackMessage) {
    if (variant === "embedded") return null;
    return (
      <section
        id="mission-draft-pending"
        data-testid="mission-draft-error-banner"
        data-ux-state="error"
        className="rounded-3xl border border-red-500/25 bg-red-500/10 p-5"
        role="alert"
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-300">Erreur</p>
            <p className="mt-1 text-sm leading-6 text-neutral-300">{feedbackMessage}</p>
          </div>
        </div>
      </section>
    );
  }

  if (ux === "expired") {
    const expiredTestId =
      variant === "banner" ? "mission-draft-pending-banner" : "mission-draft-pending-embedded";

    return (
      <section
        id={variant === "banner" ? "mission-draft-pending" : undefined}
        data-testid={expiredTestId}
        data-ux-state="expired"
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
                La proposition calendrier a expiré. Demande un nouveau rendez-vous via Joris pour générer une
                proposition fraîche.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
            {variant === "embedded" ? (
              <Link
                href={HQ_DRAFT_ANCHOR}
                className="inline-flex min-h-9 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 text-sm font-semibold text-amber-200 transition hover:border-amber-500/50"
              >
                Reprendre sur Michael HQ
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setDismissedExpired(true);
                setUx("idle");
              }}
              className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-neutral-700 px-4 text-sm font-semibold text-neutral-200 transition hover:border-neutral-500"
            >
              Fermer
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (ux !== "active" && ux !== "confirming" && ux !== "cancelling") {
    return null;
  }

  const preview = pending?.preview;
  if (!preview) {
    return null;
  }
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
      data-ux-state={ux}
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
              <span className="rounded-md border border-neutral-700 px-2 py-0.5 text-neutral-400">
                {expiryLabel}
              </span>
            </div>
            {pending.pendingDraftId ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowTechnicalDetails((open) => !open)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-500 hover:text-neutral-300"
                  aria-expanded={showTechnicalDetails}
                >
                  {showTechnicalDetails ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  Détails techniques
                </button>
                {showTechnicalDetails ? (
                  <p className="mt-2 font-mono text-xs text-neutral-500">{pending.pendingDraftId}</p>
                ) : null}
              </div>
            ) : null}
            <p className="mt-3 text-xs leading-5 text-neutral-500">
              {variant === "embedded"
                ? "Confirmer ou refuser le rendez-vous se fait sur Michael HQ — distinct de l'approbation exécuteur (Phase 2, mock)."
                : "Confirmer le rendez-vous crée une mission draft locale et réserve le calendrier (missionId sur le ledger). Ce n'est pas l'approbation exécuteur Phase 2."}
            </p>
          </div>
        </div>

        <div
          className={`flex shrink-0 flex-col gap-2 sm:items-end ${actionsDisabled ? "pointer-events-none opacity-60" : ""}`}
          aria-busy={actionsDisabled}
        >
          {variant === "embedded" ? (
            <Link
              href={HQ_DRAFT_ANCHOR}
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-amber-400 sm:w-auto"
            >
              Confirmer ou refuser sur Michael HQ
            </Link>
          ) : (
            <>
              {ux === "confirming" ? (
                <p className="text-xs text-amber-200/90">Confirmation du rendez-vous en cours…</p>
              ) : null}
              {ux === "cancelling" ? (
                <p className="text-xs text-amber-200/90">Refus de la proposition en cours…</p>
              ) : null}
              <button
                type="button"
                disabled={actionsDisabled}
                onClick={() => void runAction("confirm")}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {ux === "confirming" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirmer le rendez-vous
              </button>
              <button
                type="button"
                disabled={actionsDisabled}
                onClick={() => void runAction("cancel")}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 text-sm font-semibold text-red-200 transition hover:border-red-500/50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {ux === "cancelling" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Refuser la proposition
              </button>
            </>
          )}
        </div>
      </div>

      {feedbackMessage && ux === "active" ? (
        <div
          className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{feedbackMessage}</p>
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
