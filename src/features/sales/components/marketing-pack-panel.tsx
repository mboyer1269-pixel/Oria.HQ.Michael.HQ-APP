"use client";

// Marketing + prospecting pack panel — prepare-only copy surfaces.

import { useState } from "react";
import { ClipboardCopy, Loader2, Megaphone } from "lucide-react";
import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import type { SalesMarketingPack } from "@/features/sales/marketing-content-pack";

type Props = {
  vehicles: VehicleStock[];
  selectedStockId: string | null;
  onSelectStock: (stockId: string) => void;
  onFlashCopy: (key: string, text: string) => Promise<void>;
  copiedId: string | null;
};

export function MarketingPackPanel({
  vehicles,
  selectedStockId,
  onSelectStock,
  onFlashCopy,
  copiedId,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [pack, setPack] = useState<SalesMarketingPack | null>(null);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(true);

  async function preparePack(stockId: string) {
    setBusy(true);
    setMsg("");
    onSelectStock(stockId);
    try {
      const res = await fetch("/api/sales/marketing/content-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockId }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.pack) {
        setOk(false);
        setMsg(payload?.error ?? payload?.hint ?? "Pack marketing échoué.");
        setPack(null);
        return;
      }
      setPack(payload.pack as SalesMarketingPack);
      setOk(true);
      setMsg("Pack prêt — copie posts / SMS. Pas d'auto-publish.");
    } catch (err) {
      setOk(false);
      setMsg(err instanceof Error ? err.message : "Pack échoué.");
    } finally {
      setBusy(false);
    }
  }

  const stockId = selectedStockId ?? vehicles[0]?.stockId ?? "";

  return (
    <section className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/[0.05] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300">
            <Megaphone className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-white">
              Marketing & prospection
            </h2>
            <p className="mt-1 max-w-xl text-xs leading-5 text-neutral-400">
              Pack adjoint : post FB, hook Marketplace, SMS pour remplir le livre, pub + script Reel.
              Prepare-only.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={stockId}
            onChange={(e) => onSelectStock(e.target.value)}
            className="min-w-[12rem] rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-2 text-sm text-white"
          >
            {vehicles.length === 0 ? (
              <option value="">Sync inventaire d&apos;abord</option>
            ) : (
              vehicles.map((v) => (
                <option key={v.stockId} value={v.stockId}>
                  {v.year} {v.make} {v.model}
                  {v.trim ? ` ${v.trim}` : ""} · {v.stockNumber ?? v.stockId}
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            disabled={busy || !stockId}
            onClick={() => void preparePack(stockId)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-fuchsia-500 px-4 text-sm font-bold text-white hover:bg-fuchsia-400 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
            Préparer le pack
          </button>
        </div>
      </div>

      {pack ? (
        <>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {(
              [
                ["Hook Marketplace", pack.marketplaceHookFr, "mkt-hook"],
                ["Post Facebook", pack.facebookPostFr, "mkt-fb"],
                ["SMS prospection (livre)", pack.prospectingSmsFr, "mkt-sms"],
                ["Pub — texte", pack.adCopy.primaryTextFr, "mkt-ad"],
                ["Reel — hook + CTA", `${pack.videoScript.hookFr}\n\n${pack.videoScript.ctaFr}`, "mkt-reel"],
                ["Description Marketplace", pack.marketplaceDescriptionFr, "mkt-mp"],
              ] as const
            ).map(([title, body, key]) => (
              <div key={key} className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-fuchsia-300/80">
                    {title}
                  </p>
                  <button
                    type="button"
                    onClick={() => void onFlashCopy(key, body)}
                    className="inline-flex items-center gap-1 rounded-md border border-neutral-700 px-2 py-1 text-[10px] font-semibold text-neutral-300 hover:border-fuchsia-500/40 hover:text-fuchsia-200"
                  >
                    <ClipboardCopy className="h-3 w-3" />
                    {copiedId === key ? "Copié" : "Copier"}
                  </button>
                </div>
                <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-5 text-neutral-200">
                  {body}
                </pre>
              </div>
            ))}
          </div>

          {pack.quickRepliesFr?.length ? (
            <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-300/80">
                Réponses rapides inbound (&lt; 5 min = RDV)
              </p>
              <div className="mt-2 grid gap-2 lg:grid-cols-2">
                {pack.quickRepliesFr.map((qr, i) => (
                  <div key={qr.triggerFr} className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold text-emerald-200">« {qr.triggerFr} »</p>
                      <button
                        type="button"
                        onClick={() => void onFlashCopy(`qr-${i}`, qr.replyFr)}
                        className="shrink-0 rounded-md border border-neutral-700 px-2 py-0.5 text-[10px] font-semibold text-neutral-300 hover:border-emerald-500/40"
                      >
                        {copiedId === `qr-${i}` ? "Copié" : "Copier"}
                      </button>
                    </div>
                    <p className="mt-1 text-[11px] leading-5 text-neutral-300">{qr.replyFr}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {pack.followUpSequenceFr?.length ? (
            <div className="mt-3 rounded-xl border border-sky-500/20 bg-sky-500/[0.05] p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-sky-300/80">
                Séquence de relance (J0 → J5) — toi tu envoies
              </p>
              <ol className="mt-2 space-y-2">
                {pack.followUpSequenceFr.map((step, i) => (
                  <li key={step.whenFr} className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold text-sky-200">
                        {step.whenFr} · {step.channel.toUpperCase()}
                      </p>
                      <button
                        type="button"
                        onClick={() => void onFlashCopy(`fu-${i}`, step.messageFr)}
                        className="shrink-0 rounded-md border border-neutral-700 px-2 py-0.5 text-[10px] font-semibold text-neutral-300 hover:border-sky-500/40"
                      >
                        {copiedId === `fu-${i}` ? "Copié" : "Copier"}
                      </button>
                    </div>
                    <p className="mt-1 text-[11px] leading-5 text-neutral-300">{step.messageFr}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-neutral-600">
                      But : {step.goalFr}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {pack.objectionRepliesFr?.length ? (
            <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-300/80">
                Objections fréquentes — réponses courtes
              </p>
              <ul className="mt-2 grid gap-2 lg:grid-cols-2">
                {pack.objectionRepliesFr.map((o) => (
                  <li key={o.objection} className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-2.5">
                    <p className="text-[11px] font-semibold text-amber-200">« {o.objection} »</p>
                    <p className="mt-1 text-[11px] leading-5 text-neutral-300">{o.reply}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}

      {msg ? (
        <p className={`mt-3 text-xs ${ok ? "text-emerald-300" : "text-rose-300"}`}>{msg}</p>
      ) : null}
    </section>
  );
}
