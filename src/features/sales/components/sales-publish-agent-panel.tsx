"use client";

// Publish Agent panel — queue, batch prepare, fastest manual Marketplace workflow.

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  Loader2,
  Megaphone,
  Rocket,
  UserPlus,
} from "lucide-react";
import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import type { InventoryDebrief } from "@/features/inventory/inventory-debrief";
import type { MarketplaceListingPacket } from "@/features/marketplace-listings/listing-packet";
import {
  buildPublishCandidates,
  FACEBOOK_MARKETPLACE_CREATE_URL,
  formatPublishBundle,
} from "@/features/sales/publish-agent";
import { prepareMarketplaceInboundDraft } from "@/features/sales/marketplace-inbound-draft";

type Props = {
  vehicles: VehicleStock[];
  listings: MarketplaceListingPacket[];
  debrief: InventoryDebrief | null;
  onListingPrepared: (packet: MarketplaceListingPacket) => void;
  onRefresh: () => void;
};

function formatPrice(priceCad: number | undefined): string {
  if (priceCad === undefined) return "—";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(priceCad);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function SalesPublishAgentPanel({
  vehicles,
  listings,
  debrief,
  onListingPrepared,
  onRefresh,
}: Props) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [busyStock, setBusyStock] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [captureForm, setCaptureForm] = useState({ packetId: "", fullName: "", phone: "" });
  const [captureMsg, setCaptureMsg] = useState("");
  const [captureOk, setCaptureOk] = useState(true);
  const [captureBusy, setCaptureBusy] = useState(false);

  const candidates = useMemo(
    () =>
      buildPublishCandidates({
        vehicles,
        highlights: debrief?.highlights,
        listings,
        limit: 6,
      }),
    [vehicles, debrief, listings],
  );

  const preparedQueue = useMemo(
    () =>
      listings.filter(
        (l) => l.status === "ready_for_manual_publish" || l.status === "prepared",
      ),
    [listings],
  );

  const publishedCount = useMemo(
    () => listings.filter((l) => l.status === "published_manual").length,
    [listings],
  );

  async function flashCopy(key: string, text: string) {
    const ok = await copyText(text);
    if (ok) {
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1500);
    }
  }

  async function prepareOne(stockId: string) {
    const vehicle = vehicles.find((v) => v.stockId === stockId);
    if (!vehicle) return;
    setBusyStock(stockId);
    try {
      const res = await fetch("/api/marketplace/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockId, vehicle }),
      });
      const payload = await res.json().catch(() => null);
      if (res.ok && payload?.packet) {
        onListingPrepared(payload.packet as MarketplaceListingPacket);
      }
    } finally {
      setBusyStock(null);
    }
  }

  async function batchPrepareTop() {
    setBatchBusy(true);
    try {
      const top = candidates.filter((c) => !c.alreadyPrepared).slice(0, 3);
      for (const c of top) {
        await prepareOne(c.stockId);
      }
    } finally {
      setBatchBusy(false);
    }
  }

  async function markPublished(packetId: string) {
    setBusyStock(packetId);
    try {
      const res = await fetch("/api/marketplace/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_published_manual", packetId }),
      });
      if (res.ok) onRefresh();
    } finally {
      setBusyStock(null);
    }
  }

  async function captureInbound(e: React.FormEvent) {
    e.preventDefault();
    setCaptureBusy(true);
    setCaptureMsg("");
    try {
      const res = await fetch("/api/marketplace/leads/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packetId: captureForm.packetId,
          fullName: captureForm.fullName,
          phone: captureForm.phone,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setCaptureOk(false);
        setCaptureMsg(payload?.errors?.join("; ") ?? "Capture échouée.");
        return;
      }
      setCaptureOk(true);
      setCaptureMsg(`Lead capturé : ${payload.lead?.fullName ?? captureForm.fullName}`);
      setCaptureForm({ packetId: "", fullName: "", phone: "" });
      onRefresh();
    } catch (err) {
      setCaptureOk(false);
      setCaptureMsg(err instanceof Error ? err.message : "Capture échouée.");
    } finally {
      setCaptureBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-rose-500/25 bg-gradient-to-b from-rose-500/[0.07] via-black/25 to-black/45 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-300">
            <Rocket className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-white">Agent Publication</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-neutral-400 sm:text-sm">
              Prépare en lot, copie le bundle, publie sur Marketplace en 2 min, capture chaque
              prospect. Pas d&apos;auto-post (conformité Meta) — workflow le plus rapide possible.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={FACEBOOK_MARKETPLACE_CREATE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 text-xs font-bold text-rose-100 hover:bg-rose-500/25"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ouvrir Marketplace
          </a>
          <button
            type="button"
            disabled={batchBusy || candidates.every((c) => c.alreadyPrepared)}
            onClick={() => void batchPrepareTop()}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-rose-500 px-3 text-xs font-bold text-white hover:bg-rose-400 disabled:opacity-40"
          >
            {batchBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Megaphone className="h-3.5 w-3.5" />}
            Préparer top 3
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-rose-300/80">À publier</p>
          <p className="mt-1 text-2xl font-extrabold text-white">{preparedQueue.length}</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-300/80">Publiées</p>
          <p className="mt-1 text-2xl font-extrabold text-white">{publishedCount}</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-sky-300/80">Priorités lot</p>
          <p className="mt-1 text-2xl font-extrabold text-white">{candidates.length}</p>
        </div>
      </div>

      {candidates.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-bold text-rose-100">Priorités publication aujourd&apos;hui</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {candidates.map((c) => (
              <div
                key={c.stockId}
                className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-3"
              >
                <p className="truncate text-sm font-semibold text-white">{c.title}</p>
                <p className="text-xs text-amber-300">{formatPrice(c.priceCad)} · score {c.priorityScore}</p>
                <ul className="mt-1 space-y-0.5 text-[10px] text-neutral-500">
                  {c.reasons.slice(0, 2).map((r) => (
                    <li key={r}>• {r}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={busyStock === c.stockId || c.alreadyPrepared}
                  onClick={() => void prepareOne(c.stockId)}
                  className="mt-2 inline-flex min-h-8 items-center rounded-lg bg-rose-500/90 px-2.5 text-[11px] font-bold text-white hover:bg-rose-400 disabled:opacity-40"
                >
                  {busyStock === c.stockId ? "…" : c.alreadyPrepared ? "Préparé" : "Préparer fiche"}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {preparedQueue.length > 0 ? (
        <div className="mt-4 space-y-3">
          <p className="text-xs font-bold text-rose-100">File de publication</p>
          {preparedQueue.map((packet) => {
            const inbound = prepareMarketplaceInboundDraft({
              packet,
              nowIso: new Date().toISOString(),
            });
            return (
              <article
                key={packet.packetId}
                className="rounded-xl border border-rose-500/20 bg-black/35 p-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{packet.title}</p>
                    <p className="text-[11px] text-neutral-500">
                      {packet.packetId} · {formatPrice(packet.priceCad)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => void flashCopy(`bundle-${packet.packetId}`, formatPublishBundle(packet))}
                      className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 text-[11px] font-semibold text-neutral-200"
                    >
                      <ClipboardCopy className="h-3 w-3" />
                      {copiedKey === `bundle-${packet.packetId}` ? "Copié" : "Bundle complet"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void flashCopy(`inbound-${packet.packetId}`, inbound.body)}
                      className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 text-[11px] font-semibold text-sky-200"
                    >
                      Réponse prospect
                    </button>
                    <button
                      type="button"
                      disabled={busyStock === packet.packetId}
                      onClick={() => void markPublished(packet.packetId)}
                      className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 text-[11px] font-semibold text-emerald-200"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Marquer publié
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      <form onSubmit={(e) => void captureInbound(e)} className="mt-4 rounded-xl border border-sky-500/20 bg-sky-500/[0.05] p-3">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-sky-300" />
          <p className="text-xs font-bold text-sky-100">Capture prospect Marketplace</p>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <select
            required
            value={captureForm.packetId}
            onChange={(e) => setCaptureForm((f) => ({ ...f, packetId: e.target.value }))}
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-2 text-xs text-white"
          >
            <option value="">Annonce publiée…</option>
            {listings.map((l) => (
              <option key={l.packetId} value={l.packetId}>
                {l.title}
              </option>
            ))}
          </select>
          <input
            required
            value={captureForm.fullName}
            onChange={(e) => setCaptureForm((f) => ({ ...f, fullName: e.target.value }))}
            placeholder="Nom prospect"
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-2 text-xs text-white"
          />
          <input
            required
            value={captureForm.phone}
            onChange={(e) => setCaptureForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="Téléphone"
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-2 text-xs text-white"
          />
        </div>
        <button
          type="submit"
          disabled={captureBusy}
          className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-sky-500 px-3 text-xs font-bold text-white disabled:opacity-40"
        >
          {captureBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
          Ajouter à la banque leads
        </button>
        {captureMsg ? (
          <p className={`mt-2 text-xs ${captureOk ? "text-emerald-300" : "text-rose-300"}`}>{captureMsg}</p>
        ) : null}
      </form>
    </section>
  );
}
