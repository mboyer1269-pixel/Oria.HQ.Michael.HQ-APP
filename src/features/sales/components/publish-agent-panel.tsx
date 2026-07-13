"use client";

// Agent Publication — file du jour + fiche Marketplace + marquage publié + capture lead.
// Prepare-only: copy → human publishes on Meta. No Facebook bot.

import { useState, type FormEvent } from "react";
import {
  CheckCircle2,
  ClipboardCopy,
  Loader2,
  Megaphone,
  Rocket,
  UserPlus,
} from "lucide-react";
import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import type { MarketplaceListingPacket } from "@/features/marketplace-listings/listing-packet";
import { formatMarketplaceUploadChecklist } from "@/features/marketplace-listings/listing-packet";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function formatPrice(priceCad: number | undefined): string {
  if (priceCad === undefined) return "Prix —";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(priceCad);
}

function VehicleThumb({ src, alt }: { src?: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return <div className="h-full w-full bg-neutral-900" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- CDN allowlisted; avoid next/image churn
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="h-full w-full object-cover"
    />
  );
}

export type PublishAgentPanelProps = {
  vehicles: VehicleStock[];
  queueVehicles: VehicleStock[];
  listingPacket: MarketplaceListingPacket | null;
  listingBusy: string | null;
  onPrepareListing: (vehicle: VehicleStock) => void;
  onListingUpdated: (packet: MarketplaceListingPacket) => void;
  onLeadCaptured: () => void;
  onOpenMarketing: (vehicle: VehicleStock) => void;
};

export function PublishAgentPanel({
  vehicles,
  queueVehicles,
  listingPacket,
  listingBusy,
  onPrepareListing,
  onListingUpdated,
  onLeadCaptured,
  onOpenMarketing,
}: PublishAgentPanelProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgOk, setMsgOk] = useState(true);
  const [leadForm, setLeadForm] = useState({ fullName: "", phone: "", notes: "" });

  async function flashCopy(key: string, text: string) {
    const ok = await copyText(text);
    if (ok) {
      setCopiedId(key);
      window.setTimeout(() => setCopiedId(null), 1500);
    }
  }

  async function markPublished() {
    if (!listingPacket) return;
    setPublishBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/marketplace/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark_published_manual",
          packetId: listingPacket.packetId,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.packet) {
        setMsgOk(false);
        setMsg(payload?.error ?? "Marquage publié échoué.");
        return;
      }
      onListingUpdated(payload.packet as MarketplaceListingPacket);
      setMsgOk(true);
      setMsg("Annonce marquée publiée. Capture chaque inbound ci-dessous → plus de leads.");
    } catch (err) {
      setMsgOk(false);
      setMsg(err instanceof Error ? err.message : "Marquage publié échoué.");
    } finally {
      setPublishBusy(false);
    }
  }

  async function captureLead(e: FormEvent) {
    e.preventDefault();
    if (!listingPacket) return;
    setCaptureBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/marketplace/leads/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packetId: listingPacket.packetId,
          fullName: leadForm.fullName,
          phone: leadForm.phone,
          messageExcerpt: leadForm.notes,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setMsgOk(false);
        setMsg(payload?.errors?.join("; ") ?? payload?.error ?? "Capture lead échouée.");
        return;
      }
      setMsgOk(true);
      setMsg(`Lead capturé : ${payload.lead?.fullName ?? leadForm.fullName}`);
      setLeadForm({ fullName: "", phone: "", notes: "" });
      onLeadCaptured();
    } catch (err) {
      setMsgOk(false);
      setMsg(err instanceof Error ? err.message : "Capture lead échouée.");
    } finally {
      setCaptureBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-amber-500/25 bg-gradient-to-b from-amber-500/[0.08] via-black/25 to-black/45 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-300">
            <Rocket className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-white sm:text-xl">
              Agent Publication
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-neutral-400 sm:text-sm">
              File du jour → fiche Marketplace convertissante → copie 1 clic → tu publies → marque
              publié → chaque message devient un lead. (Meta API auto-post = mandat Yellow Zone.)
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-amber-200/80">
          File publication — top véhicules à pousser aujourd&apos;hui
        </p>
        {queueVehicles.length === 0 ? (
          <p className="mt-2 text-xs text-neutral-500">
            Sync l&apos;inventaire d&apos;abord — la file se remplit automatiquement.
          </p>
        ) : (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {queueVehicles.map((v) => {
              const label = `${v.year} ${v.make} ${v.model}`;
              return (
                <article
                  key={v.stockId}
                  className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/70"
                >
                  <div className="aspect-[16/10] bg-neutral-900">
                    <VehicleThumb src={v.photoUrls[0]} alt={label} />
                  </div>
                  <div className="space-y-2 p-2.5">
                    <p className="truncate text-xs font-semibold text-white">{label}</p>
                    <p className="text-[11px] text-amber-300">{formatPrice(v.priceCad)}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={listingBusy === v.stockId}
                        onClick={() => onPrepareListing(v)}
                        className="inline-flex min-h-8 flex-1 items-center justify-center rounded-lg bg-amber-500 px-2 text-[10px] font-bold text-neutral-950 hover:bg-amber-400 disabled:opacity-40"
                      >
                        {listingBusy === v.stockId ? "…" : "Fiche FB"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenMarketing(v)}
                        className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2 text-[10px] font-bold text-rose-100 hover:bg-rose-500/20"
                      >
                        <Megaphone className="h-3 w-3" />
                        Contenus
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {listingPacket ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_16rem]">
          <div className="rounded-2xl border border-amber-500/20 bg-black/30 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-amber-300" />
              <p className="text-sm font-bold text-amber-100">Fiche Marketplace prête</p>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-300">
                {listingPacket.status}
              </span>
            </div>
            <p className="mt-2 text-base font-semibold text-white">{listingPacket.title}</p>
            <p className="mt-1 text-sm text-amber-300">{formatPrice(listingPacket.priceCad)}</p>
            <pre className="mt-3 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/[0.06] bg-neutral-950/60 p-3 font-sans text-xs leading-5 text-neutral-300">
              {listingPacket.description}
            </pre>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  void flashCopy("pub-full", formatMarketplaceUploadChecklist(listingPacket))
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-amber-500/40"
              >
                <ClipboardCopy className="h-3.5 w-3.5" />
                {copiedId === "pub-full" ? "Copié" : "Copier fiche complète"}
              </button>
              <button
                type="button"
                onClick={() => void flashCopy("pub-title", listingPacket.title)}
                className="rounded-lg border border-neutral-800 px-3 py-2 text-xs text-neutral-400 hover:text-white"
              >
                Copier titre
              </button>
              <button
                type="button"
                disabled={publishBusy || listingPacket.status === "published_manual"}
                onClick={() => void markPublished()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-neutral-950 hover:bg-emerald-400 disabled:opacity-40"
              >
                {publishBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {listingPacket.status === "published_manual" ? "Déjà publié" : "Marquer publié"}
              </button>
            </div>
            <ol className="mt-3 list-decimal space-y-1 pl-4 text-[11px] leading-5 text-neutral-400">
              <li>Ouvre Facebook Marketplace → Vendre un article</li>
              <li>Colle titre + description + prix + photos (URLs du packet)</li>
              <li>Publie → clique « Marquer publié » ici</li>
              <li>Chaque message inbound → capture lead (formulaire à droite)</li>
            </ol>
          </div>

          <form
            onSubmit={(e) => void captureLead(e)}
            className="flex flex-col gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3"
          >
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-emerald-300" />
              <p className="text-xs font-bold text-emerald-100">Lead depuis cette annonce</p>
            </div>
            <input
              required
              value={leadForm.fullName}
              onChange={(e) => setLeadForm((f) => ({ ...f, fullName: e.target.value }))}
              placeholder="Nom"
              className="rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
            <input
              required
              value={leadForm.phone}
              onChange={(e) => setLeadForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="Téléphone"
              className="rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
            <textarea
              value={leadForm.notes}
              onChange={(e) => setLeadForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Message FB / intérêt…"
              className="rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
            <button
              type="submit"
              disabled={captureBusy || vehicles.length === 0}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 text-xs font-bold text-neutral-950 hover:bg-emerald-400 disabled:opacity-40"
            >
              {captureBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              Capturer lead
            </button>
          </form>
        </div>
      ) : (
        <p className="mt-4 text-xs text-neutral-500">
          Choisis un véhicule dans la file (Fiche FB) pour activer l&apos;agent de publication.
        </p>
      )}

      {msg ? (
        <p className={`mt-3 text-xs ${msgOk ? "text-emerald-300" : "text-rose-300"}`}>{msg}</p>
      ) : null}
    </section>
  );
}
