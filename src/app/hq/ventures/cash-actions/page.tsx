import type { Route } from "next";
import Link from "next/link";
import { ArrowLeft, Banknote, Eye } from "lucide-react";
import { CashActionReviewClient } from "@/features/ventures/components/cash-action-review-client";
import { buildCashActionPacketsFromItems } from "@/features/ventures/cash-action-packet-generator";
import { AGENT_VENTURE_WORKBENCH_ITEMS } from "@/features/ventures/agent-venture-workbench-data";
import { requireOwnerAccess } from "@/server/auth/owner";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";

export const dynamic = "force-dynamic";

export default async function CashActionReviewPage() {
  const access = await requireOwnerAccess("/hq/ventures/cash-actions");

  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  // Agents prepare concrete cash moves from the current ventures. The page
  // supplies the clock here (the generator itself reads no clock), so the
  // packets are produced server-side and handed to the review screen as data.
  const generatedAt = new Date().toISOString();
  const packets = buildCashActionPacketsFromItems(AGENT_VENTURE_WORKBENCH_ITEMS, {
    createdAt: generatedAt,
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-5 md:px-8 md:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href={"/hq/ventures" as Route}
            className="inline-flex items-center gap-1.5 text-xs text-neutral-500 transition hover:text-neutral-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Venture Engine
          </Link>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
            <Banknote className="h-3.5 w-3.5" />
            Cash Action Review
          </div>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-white sm:text-4xl">
            Cash Action Review
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
            L&apos;agent prépare le move cash. Vous agissez manuellement. Le système capture la preuve.
          </p>
        </div>

        <aside className="shrink-0 self-start rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 sm:w-56">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-[11px] font-medium text-neutral-300">
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            Humain dans la boucle
          </span>
          <p className="mt-3 text-xs leading-5 text-neutral-500">
            Approbation requise. Aucune exécution, aucun envoi, aucune dépense déclenchés ici.
          </p>
        </aside>
      </header>

      <CashActionReviewClient packets={packets} generatedAt={generatedAt} />
    </main>
  );
}
