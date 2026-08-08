import { Download, HardDrive, Server } from "lucide-react";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { listInfrastructurePackages } from "@/server/agents/engineering-package-store";
import { formatEstimatedCostUsd } from "@/server/michael-hq/telemetry-extract";
import { CockpitShell } from "@/features/cockpit/components/cockpit-shell";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";
import { HqPageHeader, HqWidget } from "@/features/hq/components/hq-widget-system";
import { requireOwnerAccess } from "@/server/auth/owner";

export const dynamic = "force-dynamic";

export default async function InfrastructurePage() {
  const access = await requireOwnerAccess("/hq/infrastructure");
  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  const ctx = getActiveWorkspaceContext();
  const packages = listInfrastructurePackages(ctx.workspace.id);

  return (
    <CockpitShell active="infrastructure" crumb="Infrastructure">
      <HqPageHeader
        eyebrow="Michael HQ"
        icon={Server}
        title="Paquets de code souverains"
        description="Configurations portables générées par l'Agent d'Ingénierie et validées par le CEO. Zéro déploiement autonome — export total vers votre GitHub ou cloud."
      />

      <HqWidget title="Code packages" eyebrow="CEO-approved" icon={Server}>
        <div className="space-y-3 font-mono text-xs">
          {packages.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/80 px-4 py-8 text-center text-zinc-500">
              Aucun paquet approuvé. Soumettez un brief via l&apos;Agent d&apos;Ingénierie — la
              proposition apparaîtra dans le Théâtre d&apos;exécution avec son coût estimé.
            </p>
          ) : (
            <ul className="space-y-3">
              {packages.map((pkg) => (
                <li
                  key={pkg.packageId}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-zinc-100">{pkg.title}</p>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        {pkg.packageId} · mode={pkg.modeId} · {pkg.files.length} fichier(s)
                      </p>
                      {pkg.estimatedCost ? (
                        <p className="mt-2 text-emerald-400">
                          coût · {formatEstimatedCostUsd(pkg.estimatedCost)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={`/api/hq/infrastructure/packages/${encodeURIComponent(pkg.packageId)}/export`}
                        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/20"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Télécharger JSON
                      </a>
                      <span className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-zinc-700 px-3 text-[11px] text-zinc-400">
                        <HardDrive className="h-3.5 w-3.5" />
                        {pkg.exportTargets.join(" · ")}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-[11px] leading-5 text-zinc-400">{pkg.brief}</p>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {pkg.files.map((file) => (
                      <li
                        key={file.path}
                        className="rounded border border-zinc-800 bg-black/40 px-2 py-0.5 text-[10px] text-sky-300"
                      >
                        {file.path}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </HqWidget>
    </CockpitShell>
  );
}
