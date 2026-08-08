import { Link2, ShieldCheck, ShieldAlert, ShieldOff } from "lucide-react";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { auditWorkspaceHashChain } from "@/server/actions/action-ledger-hash-chain-read";

/**
 * Minimal CEO-facing hash-chain integrity panel.
 * Shows whether the sealed ledger chain for the active workspace verifies
 * (prev_hash ↔ entry_hash linkage). Never displays HMAC keys or raw secrets.
 */
export async function LedgerHashChainAudit() {
  const { activeWorkspace } = getActiveWorkspaceContext();
  const audit = await auditWorkspaceHashChain({ workspaceId: activeWorkspace.id });

  const status = !audit.writeEnabled && audit.sealedCount === 0
    ? "shadow"
    : audit.report.ok
      ? "intact"
      : "broken";

  const styles = {
    shadow: {
      badge: "border-neutral-600/40 bg-neutral-900 text-neutral-300",
      label: "Shadow / write OFF",
      Icon: ShieldOff,
    },
    intact: {
      badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
      label: "Chaîne intacte",
      Icon: ShieldCheck,
    },
    broken: {
      badge: "border-red-500/20 bg-red-500/10 text-red-200",
      label: "Chaîne rompue",
      Icon: ShieldAlert,
    },
  }[status];

  const StatusIcon = styles.Icon;

  return (
    <section
      id="ledger-hash-chain"
      aria-label="Ledger hash-chain integrity"
      className="scroll-mt-6 rounded-lg border border-neutral-800 bg-neutral-950/80 p-4 md:p-6"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
            <Link2 className="h-3.5 w-3.5" />
            Hash-chain audit
          </div>
          <h2 className="mt-4 text-2xl font-semibold text-white md:text-3xl">
            Intégrité cryptographique du registre.
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-400">
            Vérifie que chaque entrée scellée relie son <span className="font-mono text-neutral-300">prev_hash</span> au{" "}
            <span className="font-mono text-neutral-300">entry_hash</span> du bloc précédent — toute altération silencieuse
            casse la chaîne.
          </p>
        </div>
        <div className={`rounded-lg border px-4 py-3 ${styles.badge}`}>
          <p className="text-[11px] uppercase tracking-[0.18em] opacity-70">Statut</p>
          <p className="mt-1 flex items-center gap-2 text-sm font-medium">
            <StatusIcon className="h-4 w-4" />
            {styles.label}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Write path</p>
          <p className="mt-1 font-mono text-sm text-neutral-200">
            {audit.writeEnabled ? "LEDGER_HASH_CHAIN_WRITE=on" : "flag OFF (défaut)"}
          </p>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Entrées scellées</p>
          <p className="mt-1 font-mono text-sm text-neutral-200">{audit.sealedCount}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Vérifiées</p>
          <p className="mt-1 font-mono text-sm text-neutral-200">{audit.report.verifiedCount}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Tip hash</p>
          <p className="mt-1 truncate font-mono text-sm text-neutral-200">
            {audit.tipHashPreview ? `${audit.tipHashPreview}…` : "—"}
          </p>
        </div>
      </div>

      <p className="mt-4 font-mono text-xs leading-6 text-neutral-500">{audit.report.summary}</p>

      {status === "broken" && audit.report.reason ? (
        <p className="mt-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          Rupture à l&apos;index {audit.report.brokenAt}
          {audit.report.brokenEntryId ? ` (${audit.report.brokenEntryId})` : ""}: {audit.report.reason}
        </p>
      ) : null}

      {status === "shadow" ? (
        <p className="mt-4 text-xs leading-6 text-neutral-500">
          Le scellage live est câblé mais reste désactivé tant que{" "}
          <span className="font-mono text-neutral-400">LEDGER_HASH_CHAIN_WRITE</span> n&apos;est pas activé après
          migration Phase 1 + provisionnement de <span className="font-mono text-neutral-400">LEDGER_HMAC_KEY</span>.
        </p>
      ) : null}
    </section>
  );
}
