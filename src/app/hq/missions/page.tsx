import type { Route } from "next";
import Link from "next/link";
import { Bot, LayoutDashboard, ShieldAlert } from "lucide-react";
import { MissionCalendarFlowSection } from "@/features/missions/components/mission-calendar-flow-section";
import { MissionKanbanBoard } from "@/features/missions/components/mission-kanban-board";
import { MissionApprovalPanel } from "@/features/missions/components/mission-approval-panel";
import { MissionSystemStatus } from "@/features/missions/components/mission-system-status";
import { summarizeMissions } from "@/features/missions/summary";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { listMissionsForWorkspace } from "@/server/missions";
import { requireOwnerAccess } from "@/server/auth/owner";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";
import {
  HqMetric,
  HqPageHeader,
  HqPageShell,
  HqSummaryRail,
  HqWidget,
} from "@/features/hq/components/hq-widget-system";

export const dynamic = "force-dynamic";

export default async function MissionsPage() {
  const access = await requireOwnerAccess("/hq/missions");

  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  const { activeWorkspace, activeMode } = getActiveWorkspaceContext();
  const { missions, source } = await listMissionsForWorkspace({
    workspaceId: activeWorkspace.id,
    modeId: activeMode.id,
  });

  const summary = summarizeMissions(missions);
  const hasMissions = summary.total > 0;

  return (
    <HqPageShell>
      <HqPageHeader
        backHref={"/hq" as Route}
        eyebrow="Mission Control"
        icon={LayoutDashboard}
        tone="amber"
        title="Pipeline des missions"
        description={
          <>
            Vue pipeline et démonstration Phase 1. Les rendez-vous Joris passent par une proposition pending sur{" "}
            <Link href={"/hq#mission-draft-pending" as Route} className="text-amber-300 underline-offset-2 hover:underline">
              Michael HQ
            </Link>
            ; l&apos;approbation exécuteur ci-dessous reste mock (Phase 2).
          </>
        }
      >
        <HqSummaryRail>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Résumé</p>
          <div className="mt-3 grid gap-2">
            <HqMetric label="Total" value={summary.total} />
            <HqMetric label="En cours" value={summary.running} tone="amber" />
            <HqMetric label="Approbation" value={summary.needs_approval} tone="amber" />
            <HqMetric label="Terminées" value={summary.completed} tone="emerald" />
            {summary.failed > 0 && (
              <HqMetric label="Échouées" value={summary.failed} tone="rose" />
            )}
          </div>
        </HqSummaryRail>
      </HqPageHeader>

      {summary.needs_approval > 0 && (
        <section className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-orange-300" />
            <div>
              <h2 className="font-semibold text-orange-100">
                {summary.needs_approval} mission{summary.needs_approval > 1 ? "s" : ""} en attente d&apos;approbation
              </h2>
              <ul className="mt-2 space-y-1">
                {missions
                  .filter((m) => m.status === "needs_approval")
                  .map((m) => (
                    <li key={m.id} className="text-sm text-orange-200/70">
                      · {m.title} — autonomie {m.autonomyLevel}/5
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      <HqWidget title="Calendar flow" eyebrow="Joris bookings" icon={LayoutDashboard}>
        <MissionCalendarFlowSection />
      </HqWidget>

      <HqWidget title="Système mission" eyebrow="Health" icon={ShieldAlert}>
        <MissionSystemStatus />
      </HqWidget>

      <HqWidget title="Approbations" eyebrow="Human gate" icon={ShieldAlert}>
        <MissionApprovalPanel missions={missions} />
      </HqWidget>

      <HqWidget title="Kanban mission" eyebrow="Pipeline" icon={LayoutDashboard}>
        {hasMissions ? (
          <MissionKanbanBoard missions={missions} />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-neutral-800 bg-neutral-950/40 px-4 py-24 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-900 shadow-inner">
              <Bot className="h-8 w-8 text-amber-400" />
            </div>
            <div className="mt-6 max-w-md">
              <h2 className="text-xl font-semibold text-white">Aucune mission active</h2>
              <p className="mt-3 text-sm leading-6 text-neutral-400">
                Le pipeline de missions est actuellement vide pour ce workspace. Démarrez une nouvelle action via Joris pour la voir apparaître ici.
              </p>
              <Link 
                href={"/hq" as Route} 
                className="mt-8 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-amber-500 px-6 text-sm font-semibold text-neutral-950 transition hover:bg-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.15)]"
              >
                <Bot className="h-4 w-4" />
                Lancer une mission via Joris
              </Link>
            </div>
          </div>
        )}
      </HqWidget>

      <footer className="rounded-2xl border border-white/[0.07] bg-neutral-950/60 px-4 py-3">
        <p className="text-xs leading-5 text-neutral-600">
          <span className="font-medium text-neutral-500">
            Source: {source === "supabase" ? "Supabase" : "données locales"} —{" "}
          </span>
          Calendar.book : gate live sur /hq (#96–#98). Exécuteur autonome verrouillé — Phase 2 après Red Team.
        </p>
      </footer>
    </HqPageShell>
  );
}
