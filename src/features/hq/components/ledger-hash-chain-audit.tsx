import { Link2, ShieldAlert, ShieldCheck } from "lucide-react";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { listActionLedgerForWorkspace } from "@/server/actions/action-ledger-read";
import { isHashChainWriteEnabled } from "@/server/ledger/hash-chain-write-flag";
import { auditWorkspaceLedgerChain } from "@/server/ledger/hash-chain-workspace-audit";

function formatTs(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-CA", {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Minimal CEO integrity panel: proves the workspace hash-chain is intact
 * (or reports the first break). Read-only — never mutates the ledger.
 */
export async function LedgerHashChainAudit() {
  const { activeWorkspace } = getActiveWorkspaceContext();
  const { entries } = await listActionLedgerForWorkspace({
    workspaceId: activeWorkspace.id,
    limit: 100,
  });

  const audit = auditWorkspaceLedgerChain(entries);
  const writeEnabled = isHashChainWriteEnabled();
  const intact = audit.report?.ok === true;
  const empty = audit.sealedCount === 0;

  const statusTone = empty
    ? "border-neutral-700 bg-neutral-900 text-neutral-300"
    : intact
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : "border-red-500/30 bg-red-500/10 text-red-200";

  const StatusIcon = empty ? Link2 : intact ? ShieldCheck : ShieldAlert;

  return (
    <section
      id="ledger-integrity"
      aria-label="Ledger hash-chain integrity"
      className="scroll-mt-6 space-y-5"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div
            className={`inline-flex items-center gap-2 rounded-md border px-3 py-1 text-xs font-medium ${statusTone}`}
          >
            <StatusIcon className="h-3.5 w-3.5" />
            {empty ? "Chaîne inactive" : intact ? "Chaîne intacte" : "Chaîne rompue"}
          </div>
          <h2 className="mt-3 text-xl font-semibold text-white md:text-2xl">
            Intégrité hash-chain du ledger
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            Vérifie que chaque bloc lie son <code className="text-neutral-300">prev_hash</code> au{" "}
            <code className="text-neutral-300">entry_hash</code> précédent. Preuve d&apos;audit
            minimale — lecture seule, aucune mutation.
          </p>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-300">
          <p>
            Écriture live:{" "}
            <span className={writeEnabled ? "text-emerald-300" : "text-amber-300"}>
              {writeEnabled ? "ON" : "OFF (shadow)"}
            </span>
          </p>
          <p className="mt-1">
            HMAC:{" "}
            <span className={audit.hmacConfigured ? "text-emerald-300" : "text-neutral-500"}>
              {audit.hmacConfigured ? "configuré" : "absent"}
            </span>
          </p>
          <p className="mt-1 tabular-nums">
            Scellés: {audit.sealedCount}/{audit.totalCount}
          </p>
        </div>
      </div>

      {empty ? (
        <p className="rounded-lg border border-dashed border-neutral-800 bg-neutral-950/40 px-4 py-6 text-sm text-neutral-500">
          Aucune entrée scellée dans cette fenêtre. Activez{" "}
          <code className="text-neutral-300">LEDGER_HASH_CHAIN_WRITE=1</code> (après migration 0022
          + <code className="text-neutral-300">LEDGER_HMAC_KEY</code>) pour sceller chaque nouvel
          append en production.
        </p>
      ) : (
        <>
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              intact
                ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-100"
                : "border-red-500/20 bg-red-500/5 text-red-100"
            }`}
          >
            {audit.report?.summary}
            {!intact && audit.report?.reason ? (
              <span className="mt-1 block text-red-200/90">Raison: {audit.report.reason}</span>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-lg border border-neutral-800">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-neutral-800 bg-neutral-950/80 text-[11px] uppercase tracking-[0.14em] text-neutral-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Quand</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">entry_hash</th>
                  <th className="px-3 py-2 font-medium">prev_hash</th>
                </tr>
              </thead>
              <tbody>
                {audit.tipPreview.map((row) => (
                  <tr key={row.id} className="border-b border-neutral-900 last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 text-neutral-400">
                      {formatTs(row.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-neutral-100">{row.actionType}</p>
                      <p className="text-xs text-neutral-500 line-clamp-1">{row.summary}</p>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-emerald-200/90">
                      {row.entryHashShort}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-neutral-400">
                      {row.prevHashShort ?? "genesis"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
