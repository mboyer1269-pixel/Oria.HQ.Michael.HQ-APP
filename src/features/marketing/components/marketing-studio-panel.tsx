"use client";

// Marketing director panel — per-vehicle content pack (post / pub / scripts
// vidéo Reels & YouTube) + 7-day content calendar driven by the inventory.

import { useMemo, useState } from "react";
import {
  CalendarDays,
  Clapperboard,
  ClipboardCopy,
  Loader2,
  Sparkles,
  Video,
} from "lucide-react";
import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import type { VehicleContentPack, VideoScript } from "@/features/marketing/content-pack";
import type { ContentCalendar } from "@/features/marketing/content-calendar";

const SLOT_KIND_LABEL: Record<string, string> = {
  vehicle_spotlight: "Spotlight véhicule",
  reel_video: "Vidéo",
  trust_story: "Preuve sociale",
  lead_magnet: "Lead magnet",
  market_insight: "Chiffre marché",
};

const SLOT_KIND_CHIP: Record<string, string> = {
  vehicle_spotlight: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  reel_video: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300",
  trust_story: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  lead_magnet: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  market_insight: "border-violet-500/30 bg-violet-500/10 text-violet-300",
};

const CHANNEL_LABEL: Record<string, string> = {
  facebook_page: "Page FB",
  marketplace: "Marketplace",
  reel_short: "Reel / Short",
  youtube: "YouTube",
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function scriptToText(script: VideoScript): string {
  return [
    `SCRIPT ${script.platform === "reel_short" ? "REEL / SHORT" : "YOUTUBE"} (${script.durationSeconds}s)`,
    `Hook : ${script.hookFr}`,
    "",
    ...script.scenes.map((s) => `[${s.timecode}] ${s.shot}\n  VO : ${s.voiceoverFr}`),
    "",
    `CTA : ${script.ctaFr}`,
    "",
    "Légende :",
    script.captionFr,
  ].join("\n");
}

export function MarketingStudioPanel({ vehicles }: { vehicles: VehicleStock[] }) {
  const [selectedStockId, setSelectedStockId] = useState("");
  const [packBusy, setPackBusy] = useState(false);
  const [pack, setPack] = useState<VehicleContentPack | null>(null);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendar, setCalendar] = useState<ContentCalendar | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const sortedVehicles = useMemo(
    () => [...vehicles].sort((a, b) => a.stockId.localeCompare(b.stockId)),
    [vehicles],
  );

  async function flashCopy(key: string, text: string) {
    const ok = await copyText(text);
    if (ok) {
      setCopiedId(key);
      window.setTimeout(() => setCopiedId(null), 1500);
    }
  }

  async function generatePack() {
    if (!selectedStockId) return;
    setPackBusy(true);
    setErrorMsg("");
    try {
      const vehicle = vehicles.find((v) => v.stockId === selectedStockId);
      const res = await fetch("/api/marketing/content-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockId: selectedStockId, vehicle }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.pack) {
        setErrorMsg(payload?.error ?? "Génération du pack échouée.");
        return;
      }
      setPack(payload.pack as VehicleContentPack);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Génération du pack échouée.");
    } finally {
      setPackBusy(false);
    }
  }

  async function generateCalendar() {
    setCalendarBusy(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/marketing/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventory: vehicles }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.calendar) {
        setErrorMsg(payload?.error ?? "Génération du calendrier échouée.");
        return;
      }
      setCalendar(payload.calendar as ContentCalendar);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Génération du calendrier échouée.");
    } finally {
      setCalendarBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-fuchsia-500/20 bg-gradient-to-b from-fuchsia-500/[0.06] via-black/25 to-black/45 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300">
          <Clapperboard className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">
            Directeur Marketing
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-neutral-400 sm:text-sm">
            Pack contenu par véhicule (post FB, description Marketplace, pub, scripts Reel 30s +
            YouTube 60s) et calendrier 7 jours orienté génération de leads.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="block min-w-0 flex-1">
          <span className="text-[11px] font-semibold text-neutral-400">Véhicule</span>
          <select
            value={selectedStockId}
            onChange={(e) => setSelectedStockId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-fuchsia-500/40"
          >
            <option value="">— Choisir un stock —</option>
            {sortedVehicles.map((v) => (
              <option key={v.stockId} value={v.stockId}>
                {v.stockId} — {v.year} {v.make} {v.model}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={packBusy || !selectedStockId}
          onClick={() => void generatePack()}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-fuchsia-500 px-4 text-sm font-bold text-white hover:bg-fuchsia-400 disabled:opacity-40"
        >
          {packBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Pack contenu
        </button>
        <button
          type="button"
          disabled={calendarBusy}
          onClick={() => void generateCalendar()}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/10 px-4 text-sm font-bold text-fuchsia-200 hover:bg-fuchsia-500/20 disabled:opacity-40"
        >
          {calendarBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CalendarDays className="h-4 w-4" />
          )}
          Calendrier 7 jours
        </button>
      </div>

      {errorMsg ? <p className="mt-3 text-xs text-rose-300">{errorMsg}</p> : null}

      {pack ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl border border-white/[0.06] bg-black/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-fuchsia-200">
                  Post Facebook — {pack.vehicleLabel}
                </p>
                <button
                  type="button"
                  onClick={() => void flashCopy("pack-fb", pack.facebookPostFr)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-200 hover:border-fuchsia-500/40"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                  {copiedId === "pack-fb" ? "Copié" : "Copier"}
                </button>
              </div>
              <pre className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-5 text-neutral-300">
                {pack.facebookPostFr}
              </pre>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-black/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-fuchsia-200">
                  Pub (annonce payante)
                </p>
                <button
                  type="button"
                  onClick={() =>
                    void flashCopy(
                      "pack-ad",
                      `${pack.adCopy.headlineFr}\n\n${pack.adCopy.primaryTextFr}\n\n${pack.adCopy.descriptionFr}\nCTA : ${pack.adCopy.ctaLabelFr}`,
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-200 hover:border-fuchsia-500/40"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                  {copiedId === "pack-ad" ? "Copié" : "Copier"}
                </button>
              </div>
              <p className="mt-2 text-sm font-bold text-white">{pack.adCopy.headlineFr}</p>
              <p className="mt-1 text-xs leading-5 text-neutral-300">{pack.adCopy.primaryTextFr}</p>
              <p className="mt-1 text-[11px] text-neutral-500">
                {pack.adCopy.descriptionFr} · CTA : {pack.adCopy.ctaLabelFr}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {pack.videoScripts.map((script) => (
              <div
                key={script.platform}
                className="rounded-2xl border border-white/[0.06] bg-black/30 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-fuchsia-200">
                    <Video className="h-3.5 w-3.5" />
                    {script.platform === "reel_short" ? "Reel / Short" : "YouTube"} ·{" "}
                    {script.durationSeconds}s
                  </p>
                  <button
                    type="button"
                    onClick={() => void flashCopy(`pack-${script.platform}`, scriptToText(script))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-200 hover:border-fuchsia-500/40"
                  >
                    <ClipboardCopy className="h-3.5 w-3.5" />
                    {copiedId === `pack-${script.platform}` ? "Copié" : "Copier le script"}
                  </button>
                </div>
                <p className="mt-2 text-xs font-semibold text-white">Hook : {script.hookFr}</p>
                <ul className="mt-2 space-y-1.5 text-[11px] leading-5 text-neutral-300">
                  {script.scenes.map((scene) => (
                    <li key={scene.timecode}>
                      <span className="font-mono text-fuchsia-300">[{scene.timecode}]</span>{" "}
                      {scene.shot} — <span className="text-neutral-400">{scene.voiceoverFr}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-emerald-300">CTA : {script.ctaFr}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {calendar ? (
        <div className="mt-4 rounded-2xl border border-white/[0.06] bg-black/30 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-fuchsia-200">
            Calendrier de contenu — 7 jours
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {calendar.slots.map((slot) => (
              <div
                key={`${slot.dayOffset}-${slot.kind}`}
                className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-bold text-white">{slot.dayLabelFr}</p>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SLOT_KIND_CHIP[slot.kind] ?? SLOT_KIND_CHIP.trust_story}`}
                  >
                    {SLOT_KIND_LABEL[slot.kind] ?? slot.kind}
                  </span>
                  <span className="rounded-full border border-neutral-800 px-2 py-0.5 text-[10px] text-neutral-500">
                    {CHANNEL_LABEL[slot.channelHint] ?? slot.channelHint}
                  </span>
                </div>
                <p className="mt-1.5 text-xs font-semibold text-fuchsia-100">{slot.titleFr}</p>
                <p className="mt-1 text-[11px] leading-4 text-neutral-400">{slot.briefFr}</p>
              </div>
            ))}
          </div>
          <ul className="mt-3 space-y-1 text-[11px] leading-5 text-neutral-400">
            {calendar.operatorNotesFr.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
