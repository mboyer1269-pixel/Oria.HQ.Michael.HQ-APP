import type { Route } from "next";
import { StickyNote } from "lucide-react";
import { requireOwnerAccess } from "@/server/auth/owner";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";
import { CockpitShell } from "@/features/cockpit/components/cockpit-shell";
import { HqPageHeader, HqWidget } from "@/features/hq/components/hq-widget-system";
import { NotesWorkspace } from "@/features/notes/components/notes-workspace";

export const dynamic = "force-dynamic";

// /hq/notes — CEO scratchpad. Autosave, pin, soft-archive. In-memory v1.

export default async function NotesPage() {
  const access = await requireOwnerAccess("/hq/notes");
  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  return (
    <CockpitShell active="notes" crumb="Notes">
      <HqPageHeader
        backHref={"/hq" as Route}
        eyebrow="Notes CEO"
        icon={StickyNote}
        tone="violet"
        title="Capture maintenant. Structure plus tard."
        description="Ton scratchpad exécutif — autosave, épinglage, archivage doux. Rien ne se perd."
      />
      <HqWidget>
        <NotesWorkspace />
      </HqWidget>
    </CockpitShell>
  );
}
