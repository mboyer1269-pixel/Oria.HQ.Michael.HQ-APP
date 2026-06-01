import type { Route } from "next";
import Link from "next/link";
import { ArrowLeft, Eye, Rocket } from "lucide-react";
import { getDefaultWorkspace } from "@/core/workspaces/registry";
import { VentureCommandCenterClient } from "@/features/ventures/components/venture-command-center-client";
import { VentureSummaryPanel } from "@/features/ventures/components/venture-summary-panel";
import {
  getDefaultActiveValidationSlotLimit,
  getDefaultVisibleCandidateLimit,
} from "@/features/ventures/lifecycle";
import { ventureSeedCards } from "@/features/ventures/seed";
import type { VentureCard } from "@/features/ventures/types";
import { saveVentureDraftAction } from "@/features/ventures/venture-save-action";
import type { VenturePersistenceMode } from "@/features/ventures/venture-save-types";
import { requireOwnerAccess } from "@/server/auth/owner";
import {
  getVenturePersistenceMode,
  listVenturesForWorkspace,
} from "@/server/ventures/venture-repository";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";

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
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
            <Rocket className="h-3.5 w-3.5" />
            Venture Engine
          </div>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-white sm:text-4xl">
            Venture Engine
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
            Générer, scorer, tester et opérer des ventures rentables sous contrôle CEO.
          </p>
        </div>

        <aside className="shrink-0 self-start rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 sm:w-56">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-[11px] font-medium text-neutral-300">
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            Lecture seule
          </span>
          <p className="mt-3 text-xs leading-5 text-neutral-500">
            Aucune écriture, aucune dépense, aucun envoi déclenché depuis cet écran.
          </p>
        </aside>
      </header>

      <VentureSummaryPanel cards={ventureSeedCards} />

      <VentureCommandCenterClient
        seedCards={ventureSeedCards}
        savedVentures={savedVentures}
        savedStorageMode={savedStorageMode}
        loadError={loadError}
        onSaveDraft={saveVentureDraftAction}
      />

      <section className="rounded-3xl border border-neutral-800 bg-neutral-950/70 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-400">
          Doctrine Venture Engine
        </p>
        <h2 className="mt-2 text-xl font-semibold text-white">
          Garde-fous appliqués par défaut
        </h2>
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
      </section>
    </main>
  );
}
