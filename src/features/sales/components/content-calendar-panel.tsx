"use client";

// 7-day marketing calendar panel — prepare-only briefs.

import { useState } from "react";
import { CalendarDays, Loader2, Megaphone } from "lucide-react";
import type { SalesContentCalendar } from "@/features/sales/sales-content-calendar";

type Props = {
  initialCalendar: SalesContentCalendar | null;
};

const KIND_LABEL: Record<string, string> = {
  vehicle_spotlight: "Spotlight",
  reel_video: "Reel",
  trust_story: "Preuve",
  lead_magnet: "Aimant lead",
  market_insight: "Marché",
  livre_fill: "Livre",
};

export function ContentCalendarPanel({ initialCalendar }: Props) {
  const [calendar, setCalendar] = useState<SalesContentCalendar | null>(initialCalendar);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function refresh() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/sales/marketing/calendar");
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.calendar) {
        setMsg(payload?.error ?? "Calendrier indisponible.");
        return;
      }
      setCalendar(payload.calendar as SalesContentCalendar);
      setMsg("Calendrier 7 jours prêt — prepare-only.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erreur calendrier.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.05] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-sky-500/30 bg-sky-500/10 text-sky-300">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-white">
              Calendrier marketing 7 jours
            </h2>
            <p className="mt-1 max-w-xl text-xs leading-5 text-neutral-400">
              Plan adjoint : spotlights, Reels, preuve sociale, brief marché, et jours dédiés à
              remplir le livre. Toi tu publies.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void refresh()}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 text-sm font-bold text-neutral-950 hover:bg-sky-400 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
          {calendar ? "Régénérer" : "Générer le plan"}
        </button>
      </div>

      {calendar ? (
        <>
          <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {calendar.slots.map((slot) => (
              <li
                key={`${slot.dayOffset}-${slot.kind}-${slot.stockId ?? "x"}`}
                className="rounded-xl border border-white/[0.06] bg-black/30 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-sky-300/80">
                    {slot.dayLabelFr}
                  </p>
                  <span className="rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-100">
                    {KIND_LABEL[slot.kind] ?? slot.kind}
                  </span>
                </div>
                <p className="mt-2 text-xs font-semibold text-white">{slot.titleFr}</p>
                <p className="mt-1 text-[11px] leading-5 text-neutral-400">{slot.briefFr}</p>
                <p className="mt-2 text-[10px] uppercase tracking-wide text-neutral-600">
                  {slot.channelHint}
                  {slot.vehicleLabel ? ` · ${slot.vehicleLabel}` : ""}
                </p>
              </li>
            ))}
          </ol>
          <ul className="mt-3 space-y-1 text-[11px] leading-5 text-neutral-500">
            {calendar.operatorNotesFr.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-3 text-xs text-neutral-500">
          Génère le plan pour la semaine (spotlights depuis inventaire + jours livre).
        </p>
      )}

      {msg ? <p className="mt-3 text-xs text-emerald-300">{msg}</p> : null}
    </section>
  );
}
