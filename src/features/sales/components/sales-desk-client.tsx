"use client";

// Sales Desk — morning queue + Marketplace listing prep + lead capture.
// Prepare-only: copy drafts / checklists; human publishes and sends.

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Car,
  CheckCircle2,
  ClipboardCopy,
  Loader2,
  MessageSquareText,
  Phone,
  RefreshCw,
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

export function SalesDeskClient({
  queue,
  vehicles,
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
  const [listingPacket, setListingPacket] = useState<MarketplaceListingPacket | null>(
    initialListings[0] ?? null,
  );
  const [captureMsg, setCaptureMsg] = useState<string>("");
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
      setSyncState("ok");
      setSyncMsg(`${payload.vehicleCount ?? 0} véhicules synchronisés.`);
      startTransition(() => router.refresh());
    } catch (err) {
      setSyncState("err");
      setSyncMsg(err instanceof Error ? err.message : "Sync échouée");
    }
  }

  async function prepareListing(stockId: string) {
    setListingBusy(stockId);
    try {
      const res = await fetch("/api/marketplace/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockId }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.packet) {
        setSyncMsg(payload?.errors?.join("; ") ?? "Préparation fiche échouée.");
        return;
      }
      setListingPacket(payload.packet as MarketplaceListingPacket);
    } finally {
      setListingBusy(null);
    }
  }

  async function captureLead(e: FormEvent) {
    e.preventDefault();
    setCaptureBusy(true);
    setCaptureMsg("");
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
                  const v = vehicles.find((x) => x.stockId === form.stockId);
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
        setCaptureMsg(payload?.errors?.join("; ") ?? "Capture échouée.");
        return;
      }
      setCaptureMsg(`Lead capturé : ${payload.lead?.fullName ?? form.fullName}`);
      setForm({ fullName: "", phone: "", source: "phone_in", stockId: "", notes: "" });
      startTransition(() => router.refresh());
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
            title={!lead.interestedStockIds[0] ? "Lie un stock au lead avant sold" : undefined}
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
            <p className="mt-2 text-[11px] text-neutral-600">Oria ne l’envoie pas — colle dans Messages / SMS.</p>
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <div className="flex flex-col gap-4">
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
          <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-300/80">Stock en mémoire</p>
          <p className="mt-1 text-3xl font-extrabold text-white">{vehicles.length}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Panel 1 — Morning queue */}
        <section className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.03] to-black/30 p-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300">
              <Sunrise className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-white">File du matin</h2>
              <p className="text-[11px] text-neutral-500">Relances dues d’abord — prepare SMS, toi envoies</p>
            </div>
          </div>
          <div className="flex max-h-[34rem] flex-col gap-3 overflow-y-auto pr-1">
            {queue.length === 0 ? (
              <EmptyPanel
                title="Aucun lead en file"
                detail="Capture un walk-in / appel à droite, ou un inbound Marketplace."
              />
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

        {/* Panel 2 — Inventory → Marketplace */}
        <section className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.03] to-black/30 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-300">
                <Car className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-white">Stock → Marketplace</h2>
                <p className="text-[11px] text-neutral-500">Fiche prête à uploader — pas d’auto-post</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void syncInventory()}
              disabled={syncState === "loading"}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 text-[11px] font-semibold text-sky-300 hover:bg-sky-500/20 disabled:opacity-40"
            >
              {syncState === "loading" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Sync site
            </button>
          </div>
          {syncMsg ? (
            <p className={`text-[11px] ${syncState === "err" ? "text-rose-300" : "text-emerald-300"}`}>{syncMsg}</p>
          ) : null}

          <div className="flex max-h-52 flex-col gap-2 overflow-y-auto">
            {vehicles.length === 0 ? (
              <EmptyPanel
                title="Inventaire vide"
                detail="Clique Sync site pour tirer buckinghamgm.com, ou ingest JSON."
              />
            ) : (
              vehicles.slice(0, 40).map((v) => (
                <div
                  key={v.stockId}
                  className="flex items-center justify-between gap-2 rounded-xl border border-neutral-800 bg-neutral-950/50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-white">
                      {v.year} {v.make} {v.model}
                      {v.trim ? ` ${v.trim}` : ""}
                    </p>
                    <p className="truncate text-[11px] text-neutral-500">
                      {v.stockId} · {formatPrice(v.priceCad)} · {v.photoUrls.length} photo
                      {v.photoUrls.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={listingBusy === v.stockId}
                    onClick={() => void prepareListing(v.stockId)}
                    className="shrink-0 rounded-lg bg-amber-500 px-2.5 py-1.5 text-[11px] font-bold text-neutral-950 hover:bg-amber-400 disabled:opacity-40"
                  >
                    {listingBusy === v.stockId ? "…" : "Fiche"}
                  </button>
                </div>
              ))
            )}
          </div>

          {listingPacket ? (
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.06] p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-sky-300" />
                <p className="text-xs font-bold text-sky-200">Fiche prête — {listingPacket.title}</p>
              </div>
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-[11px] leading-4 text-neutral-300">
                {listingPacket.description}
              </p>
              <p className="mt-2 text-[11px] text-neutral-500">
                {listingPacket.photoUrls.length} photos · {formatPrice(listingPacket.priceCad)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void flashCopy("listing-full", listingChecklist(listingPacket))}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-200 hover:border-amber-500/40"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                  {copiedId === "listing-full" ? "Copié" : "Copier fiche complète"}
                </button>
                <button
                  type="button"
                  onClick={() => void flashCopy("listing-title", listingPacket.title)}
                  className="rounded-lg border border-neutral-800 px-2.5 py-1.5 text-[11px] text-neutral-400 hover:text-white"
                >
                  Titre
                </button>
                {listingPacket.photoUrls[0] ? (
                  <a
                    href={listingPacket.photoUrls[0]}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-neutral-800 px-2.5 py-1.5 text-[11px] text-neutral-400 hover:text-white"
                  >
                    Ouvrir photo 1
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        {/* Panel 3 — Capture lead */}
        <section className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.03] to-black/30 p-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
              <UserPlus className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-white">Capture lead</h2>
              <p className="text-[11px] text-neutral-500">Walk-in / appel / inbound — 10 secondes</p>
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
                {vehicles.map((v) => (
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
              Ajouter à la lead bank
            </button>
            {captureMsg ? <p className="text-xs text-emerald-300">{captureMsg}</p> : null}
          </form>
        </section>
      </div>
    </div>
  );
}
