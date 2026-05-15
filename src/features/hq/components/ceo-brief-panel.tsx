import type { Route } from "next";
import Link from "next/link";
import { CalendarClock, FileText, Sparkles, UsersRound, type LucideIcon } from "lucide-react";
import type { CeoBriefSnapshot } from "@/features/hq/types";
import type { ReactNode } from "react";

type CeoBriefPanelProps = {
  brief: CeoBriefSnapshot;
};

function formatEventWhen(dateISO: string, startTime: string) {
  const [year, month, day] = dateISO.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  const dayLabel = new Intl.DateTimeFormat("fr-CA", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);

  return `${dayLabel} · ${startTime}`;
}

function formatLeadWhen(createdAt: string) {
  return new Intl.DateTimeFormat("fr-CA", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(createdAt));
}

function BriefCard({
  title,
  icon: Icon,
  count,
  badgeLabel,
  emptyLabel,
  isEmpty,
  items,
  footer,
}: {
  title: string;
  icon: LucideIcon;
  count: number;
  badgeLabel?: string;
  emptyLabel: string;
  isEmpty: boolean;
  items: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-amber-300" />
          <h3 className="font-semibold text-white">{title}</h3>
        </div>
        <span className="rounded-full border border-neutral-700 px-2 py-1 text-[11px] text-neutral-300">
          {count}
          {badgeLabel ? ` ${badgeLabel}` : ""}
        </span>
      </div>
      {isEmpty ? (
        <p className="mt-4 text-sm leading-6 text-neutral-500">{emptyLabel}</p>
      ) : (
        <ul className="mt-4 space-y-2">{items}</ul>
      )}
      {footer}
    </article>
  );
}

export function CeoBriefPanel({ brief }: CeoBriefPanelProps) {
  const hatSummary = Object.entries(brief.documents.byHat)
    .slice(0, 4)
    .map(([hat, count]) => `${hat} (${count})`)
    .join(" · ");

  return (
    <section
      id="ceo-brief"
      className="scroll-mt-6 rounded-3xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-neutral-950 to-neutral-950 p-5 md:p-6"
    >
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-200">
          <Sparkles className="h-3.5 w-3.5" />
          CEO Brief
        </div>
        <h2 className="mt-3 text-2xl font-semibold text-white md:text-3xl">{brief.headline}</h2>
        <p className="mt-2 text-xs text-neutral-500">
          Généré{" "}
          {new Intl.DateTimeFormat("fr-CA", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(brief.generatedAt))}
        </p>
      </div>

      <p className="mt-3 text-sm leading-6 text-amber-100/90">{brief.focusLine}</p>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <BriefCard
          title="Agenda"
          icon={CalendarClock}
          count={brief.agenda.upcomingCount}
          isEmpty={brief.agenda.items.length === 0}
          emptyLabel="Aucun rendez-vous planifié sur les 14 prochains jours."
          items={brief.agenda.items.map((event) => (
            <li key={event.id} className="rounded-lg border border-neutral-800 bg-neutral-950/70 px-3 py-2">
              <p className="font-medium text-white">{event.title}</p>
              <p className="mt-1 text-xs text-neutral-400">{formatEventWhen(event.dateISO, event.startTime)}</p>
            </li>
          ))}
        />

        <BriefCard
          title="Leads Suivia"
          icon={UsersRound}
          count={brief.leads.newCount}
          badgeLabel={brief.leads.newCount > 0 ? "nouveaux" : undefined}
          isEmpty={brief.leads.items.length === 0}
          emptyLabel="Aucun lead récent pour le moment."
          items={brief.leads.items.map((lead) => (
            <li key={lead.id} className="rounded-lg border border-neutral-800 bg-neutral-950/70 px-3 py-2">
              <p className="font-medium text-white">{lead.name}</p>
              <p className="mt-1 text-xs text-neutral-400">
                {lead.company ? `${lead.company} · ` : ""}
                {formatLeadWhen(lead.createdAt)} · {lead.status}
              </p>
            </li>
          ))}
        />

        <BriefCard
          title="Documents"
          icon={FileText}
          count={brief.documents.totalCount}
          isEmpty={brief.documents.totalCount === 0}
          emptyLabel="Le coffre est vide pour l'instant."
          footer={
            brief.documents.totalCount > 0 ? (
              <Link
                href={"/dashboard/documents" as Route}
                className="mt-4 inline-flex text-sm font-semibold text-amber-300 hover:text-amber-200"
              >
                Ouvrir le coffre
              </Link>
            ) : undefined
          }
          items={
            <>
              {brief.documents.recentFilenames.map((filename) => (
                <li
                  key={filename}
                  className="rounded-lg border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-sm text-neutral-200"
                >
                  {filename}
                </li>
              ))}
              {hatSummary ? (
                <li className="list-none px-0 py-0">
                  <p className="text-xs text-neutral-500">{hatSummary}</p>
                </li>
              ) : null}
            </>
          }
        />
      </div>
    </section>
  );
}
