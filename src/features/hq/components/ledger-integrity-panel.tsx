import { Link2, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import {
  auditWorkspaceLedgerChain,
  type WorkspaceChainAuditStatus,
  type WorkspaceChainAuditView,
} from "@/server/ledger/hash-chain-workspace-audit";

const STATUS_STYLES: Record<
  WorkspaceChainAuditStatus,
  { badge: string; label: string; Icon: typeof ShieldCheck }
> = {
  intact: {
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    label: "Chaîne intacte",
    Icon: ShieldCheck,
  },
  broken: {
    badge: "border-rose-500/30 bg-rose-500/10 text-rose-200",
    label: "Rupture détectée",
    Icon: ShieldAlert,
  },
  partial: {
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    label: "Partiellement scellée",
    Icon: ShieldQuestion,
  },
  inactive: {
    badge: "border-neutral-600/40 bg-neutral-900 text-neutral-300",
    label: "Scellage inactif",
    Icon: ShieldQuestion,
  },
  unavailable: {
    badge: "border-neutral-600/40 bg-neutral-900 text-neutral-400",
    label: "Indisponible",
    Icon: ShieldQuestion,
  },
};

function StatusBadge({ status }: { status: WorkspaceChainAuditStatus }) {
  const style = STATUS_STYLES[status];
  const Icon = style.Icon;
  return (
    <span className={`inline-flex items-center gap-2 rounded-md border px-3 py-1 text-xs font-medium ${style.badge}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {style.label}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950/70 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{label}</p>
      <p className="mt-1 font-mono text-sm text-neutral-100">{value}</p>
    </div>
  );
}

function summaryFor(view: WorkspaceChainAuditView): string {
  if (view.status === "intact" && view.report) {
    return view.report.summary;
  }
  if (view.status === "broken" && view.report) {
    return view.report.summary;
  }
  if (view.status === "partial") {
    return `${view.sealedCount} entrée(s) scellée(s), ${view.unsealedCount} non scellée(s). La preuve complète exige un backfill.`;
  }
  if (view.status === "inactive") {
    return view.writeEnabled
      ? "Le flag d'écriture est actif, mais aucune entrée scellée n'est encore présente pour ce workspace."
      : "LEDGER_HASH_CHAIN_WRITE est OFF. Les nouvelles insertions ne scellent pas encore la chaîne.";
  }
  return "Impossible de lire le registre pour vérifier la chaîne.";
}

export async function LedgerIntegrityPanel() {
  const { activeWorkspace } = getActiveWorkspaceContext();
  let view: WorkspaceChainAuditView;

  try {
    view = await auditWorkspaceLedgerChain(activeWorkspace.id);
  } catch {
    view = {
      workspaceId: activeWorkspace.id,
      source: "unavailable",
      writeEnabled: false,
      hmacChecked: false,
      status: "unavailable",
      sealedCount: 0,
      unsealedCount: 0,
      report: null,
      tipPreview: null,
      genesisId: null,
    };
  }

  return (
    <section
      id="ledger-integrity"
      aria-label="Ledger integrity"
      className="scroll-mt-6 rounded-lg border border-neutral-800 bg-neutral-950/80 p-4 md:p-6"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
            <Link2 className="h-3.5 w-3.5" />
            Ledger Integrity
          </div>
          <h2 className="mt-4 text-2xl font-semibold text-white md:text-3xl">
            Intégrité cryptographique du registre.
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-400">
            Chaque bloc scellé porte un <span className="font-mono text-neutral-300">entry_hash</span> lié
            au précédent. Toute altération silencieuse de l&apos;historique casse la chaîne.
          </p>
        </div>
        <StatusBadge status={view.status} />
      </div>

      <p className="mt-5 text-sm leading-6 text-neutral-300">{summaryFor(view)}</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Écriture live" value={view.writeEnabled ? "ON" : "OFF"} />
        <Fact label="Blocs scellés" value={String(view.sealedCount)} />
        <Fact label="HMAC vérifié" value={view.hmacChecked ? "oui" : "non"} />
        <Fact label="Tip" value={view.tipPreview ? `${view.tipPreview}…` : "—"} />
      </div>

      {view.report?.ok === false ? (
        <div className="mt-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          Rupture à l&apos;index {view.report.brokenAt}
          {view.report.brokenEntryId ? (
            <span className="font-mono"> ({view.report.brokenEntryId})</span>
          ) : null}
          {view.report.reason ? <> — {view.report.reason}</> : null}
        </div>
      ) : null}

      {view.genesisId ? (
        <p className="mt-4 font-mono text-[11px] text-neutral-500">
          genesis {view.genesisId}
          {view.report?.tipId ? ` → tip ${view.report.tipId}` : ""}
          {" · "}
          source {view.source}
        </p>
      ) : (
        <p className="mt-4 font-mono text-[11px] text-neutral-500">source {view.source}</p>
      )}
    </section>
  );
}
