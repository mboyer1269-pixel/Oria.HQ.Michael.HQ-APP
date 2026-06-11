import type { Route } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CalendarCheck,
  FileText,
  Lock,
  Mail,
  ScrollText,
  Sparkles,
  UsersRound,
} from "lucide-react";

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

const guarantees = [
  { icon: Lock, text: "Aucune action sensible sans approbation humaine" },
  { icon: ScrollText, text: "Chaque exécution laisse une preuve au ledger immuable" },
  { icon: Sparkles, text: "Les agents préparent — vous décidez" },
];

export default function Home() {
  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 overflow-x-clip px-4 py-5 sm:gap-8 md:px-8 md:py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-amber-500/[0.07] blur-3xl" />
        <div className="absolute right-[-10rem] top-64 h-80 w-80 rounded-full bg-emerald-500/[0.05] blur-3xl" />
      </div>

      <header className="flex min-h-[72vh] flex-col justify-center gap-6">
        <section className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300 shadow-[0_0_24px_-8px_rgba(251,191,36,0.5)]">
            <Sparkles className="h-3.5 w-3.5" />
            Oria HQ
          </div>
          <h1 className="mt-4 text-[2.55rem] font-bold leading-[0.98] text-white sm:text-5xl md:text-6xl">
            Un cockpit privé pour orchestrer vos agents,{" "}
            <span className="bg-gradient-to-r from-amber-300 via-amber-200 to-emerald-300 bg-clip-text text-transparent">
              sous votre contrôle.
            </span>
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-neutral-400 md:text-lg">
            Oria HQ réunit vos agents, votre agenda et votre mémoire de travail dans un espace privé et isolé. Les
            actions sensibles sont proposées, puis approuvées avant exécution, et restent traçables.
          </p>
          <nav className="mt-6 flex flex-col gap-3 sm:flex-row" aria-label="Accès au cockpit Oria HQ">
            <Link
              href={"/hq" as Route}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-500 px-4 text-sm font-semibold text-neutral-950 shadow-[0_0_32px_-8px_rgba(251,191,36,0.55)] transition hover:bg-amber-400 hover:shadow-[0_0_40px_-8px_rgba(251,191,36,0.7)]"
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

          <ul className="mt-8 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6" aria-label="Garanties de gouvernance">
            {guarantees.map((guarantee) => {
              const Icon = guarantee.icon;
              return (
                <li key={guarantee.text} className="inline-flex items-center gap-2 text-xs text-neutral-500">
                  <Icon className="h-3.5 w-3.5 text-emerald-400/80" />
                  {guarantee.text}
                </li>
              );
            })}
          </ul>
        </section>
      </header>

      <section className="grid gap-4 md:grid-cols-4" aria-label="Capacités du cockpit Oria HQ">
        {pillars.map((pillar) => {
          const Icon = pillar.icon;
          return (
            <article
              key={pillar.title}
              className="group rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4 transition duration-300 hover:-translate-y-0.5 hover:border-amber-500/25 hover:bg-neutral-950 hover:shadow-[0_8px_40px_-16px_rgba(251,191,36,0.25)]"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/15 bg-amber-500/[0.06] transition-transform duration-300 group-hover:scale-105">
                <Icon className="h-5 w-5 text-amber-400" />
              </span>
              <h2 className="mt-4 font-semibold text-white">{pillar.title}</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-400">{pillar.text}</p>
            </article>
          );
        })}
      </section>

      <footer className="border-t border-neutral-900 py-6 text-center text-xs text-neutral-600">
        Oria HQ — vos agents agissent dans des corridors approuvés. Rien ne part sans votre clic.
      </footer>
    </main>
  );
}
