import type { Route } from "next";
import Link from "next/link";
import { ArrowLeft, Zap } from "lucide-react";
import { SkillCard } from "@/features/skills/components/skill-card";
import { CATEGORY_LABELS, skillsCatalog } from "@/features/skills/seed";
import type { SkillCategory } from "@/features/skills/types";
import { requireOwnerAccess } from "@/server/auth/owner";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";

export const dynamic = "force-dynamic";

const CATEGORY_ORDER: SkillCategory[] = [
  "money",
  "sales",
  "marketing",
  "briefings",
  "customer-ops",
  "legal-admin",
  "dev-code",
  "automation",
];

export default async function SkillsPage() {
  const access = await requireOwnerAccess("/hq/skills");

  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  const active = skillsCatalog.filter((s) => s.status === "active").length;
  const partial = skillsCatalog.filter((s) => s.status === "partial").length;
  const planned = skillsCatalog.filter((s) => s.status === "planned").length;

  const byCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    label: CATEGORY_LABELS[cat],
    skills: skillsCatalog.filter((s) => s.category === cat),
  })).filter(({ skills }) => skills.length > 0);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 md:px-8 md:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href={"/hq" as Route}
            className="inline-flex items-center gap-1.5 text-xs text-neutral-500 transition hover:text-neutral-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Michael HQ
          </Link>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-300">
            <Zap className="h-3.5 w-3.5" />
            Skills Catalog
          </div>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-white sm:text-4xl">
            Catalogue des skills
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
            Toutes les capacités disponibles pour les agents Oria. Chaque skill a un statut, un
            niveau d&apos;autonomie et des contraintes de sortie explicites.
          </p>
        </div>

        <aside className="shrink-0 rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 sm:w-48">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
            Résumé
          </p>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-emerald-300">Actifs</span>
              <span className="tabular-nums text-white">{active}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-amber-300">Partiels</span>
              <span className="tabular-nums text-white">{partial}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-neutral-500">Planifiés</span>
              <span className="tabular-nums text-white">{planned}</span>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-neutral-800 pt-2">
              <span className="text-neutral-400">Total</span>
              <span className="tabular-nums text-white">{skillsCatalog.length}</span>
            </div>
          </div>
        </aside>
      </header>

      {byCategory.map(({ cat, label, skills }) => (
        <section key={cat}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
            {label}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {skills.map((skill) => (
              <SkillCard key={skill.id} skill={skill} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
