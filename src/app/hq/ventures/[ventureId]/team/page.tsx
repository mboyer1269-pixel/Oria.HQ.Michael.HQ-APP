import type { Route } from "next";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { getDefaultWorkspace } from "@/core/workspaces/registry";
import { CockpitShell } from "@/features/cockpit/components/cockpit-shell";
import { readEmployeesAction } from "@/features/employees/actions";
import { EmployeeTeam } from "@/features/employees/components/employee-team";
import { HqPageHeader } from "@/features/hq/components/hq-widget-system";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";
import { requireOwnerAccess } from "@/server/auth/owner";
import { getVentureById } from "@/server/ventures/venture-repository";

export const dynamic = "force-dynamic";

export default async function VentureTeamPage({ params }: { params: Promise<{ ventureId: string }> }) {
  const access = await requireOwnerAccess("/hq/ventures");
  if (access.status === "forbidden") return <OwnerAccessDenied email={access.user.email} />;
  const { ventureId } = await params;
  const workspace = getDefaultWorkspace({ ownerUserId: access.user.id });
  let venture;
  try { venture = await getVentureById(workspace.id, ventureId); }
  catch { return <CockpitShell active="ventures" crumb="Mon équipe"><p role="alert" className="rounded-xl border border-neutral-700 p-5 text-neutral-200">Business indisponible. Son équipe ne peut pas être chargée.</p></CockpitShell>; }
  if (!venture) notFound();
  const initial = await readEmployeesAction(ventureId);
  return <CockpitShell active="ventures" crumb="Mon équipe">
    <HqPageHeader backHref={"/hq/ventures" as Route} backLabel="Business" eyebrow="Mon équipe" icon={Users} title={venture.name} description="Définir les employés IA proposés pour ce business, leur spécialité et leur mandat. Les profils restent séparés du registre d’exécution." />
    <EmployeeTeam key={`${access.user.id}:${workspace.id}:${venture.id}`} ventureId={venture.id} recoveryScope={{ ownerId: access.user.id, workspaceId: workspace.id }} initial={initial} />
  </CockpitShell>;
}
