import { CockpitShell } from "@/features/cockpit/components/cockpit-shell";
import { LedgerActivity } from "@/features/hq/components/ledger-activity";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";
import { requireOwnerAccess } from "@/server/auth/owner";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const access = await requireOwnerAccess("/hq/activity");
  if (access.status === "forbidden") return <OwnerAccessDenied email={access.user.email} />;
  return <CockpitShell active="activity" crumb="Journal">
    <h1 className="text-2xl font-semibold text-white">Journal des actions</h1>
    <p className="text-sm text-neutral-400">Événements récents, sources et liens vers les missions. Cette vue ne déclenche aucune action.</p>
    <LedgerActivity />
  </CockpitShell>;
}
