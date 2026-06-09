import type { Route } from "next";
import Link from "next/link";
import { Activity, ArrowRight, ScrollText } from "lucide-react";

// ---------------------------------------------------------------------------
// activity-rail.tsx — compact, read-only activity rail for CockpitShell.
//
// This rail does NOT fetch, fabricate, or stream activity. It shows an explicit
// conservative posture: no verified activity is rendered here, and no ledger
// write happens from this view. The real, audited ledger read-model lives on
// the HQ page (LedgerActivity, workspace-scoped); this rail points to it rather
// than duplicating it on every route or inventing rows. Presentational only —
// no server calls, no mutations, no "live" claim.
// ---------------------------------------------------------------------------

export function ActivityRail() {
  return (
    <aside
      aria-label="Activité, lecture seule"
      className="flex shrink-0 flex-col gap-1 border-b border-white/[0.06] bg-[#080b16]/40 px-5 py-2.5 backdrop-blur-xl"
    >
      <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
        <span className="flex items-center gap-1.5 font-semibold text-[#98a1c4]">
          <Activity className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
          Activité
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 font-semibold text-[#c9cee4]">
          Lecture seule
        </span>
        <Link
          href={"/hq#ledger-activity" as Route}
          className="ml-auto inline-flex items-center gap-1 font-semibold text-sky-300/90 transition hover:text-sky-200"
        >
          <ScrollText className="h-3 w-3" aria-hidden="true" />
          Journal d&apos;audit
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
      <p className="text-[10.5px] leading-snug text-[#646c8e]">
        Aucune activité vérifiée à afficher ici · aucune écriture ledger depuis cette vue. Les événements
        apparaissent uniquement depuis une source auditée — le journal d&apos;audit complet vit sur la page HQ.
      </p>
    </aside>
  );
}
