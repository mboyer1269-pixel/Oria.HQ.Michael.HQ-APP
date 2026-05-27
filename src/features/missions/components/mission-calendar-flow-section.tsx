"use client";

import type { Route } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { MissionDraftPendingPanel } from "@/features/hq/components/mission-draft-pending-panel";
import { MissionFlowLegend } from "@/features/missions/components/mission-flow-legend";

export function MissionCalendarFlowSection() {
  return (
    <section className="flex flex-col gap-4" aria-label="Flux calendrier Joris">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Flux calendrier Joris
            </p>
            <p className="mt-2 text-sm leading-6 text-neutral-400">
              Les rendez-vous passent par une <strong className="font-medium text-amber-200">proposition</strong>{" "}
              (pending), puis une confirmation sur <strong className="font-medium text-white">Michael HQ</strong>.
              Cette page montre le pipeline et les missions déjà confirmées — pas le pending actif.
            </p>
          </div>
          <Link
            href={"/hq#mission-draft-pending" as Route}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 text-sm font-semibold text-amber-200 transition hover:border-amber-500/50"
          >
            Ouvrir le bandeau HQ
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <MissionDraftPendingPanel variant="embedded" listenForDraftChanges />

      <MissionFlowLegend />
    </section>
  );
}
