"use client";

// Publisher agent panel — auto-pilot Facebook Page + Marketplace queue.
// Page posts go out via the official Graph API (simulated locally without a
// token). Marketplace items are fully prepared; the human does the final click.

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  Loader2,
  Megaphone,
  Rocket,
  Send,
} from "lucide-react";
import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import type { SocialPublication } from "@/features/marketing/social-publication";
import { MARKETPLACE_CREATE_VEHICLE_URL } from "@/features/marketing/social-publication";

type RunSummary = {
  summaryFr: string;
  pageConnected: boolean;
};

const STATUS_CHIP: Record<string, string> = {
  queued: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  published_auto: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  published_manual: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  failed: "border-rose-500/30 bg-rose-500/10 text-rose-300",
};

const STATUS_LABEL: Record<string, string> = {
  queued: "À publier (clic humain)",
  published_auto: "Auto-publié",
  published_manual: "Publié (manuel)",
  failed: "Échec",
};

const MODE_LABEL: Record<string, string> = {
  auto_api: "API Meta",
  assisted_manual: "Assisté",
  simulated: "Simulation",
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function PublisherPanel({ vehicles }: { vehicles: VehicleStock[] }) {
  const [publications, setPublications] = useState<SocialPublication[]>([]);
  const [busy, setBusy] = useState(false);
  const [markBusyId, setMarkBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");
  const [messageOk, setMessageOk] = useState(true);
  const [summary, setSummary] = useState<RunSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/marketing/publications");
        const payload = await res.json().catch(() => null);
        if (!cancelled && res.ok && Array.isArray(payload?.publications)) {
          setPublications(payload.publications as SocialPublication[]);
        }
      } catch {
        // silent — panel loads empty
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function flashCopy(key: string, text: string) {
    const ok = await copyText(text);
    if (ok) {
      setCopiedId(key);
      window.setTimeout(() => setCopiedId(null), 1500);
    }
  }

  async function runAutoPilot() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/marketing/publications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "auto_pilot",
          channels: ["facebook_page", "marketplace"],
          maxPerRun: 3,
          inventory: vehicles,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setMessageOk(false);
        setMessage(payload?.errors?.join("; ") ?? "Run auto-pilote échoué.");
        return;
      }
      setMessageOk(true);
      setMessage(payload.summaryFr as string);
      setSummary({
        summaryFr: payload.summaryFr as string,
        pageConnected: Boolean(payload.pageConnected),
      });
      const created = (payload.publications ?? []) as SocialPublication[];
      setPublications((prev) => {
        const ids = new Set(created.map((p) => p.publicationId));
        return [...created, ...prev.filter((p) => !ids.has(p.publicationId))];
      });
    } catch (err) {
      setMessageOk(false);
      setMessage(err instanceof Error ? err.message : "Run auto-pilote échoué.");
    } finally {
      setBusy(false);
    }
  }

  async function markPublished(publicationId: string) {
    setMarkBusyId(publicationId);
    try {
      const res = await fetch("/api/marketing/publications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_published_manual", publicationId }),
      });
      const payload = await res.json().catch(() => null);
      if (res.ok && payload?.publication) {
        const updated = payload.publication as SocialPublication;
        setPublications((prev) =>
          prev.map((p) => (p.publicationId === updated.publicationId ? updated : p)),
        );
      }
    } finally {
      setMarkBusyId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/[0.06] via-black/25 to-black/45 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
            <Megaphone className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">
              Agent Publication
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-neutral-400 sm:text-sm">
              Auto-pilote : choisit les meilleurs véhicules (photos, prix, demande locale),
              publie sur la Page Facebook via l&apos;API Meta et prépare la file Marketplace.
              Chaque réponse devient un lead.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void runAutoPilot()}
          disabled={busy || vehicles.length === 0}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-neutral-950 shadow-[0_0_24px_rgba(16,185,129,0.25)] hover:bg-emerald-400 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
          Lancer l&apos;auto-pilote (3 véhicules)
        </button>
      </div>

      {message ? (
        <p className={`mt-3 text-xs leading-5 ${messageOk ? "text-emerald-300" : "text-rose-300"}`}>
          {message}
        </p>
      ) : null}

      {summary && !summary.pageConnected ? (
        <p className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 text-[11px] leading-5 text-amber-200">
          Page Facebook non connectée — les posts Page tournent en simulation. Configure{" "}
          <code className="rounded bg-black/40 px-1">FACEBOOK_PAGE_ID</code> +{" "}
          <code className="rounded bg-black/40 px-1">FACEBOOK_PAGE_ACCESS_TOKEN</code> pour
          l&apos;auto-publication réelle (API officielle Meta, aucun bot).
        </p>
      ) : null}

      {vehicles.length === 0 ? (
        <p className="mt-3 text-xs text-neutral-500">
          Inventaire vide — lance « Sync site web » d&apos;abord.
        </p>
      ) : null}

      {publications.length > 0 ? (
        <div className="mt-4 flex max-h-[26rem] flex-col gap-3 overflow-y-auto pr-1">
          {publications.map((pub) => (
            <article
              key={pub.publicationId}
              className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_CHIP[pub.status] ?? STATUS_CHIP.queued}`}
                >
                  {STATUS_LABEL[pub.status] ?? pub.status}
                </span>
                <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] font-semibold text-neutral-300">
                  {pub.channel === "facebook_page" ? "Page Facebook" : "Marketplace"}
                </span>
                <span className="rounded-full border border-neutral-800 px-2 py-0.5 text-[10px] text-neutral-500">
                  {MODE_LABEL[pub.mode] ?? pub.mode}
                </span>
                <p className="min-w-0 flex-1 truncate text-xs font-semibold text-white">
                  {pub.vehicleLabel}
                </p>
              </div>
              <p className="mt-1.5 text-[11px] leading-4 text-neutral-500">{pub.rationale}</p>
              {pub.error ? (
                <p className="mt-1 text-[11px] text-rose-300">{pub.error}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void flashCopy(pub.publicationId, pub.message)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-200 hover:border-emerald-500/40"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                  {copiedId === pub.publicationId ? "Copié" : "Copier le texte"}
                </button>
                {pub.channel === "marketplace" && pub.status === "queued" ? (
                  <>
                    <a
                      href={MARKETPLACE_CREATE_VEHICLE_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-sky-200 hover:bg-sky-500/20"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Ouvrir Marketplace
                    </a>
                    <button
                      type="button"
                      disabled={markBusyId === pub.publicationId}
                      onClick={() => void markPublished(pub.publicationId)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40"
                    >
                      {markBusyId === pub.publicationId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      Marquer publié
                    </button>
                  </>
                ) : null}
                {pub.postUrl ? (
                  <a
                    href={pub.postUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 px-2.5 py-1.5 text-[11px] text-neutral-400 hover:text-white"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Voir le post
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/40 p-4 text-center text-xs text-neutral-500">
          Aucune publication encore — lance l&apos;auto-pilote pour générer la première vague.
        </p>
      )}
    </section>
  );
}
