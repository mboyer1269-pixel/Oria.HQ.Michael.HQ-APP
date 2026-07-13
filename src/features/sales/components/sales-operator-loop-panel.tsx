"use client";

import type { InventoryDebrief } from "@/features/inventory/inventory-debrief";
import type { VehicleStock } from "@/features/inventory/vehicle-stock";
import type { MarketplaceListingPacket } from "@/features/marketplace-listings/listing-packet";
import {
  OPERATOR_LOOP_STEPS,
  buildOperatorLoopSnapshot,
} from "@/features/sales/sales-operator-loop";
import type { SalesLead } from "@/features/sales/sales-lead";
import { ListChecks, Target } from "lucide-react";

type SectionId = "publication" | "marketing" | "inventory" | "leads";

type Props = {
  vehicles: VehicleStock[];
  listings: MarketplaceListingPacket[];
  leads: SalesLead[];
  debrief: InventoryDebrief | null;
  onNavigate: (section: SectionId) => void;
};

const NAV: { id: SectionId; label: string }[] = [
  { id: "publication", label: "Publication" },
  { id: "marketing", label: "Marketing" },
  { id: "inventory", label: "Inventaire" },
  { id: "leads", label: "Leads" },
];

export function SalesOperatorLoopPanel({
  vehicles,
  listings,
  leads,
  debrief,
  onNavigate,
}: Props) {
  const loop = buildOperatorLoopSnapshot({
    vehicles,
    listings,
    leads,
    debrief,
    nowIso: new Date().toISOString(),
  });

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-gradient-to-r from-neutral-900/80 via-black/40 to-black/60 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
            <ListChecks className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-white">Boucle opérateur — sans faille</h2>
            <p className="mt-1 text-[11px] leading-5 text-neutral-400">
              Sync → prépare → publie (toi) → capture → relance → close. Prepare-only Meta.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {OPERATOR_LOOP_STEPS.map((step) => (
                <span
                  key={step.id}
                  className="rounded-full border border-neutral-800 bg-black/40 px-2 py-0.5 text-[10px] text-neutral-500"
                  title={step.detailFr}
                >
                  {step.labelFr}
                </span>
              ))}
            </div>
          </div>
        </div>
        <nav className="flex flex-wrap gap-1.5">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-[11px] font-semibold text-neutral-300 hover:border-emerald-500/40 hover:text-emerald-200"
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="À publier" value={loop.readyToPublishCount} tone="rose" />
        <Metric label="Live" value={loop.publishedCount} tone="emerald" />
        <Metric label="Leads actifs" value={loop.activeLeadCount} tone="sky" />
        <Metric label="Relances dues" value={loop.dueFollowUpCount} tone="amber" />
      </div>

      <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
        <div className="flex items-start gap-2">
          <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
          <ul className="space-y-1 text-[11px] leading-5 text-neutral-300">
            {loop.nextActionsFr.map((action) => (
              <li key={action}>• {action}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "rose" | "emerald" | "sky" | "amber";
}) {
  const toneClass =
    tone === "rose"
      ? "text-rose-300"
      : tone === "emerald"
        ? "text-emerald-300"
        : tone === "sky"
          ? "text-sky-300"
          : "text-amber-300";
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/30 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`text-xl font-extrabold ${toneClass}`}>{value}</p>
    </div>
  );
}
