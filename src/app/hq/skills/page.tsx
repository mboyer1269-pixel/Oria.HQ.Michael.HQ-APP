import type { Route } from "next";
import { Zap } from "lucide-react";
import { CockpitShell } from "@/features/cockpit/components/cockpit-shell";
import {
  HqMetric,
  HqPageHeader,
  HqSummaryRail,
  HqWidget,
} from "@/features/hq/components/hq-widget-system";
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
    <CockpitShell active="skills" crumb="Skills">
      <HqPageHeader
        backHref={"/hq" as Route}
        eyebrow="Skills Catalog"
        icon={Zap}
        tone="sky"
        title="Catalogue des skills"
        description={
          <>
            Toutes les capacités disponibles pour les agents Oria. Chaque skill a un statut, un
            niveau d&apos;autonomie et des contraintes de sortie explicites.
          </>
        }
      >
        <HqSummaryRail>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
            Résumé
          </p>
          <div className="mt-3 grid gap-2">
            <HqMetric label="Actifs" value={active} tone="emerald" />
            <HqMetric label="Partiels" value={partial} tone="amber" />
            <HqMetric label="Planifiés" value={planned} />
            <HqMetric label="Total" value={skillsCatalog.length} tone="sky" />
          </div>
        </HqSummaryRail>
      </HqPageHeader>

      {byCategory.map(({ cat, label, skills }) => (
        <HqWidget key={cat} title={label} eyebrow="Skill group" icon={Zap}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {skills.map((skill) => (
              <SkillCard key={skill.id} skill={skill} />
            ))}
          </div>
        </HqWidget>
      ))}
    </CockpitShell>
  );
}
