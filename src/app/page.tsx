import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, Bot, CalendarCheck, FileText, LockKeyhole, Mail, ShieldCheck, Sparkles, UsersRound } from "lucide-react";

const pillars = [
  {
    icon: Bot,
    title: "Agent relationnel",
    text: "Joris pilote les demandes, les bookings et les décisions dans le bon contexte.",
  },
  {
    icon: CalendarCheck,
    title: "Vie + travail",
    text: "Rendez-vous personnels, suivis professionnels et priorités restent dans un espace isolé.",
  },
  {
    icon: FileText,
    title: "Mémoire privée",
    text: "Décisions, SOPs et contexte utilisateur restent attachés au workspace actif.",
  },
  {
    icon: UsersRound,
    title: "Modes métier",
    text: "Immobilier, conseiller financier et autres niches deviennent des couches spécialisées.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-5 sm:gap-8 md:px-8 md:py-10">
      <header className="grid min-h-[72vh] gap-6 md:grid-cols-[1.15fr_0.85fr] md:items-center">
        <section className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
            <Sparkles className="h-3.5 w-3.5" />
            Oria · Michael HQ
          </div>
          <h1 className="mt-4 text-[2.55rem] font-bold leading-[0.98] text-white sm:text-5xl md:text-6xl">
            Un assistant personnel, professionnel et extensible par métier.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-neutral-400 md:text-lg">
            Oria est le système central. Michael HQ est le premier workspace privé : Joris, agenda, mémoire et
            modes métier, sans mélange de contexte. Le cockpit opérationnel s&apos;ouvre après connexion propriétaire.
          </p>
          <nav className="mt-6 flex flex-col gap-3 sm:flex-row" aria-label="Accès Michael HQ">
            <Link
              href={"/hq" as Route}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-500 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-amber-400"
            >
              Ouvrir Michael HQ
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link
              href={"/login?next=%2Fhq" as Route}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-neutral-700 px-4 text-sm font-semibold text-neutral-200 transition hover:border-neutral-500 hover:bg-neutral-900"
            >
              Connexion propriétaire
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

        <aside className="rounded-3xl border border-neutral-800 bg-neutral-950/85 p-5 shadow-2xl shadow-amber-950/10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-400">Workspace privé</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Michael HQ reste isolé.</h2>
              <p className="mt-3 text-sm leading-6 text-neutral-400">
                La page publique présente Oria. Les modules opérationnels passent par `/hq`, protégé côté serveur
                avec le guard propriétaire.
              </p>
            </div>
            <LockKeyhole className="h-6 w-6 shrink-0 text-amber-300" />
          </div>
          <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
              <p className="text-sm leading-6 text-emerald-100">
                Accès post-login recommandé: <span className="font-semibold">/hq</span>.
              </p>
            </div>
          </div>
        </aside>
      </header>

      <section className="grid gap-4 md:grid-cols-4" aria-label="Modules privés de Michael HQ">
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
