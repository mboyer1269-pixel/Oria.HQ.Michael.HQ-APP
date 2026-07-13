"use client";

// Publish Agent — 5-step wizard, batch prepare, gated lead capture.

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  ImageOff,
  Loader2,
  Megaphone,
  Rocket,
  UserPlus,
} from "lucide-react";
import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import type { InventoryDebrief } from "@/features/inventory/inventory-debrief";
import type { MarketplaceListingPacket } from "@/features/marketplace-listings/listing-packet";
import { latestListingByStock } from "@/features/sales/sales-operator-loop";
import {
  buildPublishCandidates,
  FACEBOOK_MARKETPLACE_CREATE_URL,
  formatPublishBundle,
} from "@/features/sales/publish-agent";
import { AUTO_PUBLISH_BLOCKED_REASON_FR } from "@/features/marketplace-listings/publish-policy";

type Props = {
  vehicles: VehicleStock[];
  listings: MarketplaceListingPacket[];
  debrief: InventoryDebrief | null;
  selectedStockId?: string | null;
  onListingPrepared: (packet: MarketplaceListingPacket) => void;
  onRefresh: () => void;
  onError?: (message: string) => void;
};

const WIZARD_STEPS = [
  { n: 1, label: "Préparer", detail: "Fiche titre + photos + prix" },
  { n: 2, label: "Copier bundle", detail: "Un clic — tout le contenu" },
  { n: 3, label: "Marketplace", detail: "Ouvrir FB → coller → photos" },
  { n: 4, label: "Marquer publié", detail: "Suivi dans Oria" },
  { n: 5, label: "Capturer lead", detail: "Chaque message → banque" },
] as const;

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

function VehicleThumb({ src, alt }: { src?: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-neutral-900">
        <ImageOff className="h-4 w-4 text-neutral-700" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
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

export function SalesPublishAgentPanel({
  vehicles,
  listings,
  debrief,
  selectedStockId,
  onListingPrepared,
  onRefresh,
  onError,
}: Props) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [busyStock, setBusyStock] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [activePacketId, setActivePacketId] = useState<string | null>(null);
  const [inboundBody, setInboundBody] = useState<string>("");
  const [captureForm, setCaptureForm] = useState({
    packetId: "",
    fullName: "",
    phone: "",
    messageExcerpt: "",
  });
  const [captureMsg, setCaptureMsg] = useState("");
  const [captureOk, setCaptureOk] = useState(true);
  const [captureBusy, setCaptureBusy] = useState(false);

  const latestByStock = useMemo(() => latestListingByStock(listings), [listings]);

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

  const publishedListings = useMemo(
    () => listings.filter((l) => l.status === "published_manual"),
    [listings],
  );

  const activePacket = useMemo(() => {
    if (activePacketId) {
      const picked = listings.find((l) => l.packetId === activePacketId);
      if (picked) return picked;
    }
    if (selectedStockId) {
      const fromStock = latestByStock.get(selectedStockId);
      if (fromStock) return fromStock;
    }
    return preparedQueue[0] ?? null;
  }, [activePacketId, selectedStockId, latestByStock, preparedQueue, listings]);

  const inboundPacketId = activePacket?.packetId ?? null;

  useEffect(() => {
    if (!inboundPacketId) return;
    void fetch("/api/marketplace/inbound/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packetId: inboundPacketId }),
    })
      .then((r) => r.json())
      .then((payload) => {
        if (payload?.draft?.body) setInboundBody(payload.draft.body as string);
      })
      .catch(() => undefined);
  }, [inboundPacketId]);

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
        const packet = payload.packet as MarketplaceListingPacket;
        onListingPrepared(packet);
        setActivePacketId(packet.packetId);
      } else {
        onError?.(payload?.errors?.join("; ") ?? payload?.error ?? "Préparation échouée.");
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
      if (res.ok) {
        setCaptureForm((f) => ({ ...f, packetId }));
        onRefresh();
      } else {
        const payload = await res.json().catch(() => null);
        onError?.(payload?.error ?? "Marquer publié échoué.");
      }
    } finally {
      setBusyStock(null);
    }
  }

  function openAllPhotos(packet: MarketplaceListingPacket) {
    packet.photoUrls.forEach((url) => {
      window.open(url, "_blank", "noopener,noreferrer");
    });
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
          messageExcerpt: captureForm.messageExcerpt || undefined,
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
      setCaptureForm({ packetId: "", fullName: "", phone: "", messageExcerpt: "" });
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
              Wizard 5 étapes — zéro trou dans la boucle. Auto-publish bloqué (Meta) ; toi tu publies en ~2 min.
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
            Étape 3 — Marketplace
          </a>
          <button
            type="button"
            disabled={batchBusy || candidates.every((c) => c.alreadyPrepared)}
            onClick={() => void batchPrepareTop()}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-rose-500 px-3 text-xs font-bold text-white hover:bg-rose-400 disabled:opacity-40"
          >
            {batchBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Megaphone className="h-3.5 w-3.5" />}
            Étape 1 — Top 3
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-5">
        {WIZARD_STEPS.map((step) => (
          <div
            key={step.n}
            className="rounded-xl border border-white/[0.06] bg-black/30 px-2 py-2 text-center"
            title={step.detail}
          >
            <p className="text-[10px] font-bold text-rose-300">{step.n}. {step.label}</p>
            <p className="mt-0.5 text-[9px] leading-4 text-neutral-500">{step.detail}</p>
          </div>
        ))}
      </div>

      <details className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3 text-[11px] leading-5 text-neutral-400">
        <summary className="cursor-pointer font-semibold text-amber-200">
          Pourquoi pas de publication automatique ?
        </summary>
        <pre className="mt-2 whitespace-pre-wrap font-sans text-[11px] text-neutral-400">
          {AUTO_PUBLISH_BLOCKED_REASON_FR}
        </pre>
      </details>

      {activePacket ? (
        <div className="mt-4 rounded-xl border border-rose-500/30 bg-black/35 p-4">
          <p className="text-xs font-bold text-rose-100">Fiche active — étapes 2 à 5</p>
          <p className="mt-1 text-sm font-semibold text-white">{activePacket.title}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void flashCopy(`bundle-${activePacket.packetId}`, formatPublishBundle(activePacket))}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-rose-500 px-3 text-xs font-bold text-white"
            >
              <ClipboardCopy className="h-3.5 w-3.5" />
              {copiedKey === `bundle-${activePacket.packetId}` ? "Copié" : "Étape 2 — Bundle"}
            </button>
            <button
              type="button"
              onClick={() => openAllPhotos(activePacket)}
              className="rounded-lg border border-neutral-700 px-3 text-xs text-neutral-300"
            >
              Ouvrir photos ({activePacket.photoUrls.length})
            </button>
            <button
              type="button"
              disabled={busyStock === activePacket.packetId}
              onClick={() => void markPublished(activePacket.packetId)}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 text-xs font-semibold text-emerald-200"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Étape 4 — Marquer publié
            </button>
          </div>
          {inboundBody ? (
            <div className="mt-3 rounded-lg border border-sky-500/20 bg-sky-500/5 p-2">
              <p className="text-[10px] font-bold text-sky-200">Réponse prospect (Messenger)</p>
              <pre className="mt-1 whitespace-pre-wrap text-[11px] text-neutral-300">{inboundBody}</pre>
              <button
                type="button"
                onClick={() => void flashCopy(`inbound-${activePacket.packetId}`, inboundBody)}
                className="mt-2 text-[10px] text-sky-300 underline"
              >
                Copier réponse
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {candidates.length > 0 ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {candidates.map((c) => (
            <div key={c.stockId} className="flex gap-2 rounded-xl border border-neutral-800 bg-neutral-950/70 p-2">
              <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg">
                <VehicleThumb src={c.photoUrl} alt={c.title} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white">{c.title}</p>
                <p className="text-[10px] text-amber-300">
                  {formatPrice(c.priceCad)} · {c.photoCount} photos · score {c.priorityScore}
                </p>
                <button
                  type="button"
                  disabled={busyStock === c.stockId}
                  onClick={() => void prepareOne(c.stockId)}
                  className="mt-1 rounded bg-rose-500/90 px-2 py-0.5 text-[10px] font-bold text-white disabled:opacity-40"
                >
                  {c.alreadyPrepared ? "Préparé" : "Préparer"}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <form onSubmit={(e) => void captureInbound(e)} className="mt-4 rounded-xl border border-sky-500/20 bg-sky-500/[0.05] p-3">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-sky-300" />
          <p className="text-xs font-bold text-sky-100">Étape 5 — Capture prospect (annonces publiées seulement)</p>
        </div>
        {publishedListings.length === 0 ? (
          <p className="mt-2 text-[11px] text-amber-300">
            Marque d&apos;abord une annonce publiée (étape 4) pour débloquer la capture.
          </p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select
              required
              value={captureForm.packetId}
              onChange={(e) => setCaptureForm((f) => ({ ...f, packetId: e.target.value }))}
              className="rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-2 text-xs text-white sm:col-span-2"
            >
              <option value="">Annonce publiée…</option>
              {publishedListings.map((l) => (
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
            <input
              value={captureForm.messageExcerpt}
              onChange={(e) => setCaptureForm((f) => ({ ...f, messageExcerpt: e.target.value }))}
              placeholder="Extrait message Messenger (optionnel)"
              className="rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-2 text-xs text-white sm:col-span-2"
            />
          </div>
        )}
        <button
          type="submit"
          disabled={captureBusy || publishedListings.length === 0}
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
