"use client";

// Sales Growth panels — Agent Publication + Directeur Marketing.

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  Loader2,
  Megaphone,
  Rocket,
  Sparkles,
  Target,
  Video,
} from "lucide-react";
import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import type { PublishingBundle } from "@/features/sales/publishing-bundle";
import type { LeadProspectPlaybook } from "@/features/sales/lead-prospect-playbook";

type MarketingBundle = {
  facebookPost: { body: string; hashtags: string[]; bestPostTimeFr: string; ctaFr: string };
  reelScript: { hookFr: string; beatsFr: string[]; ctaFr: string; onScreenTextFr: string[] };
  youtubeShortScript: { hookFr: string; ctaFr: string };
  metaAd: { headlineFr: string; primaryTextFr: string; descriptionFr: string; audienceHintFr: string; budgetHintFr: string };
};

export type SalesGrowthPanelsProps = {
  vehicles: VehicleStock[];
  initialPlaybook?: LeadProspectPlaybook;
  initialBundles?: PublishingBundle[];
  onSelectStock?: (stockId: string) => void;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function SalesGrowthPanels({
  vehicles,
  initialPlaybook,
  initialBundles = [],
  onSelectStock,
}: SalesGrowthPanelsProps) {
  const [, startTransition] = useTransition();
  const [playbook, setPlaybook] = useState<LeadProspectPlaybook | null>(initialPlaybook ?? null);
  const [bundles, setBundles] = useState<PublishingBundle[]>(initialBundles);
  const [activeBundle, setActiveBundle] = useState<PublishingBundle | null>(initialBundles[0] ?? null);
  const [marketing, setMarketing] = useState<MarketingBundle | null>(null);
  const [marketingTitle, setMarketingTitle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [msgOk, setMsgOk] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function refreshBundles() {
    try {
      const res = await fetch("/api/sales/publishing/bundle");
      const data = await res.json();
      if (Array.isArray(data.bundles)) {
        setBundles(data.bundles as PublishingBundle[]);
      }
    } catch {
      /* ignore */
    }
  }

  async function refreshPlaybook() {
    try {
      const res = await fetch("/api/sales/marketing/content");
      const data = await res.json();
      if (data.playbook) setPlaybook(data.playbook as LeadProspectPlaybook);
    } catch {
      /* ignore */
    }
  }

  async function flashCopy(key: string, text: string) {
    const ok = await copyText(text);
    if (ok) {
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1500);
    }
  }

  async function createBundle(stockId: string) {
    const vehicle = vehicles.find((v) => v.stockId === stockId);
    setBusy(`bundle-${stockId}`);
    setMsg("");
    try {
      const res = await fetch("/api/sales/publishing/bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockId, vehicle }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsgOk(false);
        setMsg(data.errors?.join("; ") ?? "Création bundle échouée.");
        return;
      }
      const bundle = data.bundle as PublishingBundle;
      setActiveBundle(bundle);
      setMsgOk(true);
      setMsg(`Bundle créé — score ${bundle.priorityScore}/100`);
      onSelectStock?.(stockId);
      startTransition(() => {
        void refreshBundles();
        void refreshPlaybook();
      });
    } catch (err) {
      setMsgOk(false);
      setMsg(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  async function approveBundle(bundleId: string) {
    setBusy(`approve-${bundleId}`);
    try {
      const res = await fetch("/api/sales/publishing/bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", bundleId }),
      });
      const data = await res.json();
      if (res.ok) {
        setActiveBundle(data.bundle as PublishingBundle);
        if (data.clipboard) await flashCopy("approved", data.clipboard as string);
        setMsgOk(true);
        setMsg("Bundle approuvé — contenu copié. Ouvre Marketplace et publie.");
        startTransition(() => void refreshBundles());
      }
    } finally {
      setBusy(null);
    }
  }

  async function markPublished(bundleId: string) {
    setBusy(`pub-${bundleId}`);
    try {
      const res = await fetch("/api/sales/publishing/bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_published", bundleId }),
      });
      if (res.ok) {
        setMsgOk(true);
        setMsg("Marqué publié — capture chaque message comme lead.");
        startTransition(() => {
          void refreshBundles();
          void refreshPlaybook();
        });
      }
    } finally {
      setBusy(null);
    }
  }

  async function loadMarketing(stockId: string) {
    const vehicle = vehicles.find((v) => v.stockId === stockId);
    setBusy(`mkt-${stockId}`);
    try {
      const res = await fetch("/api/sales/marketing/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockId, vehicle }),
      });
      const data = await res.json();
      if (res.ok) {
        setMarketing(data.marketing as MarketingBundle);
        setMarketingTitle(data.vehicleTitle as string);
        onSelectStock?.(stockId);
        document.getElementById("sales-marketing-director")?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {playbook ? (
        <section className="rounded-2xl border border-rose-500/25 bg-gradient-to-b from-rose-500/[0.08] via-black/25 to-black/45 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-300">
              <Target className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-extrabold tracking-tight text-white sm:text-xl">
                Playbook prospects — plus de leads
              </h2>
              <p className="mt-1 text-xs leading-5 text-neutral-400 sm:text-sm">{playbook.frenchSummary}</p>
              <ul className="mt-3 space-y-1.5 text-xs leading-5 text-neutral-300">
                {playbook.dailyActionsFr.map((a) => (
                  <li key={a}>• {a}</li>
                ))}
              </ul>
              {playbook.leadGapNotesFr.length > 0 ? (
                <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                  {playbook.leadGapNotesFr.map((n) => (
                    <p key={n}>⚠️ {n}</p>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {playbook.topVehicles.length > 0 ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {playbook.topVehicles.slice(0, 6).map((rec) => (
                <div
                  key={rec.stockId}
                  className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-bold text-white">{rec.vehicleTitle}</p>
                    <span className="shrink-0 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-200">
                      {rec.priorityScore}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-neutral-500">{rec.reasonFr}</p>
                  <p className="mt-1 text-[10px] text-emerald-400/90">{rec.estimatedLeadImpactFr}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={busy === `bundle-${rec.stockId}`}
                      onClick={() => void createBundle(rec.stockId)}
                      className="inline-flex items-center gap-1 rounded-lg bg-rose-500 px-2 py-1 text-[10px] font-bold text-white hover:bg-rose-400 disabled:opacity-40"
                    >
                      {busy === `bundle-${rec.stockId}` ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Rocket className="h-3 w-3" />
                      )}
                      Publier
                    </button>
                    <button
                      type="button"
                      disabled={busy === `mkt-${rec.stockId}`}
                      onClick={() => void loadMarketing(rec.stockId)}
                      className="inline-flex items-center gap-1 rounded-lg border border-violet-500/40 bg-violet-500/10 px-2 py-1 text-[10px] font-bold text-violet-200 hover:bg-violet-500/20 disabled:opacity-40"
                    >
                      <Megaphone className="h-3 w-3" />
                      Contenu
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-orange-500/25 bg-gradient-to-b from-orange-500/[0.07] via-black/25 to-black/45 p-4">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-orange-300" />
            <div>
              <h2 className="text-sm font-bold text-white">Agent Publication</h2>
              <p className="text-[11px] text-neutral-500">
                Marketplace + FB — tu approuves, tu publies (pas d&apos;auto-bot)
              </p>
            </div>
          </div>

          {msg ? (
            <p className={`mt-2 text-xs ${msgOk ? "text-emerald-300" : "text-rose-300"}`}>{msg}</p>
          ) : null}

          {activeBundle ? (
            <div className="mt-3 rounded-xl border border-orange-500/30 bg-black/30 p-3">
              <p className="text-sm font-bold text-orange-100">{activeBundle.vehicleTitle}</p>
              <p className="text-[11px] text-neutral-400">
                Priorité {activeBundle.priorityScore}/100 — {activeBundle.priorityReasonFr}
              </p>
              <p className="mt-2 text-xs text-neutral-300">{activeBundle.leadHookFr}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {activeBundle.status === "draft" ? (
                  <button
                    type="button"
                    disabled={busy === `approve-${activeBundle.bundleId}`}
                    onClick={() => void approveBundle(activeBundle.bundleId)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-bold text-neutral-950 hover:bg-orange-400 disabled:opacity-40"
                  >
                    {busy === `approve-${activeBundle.bundleId}` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    Approuver & copier
                  </button>
                ) : null}
                <a
                  href="https://www.facebook.com/marketplace/create/vehicle"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-orange-500/40"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ouvrir Marketplace
                </a>
                {activeBundle.status !== "published_manual" ? (
                  <button
                    type="button"
                    disabled={busy === `pub-${activeBundle.bundleId}`}
                    onClick={() => void markPublished(activeBundle.bundleId)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40"
                  >
                    Marquer publié
                  </button>
                ) : (
                  <span className="text-xs text-emerald-400">✓ Publié</span>
                )}
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-[11px] font-semibold text-neutral-400">
                  Checklist publication ({activeBundle.publishChecklistFr.length} étapes)
                </summary>
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px] leading-5 text-neutral-400">
                  {activeBundle.publishChecklistFr.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </details>
            </div>
          ) : bundles.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {bundles.slice(0, 4).map((b) => (
                <button
                  key={b.bundleId}
                  type="button"
                  onClick={() => setActiveBundle(b)}
                  className="rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-[11px] text-neutral-300 hover:border-orange-500/40"
                >
                  {b.vehicleTitle} · {b.status}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs text-neutral-500">
              Choisis un véhicule dans le playbook ou la grille → « Publier » pour générer le bundle complet.
            </p>
          )}
        </section>

        <section
          id="sales-marketing-director"
          className="rounded-2xl border border-violet-500/25 bg-gradient-to-b from-violet-500/[0.07] via-black/25 to-black/45 p-4"
        >
          <div className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-violet-300" />
            <div>
              <h2 className="text-sm font-bold text-white">Directeur Marketing</h2>
              <p className="text-[11px] text-neutral-500">
                Posts FB · Reels · YouTube Shorts · pubs Meta
              </p>
            </div>
          </div>

          {marketing ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm font-semibold text-violet-100">{marketingTitle}</p>

              <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">Post Facebook</p>
                <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-5 text-neutral-200">
                  {marketing.facebookPost.body}
                </pre>
                <p className="mt-1 text-[10px] text-violet-300">
                  {marketing.facebookPost.hashtags.join(" ")}
                </p>
                <p className="mt-1 text-[10px] text-neutral-500">
                  Meilleur moment : {marketing.facebookPost.bestPostTimeFr}
                </p>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
                <div className="flex items-center gap-1.5">
                  <Video className="h-3.5 w-3.5 text-violet-300" />
                  <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">Script Reel</p>
                </div>
                <p className="mt-2 text-xs font-semibold text-white">{marketing.reelScript.hookFr}</p>
                <ul className="mt-2 space-y-1 text-[11px] leading-5 text-neutral-300">
                  {marketing.reelScript.beatsFr.map((b) => (
                    <li key={b}>• {b}</li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-amber-300">CTA : {marketing.reelScript.ctaFr}</p>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">Pub Meta (brouillon)</p>
                <p className="mt-1 text-xs font-semibold text-white">{marketing.metaAd.headlineFr}</p>
                <p className="mt-1 text-[11px] leading-5 text-neutral-300">{marketing.metaAd.primaryTextFr}</p>
                <p className="mt-1 text-[10px] text-neutral-500">{marketing.metaAd.audienceHintFr}</p>
              </div>

              <button
                type="button"
                onClick={() =>
                  void flashCopy(
                    "marketing",
                    [
                      marketing.facebookPost.body,
                      marketing.facebookPost.hashtags.join(" "),
                      "",
                      "REEL:",
                      marketing.reelScript.hookFr,
                      ...marketing.reelScript.beatsFr,
                      marketing.reelScript.ctaFr,
                    ].join("\n"),
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-violet-500/40"
              >
                <ClipboardCopy className="h-3.5 w-3.5" />
                {copiedKey === "marketing" ? "Copié" : "Copier tout le contenu"}
              </button>
            </div>
          ) : (
            <div className="mt-4 flex flex-col items-center gap-2 py-6 text-center">
              <Sparkles className="h-8 w-8 text-violet-500/50" />
              <p className="text-xs text-neutral-500">
                Clique « Contenu » sur un véhicule du playbook pour générer posts, Reels et pubs.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
