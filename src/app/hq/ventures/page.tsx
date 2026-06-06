import type { Route } from "next";
import Link from "next/link";
import { Banknote, Eye, Rocket, ShieldCheck } from "lucide-react";
import { getDefaultWorkspace } from "@/core/workspaces/registry";
import { AgentVentureWorkbenchWithForm } from "@/features/ventures/components/agent-venture-workbench-with-form";
import { VentureCommandCenterClient } from "@/features/ventures/components/venture-command-center-client";
import {
  getDefaultActiveValidationSlotLimit,
  getDefaultVisibleCandidateLimit,
} from "@/features/ventures/lifecycle";
import { ventureSeedCards } from "@/features/ventures/seed";
import { ventureSuggestionSeed } from "@/features/ventures/suggestion-seed";
import type { VentureCard } from "@/features/ventures/types";
import {
  archiveVentureAction,
  killVentureAction,
  promoteVentureAction,
  scoreVentureAction,
  updateVentureDetailsAction,
} from "@/features/ventures/venture-lifecycle-action";
import { saveVentureDraftAction } from "@/features/ventures/venture-save-action";
import type { VenturePersistenceMode } from "@/features/ventures/venture-save-types";
import { requireOwnerAccess } from "@/server/auth/owner";
import {
  getVenturePersistenceMode,
  listVenturesForWorkspace,
} from "@/server/ventures/venture-repository";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";
import {
  HqMetric,
  HqPageHeader,
  HqPageShell,
  HqSummaryRail,
  HqWidget,
} from "@/features/hq/components/hq-widget-system";

export const dynamic = "force-dynamic";

export default async function VenturesPage() {
  const access = await requireOwnerAccess("/hq/ventures");

  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  const candidateLimit = getDefaultVisibleCandidateLimit();
  const validationSlotLimit = getDefaultActiveValidationSlotLimit();

  // Load saved ventures through the repository, scoped to the owner's workspace.
  // A repository failure surfaces as a clear error state in the client rather
  // than pretending success.
  const workspaceId = getDefaultWorkspace({ ownerUserId: access.user.id }).id;
  let savedVentures: VentureCard[] = [];
  let savedStorageMode: VenturePersistenceMode | null = null;
  let loadError = false;
  try {
    savedVentures = await listVenturesForWorkspace(workspaceId);
    savedStorageMode = getVenturePersistenceMode();
  } catch {
    loadError = true;
  }

  return (
    <HqPageShell>
      <HqPageHeader
        backHref={"/hq" as Route}
        eyebrow="Venture Engine"
        icon={Rocket}
        tone="amber"
        title="Venture Engine"
        description={
          <>
            Générer, scorer, tester et opérer des ventures rentables sous contrôle CEO.
          <Link
            href={"/hq/ventures/cash-actions" as Route}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20"
          >
            <Banknote className="h-4 w-4" aria-hidden="true" />
            Cash Action Review — préparer & capturer le cash
          </Link>
          </>
        }
      >
        <HqSummaryRail>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-[11px] font-medium text-neutral-300">
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            Lecture seule
          </span>
          <p className="mt-3 text-xs leading-5 text-neutral-500">
            Aucune écriture, aucune dépense, aucun envoi déclenché depuis cet écran.
          </p>
          <div className="mt-3 grid gap-2">
            <HqMetric label="Candidats visibles" value={candidateLimit} tone="amber" />
            <HqMetric label="Validations actives" value={validationSlotLimit} tone="emerald" />
          </div>
        </HqSummaryRail>
      </HqPageHeader>

      <HqWidget title="Command Center" eyebrow="Venture pipeline" icon={Rocket}>
        <VentureCommandCenterClient
          seedCards={ventureSeedCards}
          suggestions={ventureSuggestionSeed}
          savedVentures={savedVentures}
          savedStorageMode={savedStorageMode}
          loadError={loadError}
          onSaveDraft={saveVentureDraftAction}
          onUpdateDetails={updateVentureDetailsAction}
          onArchive={archiveVentureAction}
          onKill={killVentureAction}
          onPromote={promoteVentureAction}
          onScore={scoreVentureAction}
        />
      </HqWidget>

      <HqWidget title="Agent workbench" eyebrow="Assisted prep" icon={Rocket}>
        <AgentVentureWorkbenchWithForm />
      </HqWidget>

      <HqWidget title="Garde-fous appliqués par défaut" eyebrow="Doctrine Venture Engine" icon={ShieldCheck}>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          <li className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 text-sm leading-6 text-neutral-300">
            <span className="font-semibold text-white">{candidateLimit} candidats visibles</span> —
            la capacité cognitive du CEO reste protégée.
          </li>
          <li className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 text-sm leading-6 text-neutral-300">
            <span className="font-semibold text-white">{validationSlotLimit} validations actives</span> —
            la bande passante de validation est volontairement étroite.
          </li>
          <li className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 text-sm leading-6 text-neutral-300">
            <span className="font-semibold text-white">Autonomie sécuritaire par domaine</span> —
            la recherche peut être autonome, les domaines risqués restent sous garde.
          </li>
          <li className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 text-sm leading-6 text-neutral-300">
            <span className="font-semibold text-white">
              Aucune action dangereuse sans approbation
            </span>{" "}
            — dépense, publication, contact externe et changement de données restent bloqués.
          </li>
        </ul>
      </HqWidget>
    </HqPageShell>
  );
}
