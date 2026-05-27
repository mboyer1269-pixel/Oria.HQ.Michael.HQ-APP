import type { Route } from "next";
import Link from "next/link";
import {
  BadgeDollarSign,
  Bot,
  CalendarCheck,
  CheckCircle2,
  FileText,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { AgendaPanel } from "@/features/hq/components/agenda-panel";
import { CommandCenter } from "@/features/hq/components/command-center";
import { ModuleCard } from "@/features/hq/components/module-card";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";
import { CeoBriefSection } from "@/features/hq/components/ceo-brief-section";
import { LedgerActivity } from "@/features/hq/components/ledger-activity";
import { OperatorSnapshot } from "@/features/hq/components/operator-snapshot";
import { PrivateHqOverview } from "@/features/hq/components/private-hq-overview";
import { billionaireBoard, hqModules, modelProfiles, permissionRules } from "@/features/hq/seed";
import { signOutAction } from "@/server/auth/actions";
import { requireOwnerAccess } from "@/server/auth/owner";

export const dynamic = "force-dynamic";

const privateLinks = [
  {
    label: "CEO Brief",
    href: "#ceo-brief",
  },
  {
    label: "Command Center",
    href: "#command-center",
  },
  {
    label: "Operator Snapshot",
    href: "#operator-snapshot",
  },
  {
    label: "Ledger Activity",
    href: "#ledger-activity",
  },
  {
    label: "Missions",
    href: "/hq/missions",
  },
  {
    label: "Agents",
    href: "/hq/agents",
  },
  {
    label: "Skills",
    href: "/hq/skills",
  },
  {
    label: "Runtime",
    href: "/hq/runtime",
  },
  {
    label: "Memory",
    href: "/hq/memory",
  },
  {
    label: "Prochains bookings",
    href: "#agenda-panel",
  },
  {
    label: "Documents",
    href: "/dashboard/documents",
  },
  {
    label: "Modes métier",
    href: "#modes-metier",
  },
];

const comingSoonModules = [
  {
    title: "Mode conseiller financier",
    text: "Préparation de rendez-vous, suivis clients, contenu éducatif et garde-fous de conformité pour Eric.",
  },
  {
    title: "Mode immobilier",
    text: "Listings, suivis acheteurs/vendeurs, contenu local et workflow courtier comme pack métier.",
  },
];

export default async function HqPage() {
  const access = await requireOwnerAccess("/hq");

  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:gap-8 md:px-8 md:py-10">
      <header className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
            <Sparkles className="h-3.5 w-3.5" />
            Oria · Michael HQ
          </div>
          <h1 className="mt-4 text-[2.55rem] font-bold leading-[0.98] text-white sm:text-5xl md:text-6xl">
            Ton workspace privé, sans mélange de contexte.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-neutral-400 md:text-lg">
            Michael HQ valide le coeur d&apos;Oria: Joris, agenda, documents, permissions, briefs et premiers modes
            métier avant de vendre le système à des courtiers et conseillers financiers.
          </p>
          <nav className="mt-5 flex flex-col gap-3 sm:flex-row" aria-label="Navigation privée Michael HQ">
            {privateLinks.map((link, index) => {
              const className =
                index === 0
                  ? "inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-500 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-amber-400"
                  : "inline-flex min-h-11 items-center justify-center rounded-lg border border-neutral-700 px-4 text-sm font-semibold text-neutral-200 transition hover:border-neutral-500 hover:bg-neutral-900";

              return link.href.startsWith("/") ? (
                <Link key={link.href} href={link.href as Route} className={className}>
                  {link.label}
                </Link>
              ) : (
                <a key={link.href} href={link.href} className={className}>
                  {link.label}
                </a>
              );
            })}
          </nav>
        </div>

        <aside className="w-full rounded-3xl border border-neutral-800 bg-neutral-950/85 p-4 md:max-w-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">Statut</p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center gap-2 text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  Workspace Michael HQ actif
                </div>
                <div className="flex items-center gap-2 text-amber-300">
                  <Bot className="h-4 w-4" />
                  Joris branché au contexte actif
                </div>
                <div className="flex items-center gap-2 text-neutral-400">
                  <CalendarCheck className="h-4 w-4" />
                  Modes métier en préparation
                </div>
              </div>
            </div>
            <LockKeyhole className="h-5 w-5 shrink-0 text-amber-300" />
          </div>
          <form action={signOutAction} className="mt-5">
            <button
              type="submit"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-neutral-700 px-4 text-sm font-bold text-neutral-200 transition hover:border-neutral-500 hover:bg-neutral-900"
            >
              <LogOut className="h-4 w-4" />
              Déconnexion
            </button>
          </form>
        </aside>
      </header>

      <PrivateHqOverview />

      <OperatorSnapshot />

      <LedgerActivity />

      <CeoBriefSection />

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <CommandCenter />
        <AgendaPanel />
      </section>

      <section id="modes-metier" className="grid scroll-mt-6 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-neutral-800 bg-neutral-950/70 p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-400">Architecture</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Core et modes métier</h2>
            </div>
            <ShieldCheck className="h-6 w-6 text-emerald-400" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {hqModules.map((module) => (
              <ModuleCard key={module.id} module={module} />
            ))}
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded-3xl border border-neutral-800 bg-neutral-950/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-400">Documents</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Coffre privé</h2>
            <p className="mt-3 text-sm leading-6 text-neutral-400">
              Notes, décisions, SOPs et documents utiles à Joris restent derrière le même accès propriétaire.
            </p>
            <Link
              href={"/dashboard/documents" as Route}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-amber-400"
            >
              <FileText className="h-4 w-4" />
              Ouvrir Documents
            </Link>
          </section>

          <section className="rounded-3xl border border-neutral-800 bg-neutral-950/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">À venir</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Packs vendables</h2>
            <div className="mt-4 space-y-3">
              {comingSoonModules.map((module) => (
                <article key={module.title} className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-white">{module.title}</h3>
                    <span className="rounded-full border border-neutral-700 px-2 py-1 text-[11px] text-neutral-500">
                      à venir
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-neutral-500">{module.text}</p>
                  <button
                    type="button"
                    disabled
                    className="mt-4 inline-flex min-h-10 w-full cursor-not-allowed items-center justify-center rounded-lg border border-neutral-800 px-3 text-sm font-semibold text-neutral-600"
                  >
                    Pas encore disponible
                  </button>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <section className="rounded-3xl border border-neutral-800 bg-neutral-950/70 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-400">AI Router</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Coût vs intelligence</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {modelProfiles.map((model) => (
              <div key={model.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-white">{model.label}</p>
                  <span className="rounded-full bg-neutral-800 px-2 py-1 text-[11px] text-neutral-400">
                    {model.provider}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-neutral-500">{model.defaultUse}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-neutral-800 bg-neutral-950/70 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-400">Permissions</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Autonomie contrôlée</h2>
          <div className="mt-4 space-y-3">
            {permissionRules.map((rule) => (
              <div key={rule.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-3">
                <p className="text-sm font-medium text-white">{rule.action}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  Niveau {rule.level}/5 · {rule.requiresConfirmation ? "confirmation" : "sans friction"}
                </p>
              </div>
            ))}
          </div>
        </section>
      </section>

      <section className="rounded-3xl border border-neutral-800 bg-neutral-950/70 p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-400">Billion Dollar Board</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Intelligence stratégique intégrée</h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
            <BadgeDollarSign className="h-3.5 w-3.5" />
            Verdict final par Joris
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {billionaireBoard.map((figure) => (
            <article key={figure.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
              <h3 className="font-semibold text-white">{figure.name}</h3>
              <p className="mt-1 text-xs leading-5 text-neutral-500">{figure.domain}</p>
              <p className="mt-3 text-xs text-amber-300">{figure.frameworks.slice(0, 2).join(" · ")}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
