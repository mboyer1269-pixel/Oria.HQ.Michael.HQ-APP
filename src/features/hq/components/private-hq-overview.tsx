import type { Route } from "next";
import Link from "next/link";
import {
  BookOpenCheck,
  CalendarClock,
  FileText,
  KeyRound,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

const hqZones = [
  {
    title: "Joris Core",
    text: "Agent relationnel par défaut, prêt à être personnalisé sans changer le moteur.",
    href: "#command-center",
    cta: "Parler à Joris",
    status: "Actif",
    icon: BookOpenCheck,
  },
  {
    title: "Command Center",
    text: "Le point d'entrée pour parler à Joris, tester une commande et voir le résultat clair.",
    href: "#command-center",
    cta: "Parler à Joris",
    status: "Prêt",
    icon: MessageSquareText,
  },
  {
    title: "Agenda",
    text: "Les prochains bookings apparaissent ici dès que Joris les ajoute au calendrier.",
    href: "#agenda-panel",
    cta: "Voir les bookings",
    status: "Branché",
    icon: CalendarClock,
  },
  {
    title: "Modes métier",
    text: "Personnel, professionnel, conseiller financier et immobilier seront séparés par contexte.",
    cta: "À venir",
    status: "À venir",
    icon: UsersRound,
  },
  {
    title: "Documents",
    text: "Le coffre privé pour notes, décisions, SOPs et documents utiles au workspace actif.",
    href: "/dashboard/documents",
    cta: "Ouvrir documents",
    status: "Privé",
    icon: FileText,
  },
  {
    title: "Permissions",
    text: "L'écran dédié aux règles d'autonomie sera ajouté après le shell privé.",
    cta: "À venir",
    status: "À venir",
    icon: KeyRound,
  },
];

const permissionNotes = [
  "Actions internes simples: Joris peut préparer dans le workspace actif.",
  "Bookings personnels: permis quand c'est clair, réversible et journalisé.",
  "Messages externes, dépenses, conformité ou changements sensibles: confirmation avant action.",
];

export function PrivateHqOverview() {
  return (
    <section id="hq-prive" className="scroll-mt-6 rounded-lg border border-neutral-800 bg-neutral-950/80 p-4 md:p-6">
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="min-w-0">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
              <LockKeyhole className="h-3.5 w-3.5" />
              Michael HQ
            </div>
            <h2 className="mt-4 text-2xl font-semibold text-white md:text-3xl">Le premier workspace sur Oria.</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-400">
              Un espace propriétaire pour piloter Joris, tes bookings, les documents, les permissions et les futurs
              modes métier sans mélanger les responsabilités.
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <a
              href="#command-center"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-500 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-amber-400"
            >
              Ouvrir Command Center
            </a>
            <Link
              href={"/dashboard/documents" as Route}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-neutral-700 px-4 text-sm font-semibold text-neutral-200 transition hover:border-neutral-500 hover:bg-neutral-900"
            >
              Documents
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {hqZones.map((zone) => {
            const Icon = zone.icon;

            return (
              <article key={zone.title} className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-950 text-amber-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="rounded-md border border-neutral-700 px-2 py-1 text-[11px] text-neutral-400">
                    {zone.status}
                  </span>
                </div>
                <h3 className="mt-4 font-semibold text-white">{zone.title}</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-400">{zone.text}</p>
                {"href" in zone && zone.href ? (
                  zone.href.startsWith("/") ? (
                    <Link
                      href={zone.href as Route}
                      className="mt-4 inline-flex text-sm font-semibold text-amber-300 hover:text-amber-200"
                    >
                      {zone.cta}
                    </Link>
                  ) : (
                    <a
                      href={zone.href}
                      className="mt-4 inline-flex text-sm font-semibold text-amber-300 hover:text-amber-200"
                    >
                      {zone.cta}
                    </a>
                  )
                ) : (
                  <span className="mt-4 inline-flex text-sm font-semibold text-neutral-600" aria-disabled="true">
                    {zone.cta}
                  </span>
                )}
              </article>
            );
          })}
        </div>
      </div>

      <div
        id="permissions-autonomie"
        className="mt-5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4"
      >
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <div>
            <h3 className="font-semibold text-emerald-50">Permissions, contexte et autonomie de Joris</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {permissionNotes.map((note) => (
                <p key={note} className="rounded-lg border border-emerald-500/15 bg-neutral-950/50 p-3 text-sm leading-6 text-emerald-100">
                  {note}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
