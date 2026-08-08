import type { ReactNode } from "react";
import { BadgeDollarSign, Receipt, Scale, Wallet } from "lucide-react";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { buildFinanceDashboard } from "@/server/michael-hq/finance-dashboard";
import { CockpitShell } from "@/features/cockpit/components/cockpit-shell";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";
import { HqPageHeader, HqWidget } from "@/features/hq/components/hq-widget-system";
import { requireOwnerAccess } from "@/server/auth/owner";

export const dynamic = "force-dynamic";

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function FinancePage() {
  const access = await requireOwnerAccess("/hq/finance");
  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  const ctx = getActiveWorkspaceContext();
  const dash = await buildFinanceDashboard(ctx.workspace.id);

  return (
    <CockpitShell active="finance" crumb="Finance">
      <div className="bg-zinc-950">
        <HqPageHeader
          eyebrow="Michael HQ · Facturation souveraine"
          icon={BadgeDollarSign}
          title="Finance éthique"
          description="Usage réel uniquement — zéro commission sur vos revenus projets. Chaque centime est traçable via le ledger cryptographique."
        />

        <div className="mb-4 grid gap-3 font-mono text-xs sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Solde wallet"
            value={usd(dash.wallet.balanceCents)}
            tone="ok"
            icon={<Wallet className="h-3.5 w-3.5" />}
          />
          <Metric
            label="Consommé"
            value={usd(dash.wallet.chargedCents)}
            tone="amber"
            icon={<Receipt className="h-3.5 w-3.5" />}
          />
          <Metric
            label="Stripe"
            value={
              dash.stripe.available && dash.stripe.balanceCents !== null
                ? usd(dash.stripe.balanceCents)
                : "non configuré"
            }
            tone={dash.stripe.available ? "ok" : "neutral"}
            icon={<Scale className="h-3.5 w-3.5" />}
          />
          <Metric
            label="Commission revenus"
            value={`${dash.revenueSharePercent}%`}
            tone="ok"
            icon={<BadgeDollarSign className="h-3.5 w-3.5" />}
          />
        </div>

        <HqWidget title="Politique de facturation" eyebrow="Doctrine" icon={Scale}>
          <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 font-mono text-xs text-emerald-100">
            <p>
              Modèle : <span className="font-bold text-emerald-300">{dash.billingModel}</span>
            </p>
            <p>
              Prélèvement sur revenus projets utilisateurs :{" "}
              <span className="font-bold text-emerald-300">{dash.revenueSharePercent}% — interdit</span>
            </p>
            <p className="text-emerald-200/80">
              Le coût algorithmique (`estimated_cost`) n&apos;est débité qu&apos;après approbation
              CEO explicite dans le Théâtre d&apos;exécution.
            </p>
          </div>
        </HqWidget>

        <div className="mt-4">
          <HqWidget title="Charges d'usage" eyebrow="Wallet ledger" icon={Receipt}>
            <div className="space-y-2 font-mono text-xs">
              {dash.recentCharges.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950 px-4 py-8 text-center text-zinc-500">
                  Aucune charge. Approuvez une intention dans le Théâtre pour voir le débit
                  usage-only apparaître ici.
                </p>
              ) : (
                <ul className="space-y-2">
                  {dash.recentCharges.map((c) => (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2"
                    >
                      <div>
                        <p className="text-zinc-100">
                          {c.agentId}/{c.skillId}
                        </p>
                        <p className="text-[10px] text-zinc-500">
                          {c.intentId} · {c.createdAt.slice(0, 19).replace("T", " ")} · stripe=
                          {c.stripeSync}
                        </p>
                      </div>
                      <p className="text-amber-300">{usd(c.amountCents)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </HqWidget>
        </div>

        <div className="mt-4">
          <HqWidget title="Événements coût (ledger)" eyebrow="Hash-chain audit trail" icon={BadgeDollarSign}>
            <div className="space-y-2 font-mono text-xs">
              {dash.ledgerCostEvents.length === 0 ? (
                <p className="text-zinc-500">Aucun événement `cost` dans le ledger pour ce workspace.</p>
              ) : (
                <ul className="space-y-2">
                  {dash.ledgerCostEvents.map((e) => (
                    <li
                      key={e.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-zinc-300"
                    >
                      <p>{e.summary}</p>
                      <p className="mt-1 text-[10px] text-zinc-600">
                        {e.createdAt.slice(0, 19).replace("T", " ")}
                        {e.agentId ? ` · ${e.agentId}` : ""}
                        {typeof e.amountCents === "number" ? ` · ${usd(e.amountCents)}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </HqWidget>
        </div>
      </div>
    </CockpitShell>
  );
}

function Metric({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: "ok" | "amber" | "neutral";
  icon: ReactNode;
}) {
  const toneClass =
    tone === "ok" ? "text-emerald-300" : tone === "amber" ? "text-amber-300" : "text-zinc-300";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3">
      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-zinc-500">
        {icon}
        {label}
      </p>
      <p className={`mt-1 text-sm font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}
