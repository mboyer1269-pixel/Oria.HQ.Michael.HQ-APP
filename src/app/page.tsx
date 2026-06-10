import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, Bot, CalendarCheck, FileText, Mail, Sparkles, UsersRound } from "lucide-react";

const pillars = [
  {
    icon: Bot,
    title: "Agents orchestrés",
    text: "Joris et vos agents prennent en charge les demandes, les bookings et les décisions dans le bon contexte.",
  },
  {
    icon: CalendarCheck,
    title: "Vie + travail",
    text: "Rendez-vous personnels, suivis professionnels et priorités restent dans un espace isolé.",
  },
  {
    icon: FileText,
    title: "Mémoire auditable",
    text: "Décisions, SOPs et contexte restent attachés au workspace actif et traçables.",
  },
  {
    icon: UsersRound,
    title: "Modes métier",
    text: "Immobilier, conseil financier et autres niches deviennent des couches spécialisées.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-5 sm:gap-8 md:px-8 md:py-10">
      <header className="flex min-h-[72vh] flex-col justify-center gap-6">
        <section className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
            <Sparkles className="h-3.5 w-3.5" />
            Oria HQ
          </div>
          <h1 className="mt-4 text-[2.55rem] font-bold leading-[0.98] text-white sm:text-5xl md:text-6xl">
            Un cockpit privé pour orchestrer vos agents, sous votre contrôle.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-neutral-400 md:text-lg">
            Oria HQ réunit vos agents, votre agenda et votre mémoire de travail dans un espace privé et isolé. Les
            actions sensibles sont proposées, puis approuvées avant exécution, et restent traçables.
          </p>
          <nav className="mt-6 flex flex-col gap-3 sm:flex-row" aria-label="Accès au cockpit Oria HQ">
            <Link
              href={"/hq" as Route}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-500 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-amber-400"
            >
              Ouvrir le cockpit
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link
              href={"/contact" as Route}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-emerald-500/30 px-4 text-sm font-semibold text-emerald-300 transition hover:border-emerald-400/50 hover:bg-emerald-500/10"
            >
              <Mail className="h-4 w-4" />
              Contact
            </Link>
          </nav>
        </section>
      </header>

      <section className="grid gap-4 md:grid-cols-4" aria-label="Capacités du cockpit Oria HQ">
        {pillars.map((pillar) => {
          const Icon = pillar.icon;
          return (
            <article key={pillar.title} className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
              <Icon className="h-6 w-6 text-amber-400" />
              <h2 className="mt-4 font-semibold text-white">{pillar.title}</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-400">{pillar.text}</p>
            </article>
          );
        })}
      </section>
    </main>
  );
}
