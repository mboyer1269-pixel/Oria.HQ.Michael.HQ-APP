import Link from "next/link";
import type { Route } from "next";
import { Plus, Sparkles } from "lucide-react";
import { Eyebrow, Tooltip } from "./ui";

// ---------------------------------------------------------------------------
// Ventures — honest cockpit preview.
//
// This component does not read the Venture repository yet, so it must not claim
// that there are zero active ventures. It shows one real navigation action plus
// clearly-labelled empty slots for a future repository-backed cockpit summary.
// ---------------------------------------------------------------------------

function PlaceholderSlot({ index }: { index: number }) {
  return (
    <Tooltip
      title="Slot cockpit à venir"
      detail="Quand ce cockpit lira le Venture Engine, ce slot affichera une suggestion ou une venture réelle, classée."
      meta="Repository non lu ici"
      className="w-full"
    >
      <div className="flex min-h-[140px] w-full flex-col justify-between rounded-2xl border border-dashed border-white/10 bg-black/10 p-4">
        <div className="flex items-center justify-between">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-black/20 text-[#646c8e]">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10.5px] font-semibold text-[#646c8e]">
            #{index}
          </span>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-[#98a1c4]">Slot à brancher</p>
          <p className="mt-0.5 text-[11px] text-[#646c8e]">en attente du repository</p>
        </div>
      </div>
    </Tooltip>
  );
}

export function VentureSuggestions() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Eyebrow>Portefeuille · aperçu</Eyebrow>
          <h3 className="mt-1.5 text-[16px] font-bold text-[#eff1fb]">Ventures</h3>
          <p className="mt-1 text-[12.5px] text-[#646c8e]">
            Ce cockpit ne lit pas encore le repository ventures. Ouvre le Venture Engine pour voir
            les cartes sauvegardées, les suggestions et les décisions CEO.
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Link
          href={"/hq/ventures" as Route}
          className="group flex min-h-[140px] flex-col justify-between rounded-2xl border border-violet-500/40 bg-gradient-to-br from-violet-500/15 to-cyan-500/[0.06] p-4 transition hover:-translate-y-0.5 hover:shadow-[0_18px_44px_-22px_rgba(0,0,0,.72)]"
        >
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-[0_0_0_1px_rgba(139,92,246,.3)]">
            <Plus className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-bold text-[#eff1fb]">Nouvelle venture</p>
            <p className="mt-0.5 text-[11.5px] text-[#98a1c4]">ouvrir le Venture Engine</p>
          </div>
        </Link>

        <PlaceholderSlot index={1} />
        <PlaceholderSlot index={2} />
        <PlaceholderSlot index={3} />
      </div>
    </div>
  );
}
