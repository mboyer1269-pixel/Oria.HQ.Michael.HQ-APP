"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Bell, CalendarCheck2, CalendarDays, RefreshCw } from "lucide-react";
import type { CalendarEvent } from "@/features/hq/types";

type CalendarEventsResponse = {
  events?: CalendarEvent[];
  error?: string;
};

function formatReminderLabel(remindersMinutes: number[]) {
  return remindersMinutes.map((minutes) => `${minutes} min`).join(" + ");
}

function formatEventDate(dateISO: string) {
  const [year, month, day] = dateISO.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return new Intl.DateTimeFormat("fr-CA", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatStorageLabel(storageMode: CalendarEvent["storageMode"]) {
  return storageMode === "supabase" ? "Base privée" : "Session locale";
}

function toAgendaError(error: unknown) {
  const message = error instanceof Error ? error.message : "Impossible de charger l'agenda.";

  if (/Agenda API \d+/.test(message)) {
    return "L'agenda ne répond pas pour le moment. Réessaie dans quelques instants.";
  }

  return message;
}

export function AgendaPanel() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/calendar/events?limit=8", {
        cache: "no-store",
      });
      const data = (await response.json()) as CalendarEventsResponse;

      if (!response.ok) {
        throw new Error(data.error ?? `Agenda API ${response.status}`);
      }

      setEvents(data.events ?? []);
    } catch (err) {
      setError(toAgendaError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadEvents();
    }, 0);

    window.addEventListener("michael-hq:calendar-changed", loadEvents);

    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("michael-hq:calendar-changed", loadEvents);
    };
  }, [loadEvents]);

  return (
    <section
      id="agenda-panel"
      data-testid="agenda-panel"
      aria-busy={loading}
      className="rounded-3xl border border-neutral-800 bg-neutral-950/85 p-4 md:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-400">Agenda</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Prochains bookings</h2>
          <p className="mt-1 text-sm leading-6 text-neutral-400">
            Les événements créés par Joris Book apparaissent ici dès qu&apos;ils sont confirmés dans le Command Center.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadEvents()}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-800 text-neutral-400 transition hover:border-amber-500/40 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Rafraîchir l'agenda"
          disabled={loading}
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </button>
      </div>

      <div className="mt-5 space-y-3" aria-live="polite">
        {loading && events.length === 0 && (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
            <div className="flex items-center gap-2 text-sm text-neutral-300">
              <LoaderRows />
              Vérification des prochains bookings...
            </div>
            <div className="mt-4 space-y-2">
              <div className="h-3 w-2/3 rounded-full bg-neutral-800" />
              <div className="h-3 w-1/2 rounded-full bg-neutral-800" />
            </div>
          </div>
        )}

        {loading && events.length > 0 && (
          <p className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Mise à jour de l&apos;agenda...
          </p>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/40 p-5">
            <CalendarDays className="h-6 w-6 text-neutral-500" />
            <p className="mt-3 font-medium text-white">Rien de booké pour l&apos;instant.</p>
            <p className="mt-1 text-sm leading-6 text-neutral-500">
              Va au Command Center et essaie: “Joris, book un rendez-vous banque demain à 18:00”.
            </p>
            <a
              href="#command-center"
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg border border-neutral-700 px-3 text-sm font-semibold text-neutral-200 transition hover:border-amber-500/40 hover:text-amber-200"
            >
              Ouvrir Command Center
            </a>
          </div>
        )}

        {events.map((event) => (
          <article key={event.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex gap-3">
                <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-200">
                  <CalendarCheck2 className="h-4 w-4" />
                  <span className="mt-0.5 text-[10px] font-semibold uppercase">OK</span>
                </div>
                <div>
                  <p className="font-medium text-white">{event.title}</p>
                  <p className="mt-1 text-sm text-neutral-300">
                    {formatEventDate(event.dateISO)} · {event.startTime} à {event.endTime}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">{event.dateISO}</p>
                </div>
              </div>
              <span className="w-fit rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
                {formatStorageLabel(event.storageMode)}
              </span>
            </div>
            <p className="mt-3 inline-flex items-center gap-2 text-xs text-amber-200">
              <Bell className="h-3.5 w-3.5" />
              Rappels: {formatReminderLabel(event.remindersMinutes)}
            </p>
          </article>
        ))}

        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200" role="alert">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium text-red-100">Impossible de charger l&apos;agenda.</p>
                <p className="mt-1 leading-6">{error}</p>
                <button
                  type="button"
                  onClick={() => void loadEvents()}
                  className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-red-400/20 px-3 text-xs font-semibold text-red-100 transition hover:bg-red-500/10"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Réessayer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function LoaderRows() {
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center" aria-hidden="true">
      <span className="h-2 w-2 animate-ping rounded-full bg-amber-300" />
    </span>
  );
}
