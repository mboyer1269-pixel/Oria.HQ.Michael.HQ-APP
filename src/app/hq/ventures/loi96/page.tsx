import type { Route } from "next";
import { Scale } from "lucide-react";
import { requireOwnerAccess } from "@/server/auth/owner";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";
import { CockpitShell } from "@/features/cockpit/components/cockpit-shell";
import { HqPageHeader, HqWidget } from "@/features/hq/components/hq-widget-system";
import { Loi96PipelineBoard } from "@/features/ventures/components/loi96-pipeline-board";

export const dynamic = "force-dynamic";

// /hq/ventures/loi96 — pipeline de la venture Conformité Loi 96 (P1, Le Pont).
// Cible → Préparer (Relay rédige, file Send Desk) → clic CEO → envoyé →
// réponse → appel → signé. Source de vérité : ventures/loi96/pipeline.json.

export default async function Loi96VenturePage() {
  const access = await requireOwnerAccess("/hq/ventures/loi96");
  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  return (
    <CockpitShell active="ventures" crumb="Loi 96">
      <HqPageHeader
        backHref={"/hq/ventures" as Route}
        backLabel="Ventures"
        eyebrow="Venture — Conformité Loi 96"
        icon={Scale}
        tone="emerald"
        title="Le pipeline qui paie."
        description="Chaque cible suit le même chemin : Préparer → ton clic au Send Desk → réponse en moins de 2 h → appel → signé. Objectif : premier forfait avant le 9 juillet."
      />
      <HqWidget title="Cibles" eyebrow="Pipeline file-backed — versionné" icon={Scale} tone="emerald">
        <Loi96PipelineBoard />
      </HqWidget>
    </CockpitShell>
  );
}
