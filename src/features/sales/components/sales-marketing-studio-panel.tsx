"use client";

// Directeur Marketing — multi-channel content packs for lead generation.

import { useState } from "react";
import {
  ClipboardCopy,
  Film,
  Loader2,
  Megaphone,
  Sparkles,
  Video,
} from "lucide-react";
import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import type {
  MarketingChannel,
  MarketingContentPack,
  MarketingContentPiece,
} from "@/features/sales/marketing-content-pack";

type Props = {
  vehicles: VehicleStock[];
};

const CHANNEL_ICON: Record<MarketingChannel, typeof Megaphone> = {
  facebook_post: Megaphone,
  facebook_ad: Sparkles,
  instagram_reel: Film,
  youtube_short: Video,
  marketplace_hook: Megaphone,
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function SalesMarketingStudioPanel({ vehicles }: Props) {
  const [stockId, setStockId] = useState(vehicles[0]?.stockId ?? "");
  const [busy, setBusy] = useState(false);
  const [pack, setPack] = useState<MarketingContentPack | null>(null);
  const [activeChannel, setActiveChannel] = useState<MarketingChannel>("facebook_post");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const activePiece: MarketingContentPiece | undefined = pack?.pieces.find(
    (p) => p.channel === activeChannel,
  );

  async function generate() {
    if (!stockId) return;
    setBusy(true);
    setErr("");
    try {
      const vehicle = vehicles.find((v) => v.stockId === stockId);
      const res = await fetch("/api/sales/marketing-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockId, vehicle }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.pack) {
        setErr(payload?.error ?? "Génération échouée.");
        return;
      }
      setPack(payload.pack as MarketingContentPack);
      setActiveChannel("facebook_post");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Génération échouée.");
    } finally {
      setBusy(false);
    }
  }

  async function flashCopy(key: string, text: string) {
    const ok = await copyText(text);
    if (ok) {
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1500);
    }
  }

  return (
    <section className="rounded-2xl border border-fuchsia-500/25 bg-gradient-to-b from-fuchsia-500/[0.07] via-black/25 to-black/45 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-white">Directeur Marketing</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-neutral-400 sm:text-sm">
              Pubs Meta, posts Facebook, scripts Reel et YouTube Short — optimisés pour générer des
              prospects à Gatineau. Tu publies; Oria prépare le contenu gagnant.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={stockId}
            onChange={(e) => setStockId(e.target.value)}
            className="min-w-[12rem] rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-white"
          >
            {vehicles.length === 0 ? <option value="">Sync inventaire d&apos;abord</option> : null}
            {vehicles.map((v) => (
              <option key={v.stockId} value={v.stockId}>
                {v.stockId} — {v.year} {v.make} {v.model}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !stockId}
            onClick={() => void generate()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-fuchsia-500 px-4 text-sm font-bold text-white hover:bg-fuchsia-400 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Générer contenus
          </button>
        </div>
      </div>

      {err ? <p className="mt-3 text-xs text-rose-300">{err}</p> : null}

      {pack ? (
        <div className="mt-4">
          <p className="text-sm font-semibold text-fuchsia-100">{pack.vehicleTitle}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {pack.pieces.map((piece) => {
              const Icon = CHANNEL_ICON[piece.channel];
              const active = activeChannel === piece.channel;
              return (
                <button
                  key={piece.channel}
                  type="button"
                  onClick={() => setActiveChannel(piece.channel)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                    active
                      ? "border-fuchsia-400/50 bg-fuchsia-500/20 text-fuchsia-50"
                      : "border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-600"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {piece.label}
                </button>
              );
            })}
          </div>

          {activePiece ? (
            <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/35 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-fuchsia-300/80">
                {activePiece.label}
              </p>
              <p className="mt-2 text-sm font-semibold text-white">{activePiece.headline}</p>
              <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-5 text-neutral-300">
                {activePiece.body}
              </pre>
              {activePiece.shotNotes && activePiece.shotNotes.length > 0 ? (
                <ul className="mt-3 space-y-1 text-[11px] text-neutral-400">
                  {activePiece.shotNotes.map((s) => (
                    <li key={s}>🎬 {s}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void flashCopy(`body-${activePiece.channel}`, activePiece.body)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-semibold text-neutral-200"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                  {copiedKey === `body-${activePiece.channel}` ? "Copié" : "Copier contenu"}
                </button>
                {activePiece.hashtags.length > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      void flashCopy(`tags-${activePiece.channel}`, activePiece.hashtags.join(" "))
                    }
                    className="rounded-lg border border-neutral-800 px-3 py-2 text-xs text-neutral-400 hover:text-white"
                  >
                    Copier hashtags
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
            <p className="text-xs font-bold text-emerald-100">Conseils conversion leads</p>
            <ul className="mt-2 space-y-1 text-[11px] leading-5 text-neutral-300">
              {pack.leadTips.map((tip) => (
                <li key={tip}>• {tip}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-center text-xs text-neutral-500">
          Choisis un véhicule et génère pubs, posts, Reels et scripts YouTube en un clic.
        </p>
      )}
    </section>
  );
}
