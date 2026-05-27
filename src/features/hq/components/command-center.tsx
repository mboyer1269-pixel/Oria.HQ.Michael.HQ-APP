"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Bell,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Mic,
  Send,
  ShieldCheck,
} from "lucide-react";
import type { ActionLedgerStatus, CalendarEvent, MissionDraftPreview } from "@/features/hq/types";
import {
  formatMissionDraftExpiryLabel,
  formatMissionDraftSchedule,
  MISSION_DRAFT_CHANGED_EVENT,
} from "@/features/hq/mission-draft-format";

type ChatResponse = {
  summary: string;
  intent?: string;
  modelId?: string;
  costMode?: string;
  calendarEvent?: CalendarEvent;
  ledgerStatus?: ActionLedgerStatus;
  storageMode?: string;
  requiresConfirmation?: boolean;
  missionDraftPreview?: MissionDraftPreview;
  pendingDraftId?: string;
  missionId?: string;
};

type ErrorResponse = {
  error?: string;
};

function formatReminderLabel(remindersMinutes: number[]) {
  return remindersMinutes.map((minutes) => `${minutes} min`).join(" + ");
}

function formatStorageLabel(storageMode?: string) {
  if (storageMode === "supabase") return "Base privée";
  if (storageMode === "local") return "Session locale";

  return storageMode;
}

function formatLedgerLabel(status: ActionLedgerStatus) {
  return status === "recorded" ? "Action journalisée" : "Journal à vérifier";
}

function toUserError(error: unknown) {
  const message = error instanceof Error ? error.message : "Joris est temporairement indisponible.";

  if (/Joris API \d+/.test(message)) {
    return "Joris ne répond pas pour le moment. Réessaie dans quelques instants.";
  }

  return message;
}

function notifyMissionDraftChanged(data: ChatResponse) {
  if (data.intent === "mission.draft" || data.missionDraftPreview || data.pendingDraftId) {
    window.dispatchEvent(new CustomEvent(MISSION_DRAFT_CHANGED_EVENT));
  }

  if (data.intent === "calendar.book" && data.calendarEvent) {
    window.dispatchEvent(new CustomEvent(MISSION_DRAFT_CHANGED_EVENT));
  }
}

const bookingExamples = [
  "Joris, book un rendez-vous dentiste pour les enfants demain à 18:00",
  "Joris, book un suivi avec Eric vendredi à 9:30",
];

function MissionDraftProposalHint({ preview }: { preview: MissionDraftPreview }) {
  const schedule = formatMissionDraftSchedule(preview);
  const expiryLabel = formatMissionDraftExpiryLabel(undefined, preview.expiresAt);

  return (
    <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
      <div className="flex items-start gap-3">
        <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Proposition en attente</p>
          <p className="mt-1 font-medium text-white">{preview.title}</p>
          {schedule ? <p className="mt-1 text-sm text-amber-100">{schedule}</p> : null}
          <p className="mt-2 text-xs text-neutral-500">{expiryLabel}</p>
          <Link
            href="#mission-draft-pending"
            className="mt-3 inline-flex text-sm font-semibold text-amber-300 underline-offset-2 hover:underline"
          >
            Approuver ou refuser dans le bandeau Mission draft
          </Link>
        </div>
      </div>
    </div>
  );
}

export function CommandCenter() {
  const [command, setCommand] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ChatResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = command.trim();
    if (!text || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/joris/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, locale: "fr-CA" }),
      });

      const data = (await response.json()) as ChatResponse & ErrorResponse;

      if (!response.ok) {
        throw new Error(data.error ?? `Joris API ${response.status}`);
      }

      setResult(data);
      notifyMissionDraftChanged(data);
      if (data.calendarEvent) {
        window.dispatchEvent(new CustomEvent("michael-hq:calendar-changed"));
      }
      setCommand("");
    } catch (err) {
      setError(toUserError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      id="command-center"
      data-testid="command-center"
      aria-busy={loading}
      className="rounded-3xl border border-amber-500/30 bg-neutral-950/85 p-4 shadow-2xl shadow-amber-950/20 md:p-6"
    >
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-400">Command Center</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Parler à Joris</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-400">
            Donne une commande claire à Joris dans le contexte Michael HQ. Les modes métier viendront ensuite cadrer
            les demandes finance, immobilier et autres niches.
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
          <ShieldCheck className="h-3.5 w-3.5" />
          Permissions actives
        </div>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3 md:flex-row">
        <div className="flex min-h-14 flex-1 items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 px-4 transition focus-within:border-amber-500/60 focus-within:ring-2 focus-within:ring-amber-500/10">
          <Mic className="h-5 w-5 shrink-0 text-neutral-500" />
          <input
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-neutral-600"
            placeholder="Joris, book un rendez-vous demain à 18:00..."
            aria-label="Commande pour Joris"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !command.trim()}
          className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-5 font-semibold text-neutral-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500 md:w-auto"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {loading ? "Joris traite..." : "Envoyer"}
        </button>
      </form>

      {!result && !error && (
        <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Prêt pour le workspace Michael HQ</p>
              <p className="mt-1 text-sm leading-6 text-neutral-400">
                Commence avec un booking simple. Joris montre le résultat et journalise l&apos;action quand l&apos;agenda
                est mis à jour.
              </p>
            </div>
            <span className="w-fit rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200">
              Aucun résultat encore
            </span>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            {bookingExamples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setCommand(example)}
                className="min-h-10 rounded-lg border border-neutral-800 px-3 text-left text-sm text-neutral-300 transition hover:border-amber-500/40 hover:text-amber-200"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      {result && (
        <div
          className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900/80 p-4"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
            <div>
              <p className="text-sm font-semibold text-white">Réponse de Joris</p>
              <p className="mt-1 text-sm leading-6 text-neutral-300">{result.summary}</p>
            </div>
          </div>

          {result.missionDraftPreview && result.requiresConfirmation ? (
            <MissionDraftProposalHint preview={result.missionDraftPreview} />
          ) : null}

          {result.calendarEvent && (
            <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <CalendarCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
                      {result.missionId ? "Calendrier confirmé" : "Rendez-vous booké"}
                    </p>
                    <p className="mt-1 font-medium text-white">{result.calendarEvent.title}</p>
                    <p className="mt-1 text-sm text-neutral-300">Ajouté à l&apos;agenda du workspace Michael HQ.</p>
                    {result.missionId ? (
                      <p className="mt-2 font-mono text-xs text-emerald-200/90">missionId: {result.missionId}</p>
                    ) : null}
                  </div>
                </div>
                <span className="w-fit rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
                  Confirmé
                </span>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Date</p>
                  <p className="mt-1 text-sm font-medium text-white">{result.calendarEvent.dateISO}</p>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Heure</p>
                  <p className="mt-1 text-sm font-medium text-white">
                    {result.calendarEvent.startTime} à {result.calendarEvent.endTime}
                  </p>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Rappels</p>
                  <p className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-white">
                    <Bell className="h-3.5 w-3.5 text-amber-300" />
                    {formatReminderLabel(result.calendarEvent.remindersMinutes)}
                  </p>
                </div>
              </div>

              {result.missionId ? (
                <Link
                  href="#ledger-activity"
                  className="mt-4 inline-flex text-sm font-semibold text-emerald-300 underline-offset-2 hover:underline"
                >
                  Voir la trace ledger (Liée)
                </Link>
              ) : null}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-500">
            {result.modelId && <span>Modèle: {result.modelId}</span>}
            {result.costMode && <span>Mode: {result.costMode}</span>}
            {result.storageMode && <span>Stockage: {formatStorageLabel(result.storageMode)}</span>}
            {result.ledgerStatus && (
              <span className={result.ledgerStatus === "recorded" ? "text-emerald-300" : "text-amber-300"}>
                {formatLedgerLabel(result.ledgerStatus)}
              </span>
            )}
            {result.requiresConfirmation && !result.missionDraftPreview ? (
              <span className="text-amber-300">Confirmation requise</span>
            ) : null}
          </div>
        </div>
      )}

      {error && (
        <div
          className="mt-4 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium text-red-100">Joris n&apos;a pas pu compléter ça.</p>
            <p className="mt-1 leading-6">{error}</p>
          </div>
        </div>
      )}
    </section>
  );
}
