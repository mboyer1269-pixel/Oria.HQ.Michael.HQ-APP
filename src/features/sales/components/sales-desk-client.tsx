"use client";

// Sales Desk — visual inventory grid + morning queue + lead capture.
// Prepare-only: copy drafts / checklists; human publishes and sends.

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Car,
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  ImageOff,
  Loader2,
  MessageSquareText,
  Phone,
  RefreshCw,
  Search,
  Sunrise,
  UserPlus,
} from "lucide-react";
import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import type { LeadSource, SalesLead } from "@/features/sales/sales-lead";
import type { MarketplaceListingPacket } from "@/features/marketplace-listings/listing-packet";

export type SalesDeskQueueRow = {
  lead: SalesLead;
  score: number;
  due: boolean;
};

export type SalesDeskProps = {
  queue: SalesDeskQueueRow[];
  vehicles: VehicleStock[];
  listings: MarketplaceListingPacket[];
  dueCount: number;
  activeLeadCount: number;
};

const SOURCE_CHIP: Record<string, string> = {
  marketplace_message: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  marketplace_post: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  phone_in: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  walk_in: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  web_form: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  referral: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  repeat_customer: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  manual_other: "border-neutral-600 bg-neutral-900 text-neutral-300",
};

const SOURCE_LABEL: Record<string, string> = {
  marketplace_message: "Marketplace",
  marketplace_post: "Post FB",
  phone_in: "Appel",
  walk_in: "Walk-in",
  web_form: "Web",
  referral: "Référé",
  repeat_customer: "Client",
  manual_other: "Autre",
};

function formatPrice(priceCad: number | undefined): string {
  if (priceCad === undefined) return "Prix —";
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

function EmptyPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/40 p-6 text-center">
      <p className="text-sm font-semibold text-neutral-300">{title}</p>
      <p className="mt-2 text-xs leading-5 text-neutral-500">{detail}</p>
    </div>
  );
}

function VehiclePhoto({ src, alt }: { src?: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-900 to-neutral-950">
        <ImageOff className="h-8 w-8 text-neutral-700" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- CDN allowlisted in CSP; avoid next/image remote config churn
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
    />
  );
}

export function SalesDeskClient({
  queue,
  vehicles: initialVehicles,
  listings: initialListings,
  dueCount,
  activeLeadCount,
}: SalesDeskProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [draftByLead, setDraftByLead] = useState<Record<string, { body: string; to: string; channel: string }>>({});
  const [busyLeadId, setBusyLeadId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [syncMsg, setSyncMsg] = useState<string>("");
  const [listingBusy, setListingBusy] = useState<string | null>(null);
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);
  const [inventoryFilter, setInventoryFilter] = useState("");
  const [localVehicles, setLocalVehicles] = useState<VehicleStock[]>(initialVehicles);
  const [listingPacket, setListingPacket] = useState<MarketplaceListingPacket | null>(
    initialListings[0] ?? null,
  );
  const [captureMsg, setCaptureMsg] = useState<string>("");
  const [captureOk, setCaptureOk] = useState(true);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    source: "phone_in" as LeadSource,
    stockId: "",
    notes: "",
  });

  const dueRows = useMemo(() => queue.filter((q) => q.due), [queue]);
  const otherRows = useMemo(() => queue.filter((q) => !q.due), [queue]);

  const filteredVehicles = useMemo(() => {
    const q = inventoryFilter.trim().toLowerCase();
    if (!q) return localVehicles;
    return localVehicles.filter((v) => {
      const hay = [
        v.stockId,
        v.stockNumber,
        v.vin,
        v.make,
        v.model,
        v.trim,
        String(v.year),
        v.condition,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [localVehicles, inventoryFilter]);

  async function flashCopy(key: string, text: string) {
    const ok = await copyText(text);
    if (ok) {
      setCopiedId(key);
      window.setTimeout(() => setCopiedId(null), 1500);
    }
  }

  async function prepareFollowUp(leadId: string, channel: "sms" | "email") {
    setBusyLeadId(leadId);
    try {
      const res = await fetch("/api/sales/follow-up/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, channel, lane: "follow_up" }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.draft) {
        setCaptureMsg(payload?.errors?.join("; ") ?? "Préparation relance échouée.");
        setCaptureOk(false);
        return;
      }
      setDraftByLead((prev) => ({
        ...prev,
        [leadId]: {
          body: payload.draft.body as string,
          to: payload.draft.to as string,
          channel,
        },
      }));
      setExpandedLeadId(leadId);
    } catch (err) {
      setCaptureOk(false);
      setCaptureMsg(err instanceof Error ? err.message : "Préparation relance échouée.");
    } finally {
      setBusyLeadId(null);
    }
  }

  async function markOutcome(leadId: string, outcome: "sold" | "lost", extra: Record<string, string>) {
    setBusyLeadId(leadId);
    try {
      const res = await fetch("/api/sales/outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, outcome, ...extra }),
      });
      if (res.ok) startTransition(() => router.refresh());
      else {
        const payload = await res.json().catch(() => null);
        setCaptureOk(false);
        setCaptureMsg(payload?.errors?.join("; ") ?? "Mise à jour outcome échouée.");
      }
    } catch (err) {
      setCaptureOk(false);
      setCaptureMsg(err instanceof Error ? err.message : "Mise à jour outcome échouée.");
    } finally {
      setBusyLeadId(null);
    }
  }

  async function syncInventory() {
    setSyncState("loading");
    setSyncMsg("");
    try {
      const res = await fetch("/api/inventory/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setSyncState("err");
        setSyncMsg(payload?.errors?.join("; ") ?? "Sync inventaire échouée.");
        return;
      }
      if (Array.isArray(payload.vehicles)) {
        const nextVehicles = payload.vehicles as VehicleStock[];
        setLocalVehicles(nextVehicles);
        setSyncState("ok");
        setSyncMsg(
          `${nextVehicles.length} véhicules synchronisés — grille photo ci-dessous. Clique « Fiche FB » sur une carte.`,
        );
      } else {
        setSyncState("ok");
        setSyncMsg(
          `${payload.vehicleCount ?? 0} véhicules synchronisés — rechargement de la page…`,
        );
        startTransition(() => router.refresh());
      }
    } catch (err) {
      setSyncState("err");
      setSyncMsg(err instanceof Error ? err.message : "Sync échouée");
    }
  }

  async function prepareListing(vehicle: VehicleStock) {
    setListingBusy(vehicle.stockId);
    setSelectedStockId(vehicle.stockId);
    try {
      const res = await fetch("/api/marketplace/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockId: vehicle.stockId, vehicle }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.packet) {
        setSyncState("err");
        setSyncMsg(payload?.errors?.join("; ") ?? "Préparation fiche échouée.");
        return;
      }
      setListingPacket(payload.packet as MarketplaceListingPacket);
      // Scroll fiche into view
      document.getElementById("sales-listing-packet")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (err) {
      setSyncState("err");
      setSyncMsg(err instanceof Error ? err.message : "Préparation fiche échouée.");
    } finally {
      setListingBusy(null);
    }
  }

  async function captureLead(e: FormEvent) {
    e.preventDefault();
    setCaptureBusy(true);
    setCaptureMsg("");
    setCaptureOk(true);
    try {
      const res = await fetch("/api/sales/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName,
          phone: form.phone,
          source: form.source,
          consentBasis: "express",
          interestedStockIds: form.stockId ? [form.stockId] : [],
          interestedModels: form.stockId
            ? [
                (() => {
                  const v = localVehicles.find((x) => x.stockId === form.stockId);
                  return v ? `${v.year} ${v.make} ${v.model}` : form.stockId;
                })(),
              ]
            : [],
          notes: form.notes,
          stage: "new",
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setCaptureOk(false);
        setCaptureMsg(payload?.errors?.join("; ") ?? "Capture échouée.");
        return;
      }
      setCaptureOk(true);
      setCaptureMsg(`Lead capturé : ${payload.lead?.fullName ?? form.fullName}`);
      setForm({ fullName: "", phone: "", source: "phone_in", stockId: "", notes: "" });
      startTransition(() => router.refresh());
    } catch (err) {
      setCaptureOk(false);
      setCaptureMsg(err instanceof Error ? err.message : "Capture échouée.");
    } finally {
      setCaptureBusy(false);
    }
  }

  function listingChecklist(packet: MarketplaceListingPacket): string {
    return [
      `Titre: ${packet.title}`,
      packet.priceCad !== undefined ? `Prix: ${formatPrice(packet.priceCad)}` : "Prix: sur demande",
      `Lieu: ${packet.locationHint}`,
      "",
      "Description:",
      packet.description,
      "",
      `Photos (${packet.photoUrls.length}):`,
      ...packet.photoUrls.map((u, i) => `${i + 1}. ${u}`),
    ].join("\n");
  }

  function LeadRow({ row }: { row: SalesDeskQueueRow }) {
    const { lead, score, due } = row;
    const draft = draftByLead[lead.leadId];
    const expanded = expandedLeadId === lead.leadId;
    const busy = busyLeadId === lead.leadId;

    return (
      <article className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 transition hover:border-neutral-700">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-white">{lead.fullName}</p>
              {due ? (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                  Dû
                </span>
              ) : null}
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SOURCE_CHIP[lead.source] ?? SOURCE_CHIP.manual_other}`}
              >
                {SOURCE_LABEL[lead.source] ?? lead.source}
              </span>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              {lead.phone ?? lead.email ?? "—"} · {lead.stage} · score {score}
              {lead.interestedModels[0] ? ` · ${lead.interestedModels[0]}` : ""}
            </p>
          </div>
          <Phone className="h-4 w-4 shrink-0 text-neutral-600" />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void prepareFollowUp(lead.leadId, "sms")}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquareText className="h-3.5 w-3.5" />}
            Préparer SMS
          </button>
          <button
            type="button"
            disabled={busy || !lead.interestedStockIds[0]}
            onClick={() =>
              void markOutcome(lead.leadId, "sold", {
                soldStockId: lead.interestedStockIds[0] ?? "",
              })
            }
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-xs font-semibold text-neutral-300 hover:border-neutral-500 disabled:opacity-40"
          >
            Sold
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const reason = window.prompt("Raison de la perte ?");
              if (reason?.trim()) void markOutcome(lead.leadId, "lost", { lostReason: reason.trim() });
            }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-neutral-800 px-3 text-xs font-semibold text-neutral-500 hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-40"
          >
            Lost
          </button>
        </div>

        {expanded && draft ? (
          <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/30 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Draft {draft.channel.toUpperCase()} → {draft.to}
            </p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-5 text-neutral-200">{draft.body}</pre>
            <button
              type="button"
              onClick={() => void flashCopy(`draft-${lead.leadId}`, draft.body)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-300 hover:border-amber-500/40 hover:text-amber-200"
            >
              <ClipboardCopy className="h-3.5 w-3.5" />
              {copiedId === `draft-${lead.leadId}` ? "Copié" : "Copier le message"}
            </button>
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-amber-500/[0.08] via-black/20 to-black/40 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-300/80">Relances dues</p>
          <p className="mt-1 text-3xl font-extrabold text-white">{dueCount}</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-sky-500/[0.08] via-black/20 to-black/40 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-sky-300/80">Leads actifs</p>
          <p className="mt-1 text-3xl font-extrabold text-white">{activeLeadCount}</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-emerald-500/[0.08] via-black/20 to-black/40 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-300/80">Stock visible</p>
          <p className="mt-1 text-3xl font-extrabold text-white">{localVehicles.length}</p>
        </div>
      </div>

      {/* HERO — Visual inventory (what sync feeds) */}
      <section className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-sky-500/[0.06] via-black/20 to-black/40 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-300">
              <Car className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-white sm:text-xl">Inventaire Buckingham — grille visuelle</h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-neutral-400 sm:text-sm">
                Sync tire photos + stock + prix depuis le site. Clique une carte → fiche Marketplace prête à
                coller. Les images restent liées au CDN du concessionnaire.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void syncInventory()}
            disabled={syncState === "loading"}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 text-sm font-bold text-neutral-950 hover:bg-sky-400 disabled:opacity-40"
          >
            {syncState === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sync site web
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative block min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <input
              value={inventoryFilter}
              onChange={(e) => setInventoryFilter(e.target.value)}
              placeholder="Filtrer : Trax, Sierra, 26344-NEUF, VIN…"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 py-2.5 pl-10 pr-3 text-sm text-white outline-none ring-sky-500/30 placeholder:text-neutral-600 focus:ring-2"
            />
          </label>
          {syncMsg ? (
            <p className={`text-xs sm:max-w-sm ${syncState === "err" ? "text-rose-300" : "text-emerald-300"}`}>
              {syncMsg}
            </p>
          ) : null}
        </div>

        {localVehicles.length === 0 ? (
          <div className="mt-4">
            <EmptyPanel
              title="Aucun véhicule affiché"
              detail="Clique « Sync site web » — tu verras une grille photo comme sur buckinghamgm.com."
            />
          </div>
        ) : (
          <div className="mt-4 grid max-h-[42rem] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredVehicles.map((v) => {
              const title = `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ""}`;
              const selected = selectedStockId === v.stockId;
              return (
                <article
                  key={v.stockId}
                  className={`group overflow-hidden rounded-2xl border bg-neutral-950/70 transition ${
                    selected
                      ? "border-amber-500/50 shadow-[0_0_0_1px_rgba(245,158,11,0.25)]"
                      : "border-neutral-800 hover:border-neutral-600"
                  }`}
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-neutral-900">
                    <VehiclePhoto src={v.photoUrls[0]} alt={title} />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-3 pt-10">
                      <p className="text-sm font-bold leading-tight text-white">{title}</p>
                      <p className="mt-1 text-xs font-semibold text-amber-300">{formatPrice(v.priceCad)}</p>
                    </div>
                    <span className="absolute left-2 top-2 rounded-full border border-white/10 bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-200 backdrop-blur">
                      {v.condition === "new" ? "Neuf" : v.condition === "cpo" ? "CPO" : "Occasion"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[11px] text-neutral-400">{v.stockId}</p>
                      <p className="truncate text-[11px] text-neutral-600">
                        {v.photoUrls.length} photo{v.photoUrls.length === 1 ? "" : "s"}
                        {v.listingUrl ? " · lien site" : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {v.listingUrl ? (
                        <a
                          href={v.listingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-white"
                          title="Ouvrir fiche concession"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                      <button
                        type="button"
                        disabled={listingBusy === v.stockId}
                        onClick={() => void prepareListing(v)}
                        className="inline-flex min-h-9 items-center rounded-lg bg-amber-500 px-3 text-[11px] font-bold text-neutral-950 hover:bg-amber-400 disabled:opacity-40"
                      >
                        {listingBusy === v.stockId ? "…" : "Fiche FB"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {filteredVehicles.length === 0 && localVehicles.length > 0 ? (
          <p className="mt-3 text-center text-xs text-neutral-500">Aucun véhicule ne correspond au filtre.</p>
        ) : null}

        {listingPacket ? (
          <div
            id="sales-listing-packet"
            className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4"
          >
            <div className="flex flex-col gap-4 lg:flex-row">
              <div className="flex gap-2 overflow-x-auto lg:w-64 lg:flex-col lg:overflow-visible">
                {listingPacket.photoUrls.slice(0, 6).map((url) => (
                  <div
                    key={url}
                    className="relative h-20 w-32 shrink-0 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 lg:h-28 lg:w-full"
                  >
                    <VehiclePhoto src={url} alt={listingPacket.title} />
                  </div>
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-amber-300" />
                  <p className="text-sm font-bold text-amber-100">Fiche Marketplace prête</p>
                </div>
                <p className="mt-2 text-base font-semibold text-white">{listingPacket.title}</p>
                <p className="mt-1 text-sm text-amber-300">{formatPrice(listingPacket.priceCad)}</p>
                <pre className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/[0.06] bg-black/30 p-3 font-sans text-xs leading-5 text-neutral-300">
                  {listingPacket.description}
                </pre>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void flashCopy("listing-full", listingChecklist(listingPacket))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-amber-500/40"
                  >
                    <ClipboardCopy className="h-3.5 w-3.5" />
                    {copiedId === "listing-full" ? "Copié" : "Copier fiche complète"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void flashCopy("listing-title", listingPacket.title)}
                    className="rounded-lg border border-neutral-800 px-3 py-2 text-xs text-neutral-400 hover:text-white"
                  >
                    Copier titre
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-neutral-500">
                  Oria ne publie pas sur Facebook — copie / upload manuel uniquement.
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {/* Secondary — leads */}
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.03] to-black/30 p-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300">
              <Sunrise className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-white">File du matin</h2>
              <p className="text-[11px] text-neutral-500">Relances dues — prepare SMS (Activix lundi)</p>
            </div>
          </div>
          <div className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto pr-1">
            {queue.length === 0 ? (
              <EmptyPanel title="Aucun lead en file" detail="Capture un walk-in / appel à droite." />
            ) : (
              <>
                {dueRows.map((row) => (
                  <LeadRow key={row.lead.leadId} row={row} />
                ))}
                {otherRows.map((row) => (
                  <LeadRow key={row.lead.leadId} row={row} />
                ))}
              </>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.03] to-black/30 p-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
              <UserPlus className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-white">Capture rapide</h2>
              <p className="text-[11px] text-neutral-500">Temporaire — Activix dès lundi</p>
            </div>
          </div>

          <form onSubmit={(e) => void captureLead(e)} className="flex flex-col gap-3">
            <label className="block">
              <span className="text-[11px] font-semibold text-neutral-400">Nom</span>
              <input
                required
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none ring-amber-500/40 placeholder:text-neutral-600 focus:ring-2"
                placeholder="Sam Gagnon"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-neutral-400">Téléphone</span>
              <input
                required
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none ring-amber-500/40 placeholder:text-neutral-600 focus:ring-2"
                placeholder="819-555-0199"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-neutral-400">Source</span>
              <select
                value={form.source}
                onChange={(e) => setForm((f) => ({ ...f, source: e.target.value as LeadSource }))}
                className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-amber-500/40"
              >
                <option value="phone_in">Appel</option>
                <option value="walk_in">Walk-in</option>
                <option value="marketplace_message">Marketplace</option>
                <option value="web_form">Web</option>
                <option value="referral">Référé</option>
                <option value="manual_other">Autre</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-neutral-400">Stock (optionnel)</span>
              <select
                value={form.stockId}
                onChange={(e) => setForm((f) => ({ ...f, stockId: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-amber-500/40"
              >
                <option value="">—</option>
                {localVehicles.map((v) => (
                  <option key={v.stockId} value={v.stockId}>
                    {v.stockId} — {v.year} {v.make} {v.model}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-neutral-400">Note</span>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-amber-500/40"
                placeholder="Veut essai demain…"
              />
            </label>
            <button
              type="submit"
              disabled={captureBusy}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 text-sm font-bold text-neutral-950 hover:bg-amber-400 disabled:opacity-40"
            >
              {captureBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Ajouter (temporaire)
            </button>
            {captureMsg ? (
              <p className={`text-xs ${captureOk ? "text-emerald-300" : "text-rose-300"}`}>{captureMsg}</p>
            ) : null}
          </form>
        </section>
      </div>
    </div>
  );
}
