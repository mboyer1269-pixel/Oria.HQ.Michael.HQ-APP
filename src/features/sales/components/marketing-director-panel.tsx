"use client";

// Directeur Marketing — packs multi-canal (Marketplace, FB, Reel, Short, pub Meta).
// Prepare-only content studio for lead gen. Human publishes.

import { useEffect, useMemo, useState } from "react";
import {
  Clapperboard,
  ClipboardCopy,
  Loader2,
  Megaphone,
  Sparkles,
  Youtube,
} from "lucide-react";
import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import type {
  MarketingAsset,
  MarketingChannel,
  MarketingContentPack,
} from "@/features/sales/marketing-content-pack";
import { formatMarketingAssetClipboard } from "@/features/sales/marketing-content-pack";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const CHANNEL_META: Record<
  MarketingChannel,
  { short: string; tone: string }
> = {
  marketplace: { short: "Marketplace", tone: "border-sky-500/40 bg-sky-500/10 text-sky-200" },
  facebook_page: { short: "FB Page", tone: "border-blue-500/40 bg-blue-500/10 text-blue-200" },
  instagram_reel: { short: "Reel", tone: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200" },
  youtube_short: { short: "Short", tone: "border-rose-500/40 bg-rose-500/10 text-rose-200" },
  meta_ad: { short: "Pub Meta", tone: "border-amber-500/40 bg-amber-500/10 text-amber-200" },
};

export type MarketingDirectorPanelProps = {
  vehicles: VehicleStock[];
  initialStockId?: string | null;
  packs: MarketingContentPack[];
  onPackReady: (pack: MarketingContentPack) => void;
  onPackPublished: (pack: MarketingContentPack) => void;
  /** When true, auto-generate pack for initialStockId on mount. */
  autoPrepare?: boolean;
};

export function MarketingDirectorPanel({
  vehicles,
  initialStockId,
  packs,
  onPackReady,
  onPackPublished,
  autoPrepare = false,
}: MarketingDirectorPanelProps) {
  const [stockId, setStockId] = useState(initialStockId ?? vehicles[0]?.stockId ?? "");
  const [busy, setBusy] = useState(false);
  const [activePack, setActivePack] = useState<MarketingContentPack | null>(packs[0] ?? null);
  const [activeChannel, setActiveChannel] = useState<MarketingChannel>("facebook_page");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [msgOk, setMsgOk] = useState(true);

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.stockId === stockId) ?? null,
    [vehicles, stockId],
  );

  const activeAsset: MarketingAsset | null = useMemo(() => {
    if (!activePack) return null;
    return activePack.assets.find((a) => a.channel === activeChannel) ?? activePack.assets[0] ?? null;
  }, [activePack, activeChannel]);

  async function flashCopy(key: string, text: string) {
    const ok = await copyText(text);
    if (ok) {
      setCopiedId(key);
      window.setTimeout(() => setCopiedId(null), 1500);
    }
  }

  async function preparePack(vehicle?: VehicleStock | null) {
    const v = vehicle ?? selectedVehicle;
    if (!v) {
      setMsgOk(false);
      setMsg("Choisis un véhicule en stock.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/sales/marketing/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockId: v.stockId, vehicle: v }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.pack) {
        setMsgOk(false);
        setMsg(payload?.errors?.join("; ") ?? "Préparation pack marketing échouée.");
        return;
      }
      const pack = payload.pack as MarketingContentPack;
      setActivePack(pack);
      setActiveChannel("facebook_page");
      setStockId(v.stockId);
      onPackReady(pack);
      setMsgOk(true);
      setMsg(`Pack prêt — ${pack.vehicleLabel} · angle : ${pack.angle}`);
      window.requestAnimationFrame(() => {
        document.getElementById("sales-marketing-director")?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      });
    } catch (err) {
      setMsgOk(false);
      setMsg(err instanceof Error ? err.message : "Préparation pack marketing échouée.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!autoPrepare || !initialStockId) return;
    const v = vehicles.find((x) => x.stockId === initialStockId);
    if (v) void preparePack(v);
    // Mount-only auto prepare when opened from inventory / publish queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot
  }, []);

  async function markPublished() {
    if (!activePack) return;
    setBusy(true);
    try {
      const res = await fetch("/api/sales/marketing/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark_published_manual",
          packId: activePack.packId,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.pack) {
        setMsgOk(false);
        setMsg(payload?.error ?? "Marquage publié échoué.");
        return;
      }
      const pack = payload.pack as MarketingContentPack;
      setActivePack(pack);
      onPackPublished(pack);
      setMsgOk(true);
      setMsg("Contenus marqués publiés — capture chaque prospect dans la file du matin.");
    } catch (err) {
      setMsgOk(false);
      setMsg(err instanceof Error ? err.message : "Marquage publié échoué.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="sales-marketing-director"
      className="rounded-2xl border border-rose-500/25 bg-gradient-to-b from-rose-500/[0.08] via-black/25 to-black/45 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-5"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-300">
            <Megaphone className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-white sm:text-xl">
              Directeur Marketing
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-neutral-400 sm:text-sm">
              Studio contenu vente : posts Facebook, pubs Meta, Reels et YouTube Shorts — scripts +
              plans de tournage prêts à filmer au téléphone pour générer plus de prospects.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={stockId}
            onChange={(e) => setStockId(e.target.value)}
            className="min-h-11 min-w-[14rem] rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-sm text-white outline-none focus:ring-2 focus:ring-rose-500/40"
          >
            {vehicles.length === 0 ? <option value="">— Sync inventaire —</option> : null}
            {vehicles.map((v) => (
              <option key={v.stockId} value={v.stockId}>
                {v.stockId} — {v.year} {v.make} {v.model}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !selectedVehicle}
            onClick={() => void preparePack()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 text-sm font-bold text-white hover:bg-rose-400 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Générer pack 5 canaux
          </button>
        </div>
      </div>

      {activePack ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[12rem_1fr]">
          <div className="flex flex-row gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
            {activePack.assets.map((asset) => {
              const meta = CHANNEL_META[asset.channel];
              const selected = activeAsset?.channel === asset.channel;
              return (
                <button
                  key={asset.channel}
                  type="button"
                  onClick={() => setActiveChannel(asset.channel)}
                  className={`inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border px-3 text-[11px] font-bold transition ${
                    selected ? meta.tone : "border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-600"
                  }`}
                >
                  {meta.short}
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-black/30 p-4">
            <div className="flex flex-wrap items-center gap-2">
              {activeAsset?.channel === "youtube_short" ? (
                <Youtube className="h-4 w-4 text-rose-300" />
              ) : activeAsset?.channel === "instagram_reel" ? (
                <Clapperboard className="h-4 w-4 text-fuchsia-300" />
              ) : (
                <Megaphone className="h-4 w-4 text-rose-300" />
              )}
              <p className="text-sm font-bold text-white">{activeAsset?.label}</p>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-300">
                {activePack.status}
              </span>
            </div>
            <p className="mt-2 text-xs text-rose-200/90">
              <span className="font-semibold">Angle :</span> {activePack.angle}
            </p>
            <p className="mt-1 text-[11px] text-neutral-500">{activePack.publishWindowHint}</p>

            {activeAsset ? (
              <>
                <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-neutral-500">
                  Hook
                </p>
                <p className="mt-1 text-sm font-semibold text-white">{activeAsset.hook}</p>
                <pre className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/[0.06] bg-neutral-950/70 p-3 font-sans text-xs leading-5 text-neutral-300">
                  {activeAsset.body}
                </pre>
                <p className="mt-2 text-xs text-amber-200">
                  <span className="font-semibold">CTA :</span> {activeAsset.cta}
                </p>
                {activeAsset.hashtags.length > 0 ? (
                  <p className="mt-2 text-[11px] text-neutral-500">{activeAsset.hashtags.join(" ")}</p>
                ) : null}
                {activeAsset.shotList?.length ? (
                  <div className="mt-3 rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/[0.05] p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-fuchsia-200">
                      Plan de tournage (~{activeAsset.durationHintSec ?? "?"}s)
                    </p>
                    <ul className="mt-2 space-y-1 text-[11px] leading-5 text-neutral-300">
                      {activeAsset.shotList.map((s) => (
                        <li key={s}>• {s}</li>
                      ))}
                    </ul>
                    {activeAsset.voiceoverScript ? (
                      <p className="mt-2 text-[11px] leading-5 text-neutral-400">
                        <span className="font-semibold text-neutral-300">Voix off :</span>{" "}
                        {activeAsset.voiceoverScript}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void flashCopy(
                        `asset-${activeAsset.channel}`,
                        formatMarketingAssetClipboard(activeAsset),
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-rose-500/40"
                  >
                    <ClipboardCopy className="h-3.5 w-3.5" />
                    {copiedId === `asset-${activeAsset.channel}` ? "Copié" : "Copier ce canal"}
                  </button>
                  <button
                    type="button"
                    disabled={busy || activePack.status === "published_manual"}
                    onClick={() => void markPublished()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-neutral-950 hover:bg-emerald-400 disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {activePack.status === "published_manual"
                      ? "Pack déjà publié"
                      : "Marquer pack publié"}
                  </button>
                </div>
              </>
            ) : null}

            <p className="mt-3 text-[11px] leading-5 text-neutral-500">
              {activePack.leadCapturePrompt}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-neutral-500">
          Sélectionne un véhicule et génère un pack 5 canaux pour démarrer le Directeur Marketing.
        </p>
      )}

      {msg ? (
        <p className={`mt-3 text-xs ${msgOk ? "text-emerald-300" : "text-rose-300"}`}>{msg}</p>
      ) : null}
    </section>
  );
}
