import { AlertTriangle, CheckCircle2, Link2, ShieldAlert } from "lucide-react";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { buildLedgerHealthReport } from "@/server/ledger/ledger-health";

function truncateId(id: string | null): string {
  if (!id) return "—";
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

export async function LedgerHealthPanel() {
  const ctx = getActiveWorkspaceContext();
  const report = await buildLedgerHealthReport(ctx.workspace.id, ctx.userId);

  const intact = report.ok && !report.migrationRequired;
  const broken = !report.ok && !report.migrationRequired;

  return (
    <div className="space-y-4 font-mono text-xs">
      <div
        className={`rounded-xl border px-4 py-3 ${
          report.migrationRequired
            ? "border-amber-500/40 bg-amber-500/10"
            : intact
              ? "border-emerald-500/40 bg-emerald-500/10"
              : "border-red-500/50 bg-red-500/10 animate-pulse"
        }`}
      >
        <div className="flex items-center gap-2">
          {report.migrationRequired ? (
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          ) : intact ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-red-400" />
          )}
          <span
            className={`text-sm font-bold uppercase tracking-wider ${
              report.migrationRequired
                ? "text-amber-300"
                : intact
                  ? "text-emerald-300"
                  : "text-red-300"
            }`}
          >
            {report.migrationRequired
              ? "MIGRATION REQUISE"
              : intact
                ? "CHAÎNE INTÈGRE"
                : "RUPTURE DÉTECTÉE"}
          </span>
        </div>
        <p className="mt-2 text-neutral-300">{report.summary}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Écritures scellées" value={String(report.count)} tone="neutral" />
        <Metric
          label="Vérifiées"
          value={`${report.verifiedCount}/${report.count}`}
          tone={intact ? "ok" : broken ? "alert" : "warn"}
        />
        <Metric label="Genesis" value={truncateId(report.genesisId)} tone="neutral" />
        <Metric label="Tip" value={truncateId(report.tipId)} tone="neutral" />
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-3 text-neutral-400">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            write:{" "}
            <span className={report.writeEnabled ? "text-emerald-400" : "text-red-400"}>
              {report.writeEnabled ? "ON" : "OFF"}
            </span>
          </span>
          <span>
            hmac:{" "}
            <span className={report.hmacChecked ? "text-emerald-400" : "text-amber-400"}>
              {report.hmacChecked ? "checked" : "skipped"}
            </span>
          </span>
          <span>
            source: <span className="text-sky-300">{report.source}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Link2 className="h-3 w-3" />
            scope: <span className="text-neutral-200">{report.chainScope}</span>
          </span>
        </div>
        {broken && report.brokenAt !== null ? (
          <p className="mt-2 text-red-300">
            break @ #{report.brokenAt}
            {report.brokenEntryId ? ` (${truncateId(report.brokenEntryId)})` : ""}: {report.reason}
          </p>
        ) : null}
        {report.migrationRequired ? (
          <p className="mt-2 text-amber-200">
            Appliquer <span className="text-amber-100">0022</span> puis{" "}
            <span className="text-amber-100">0023</span> —{" "}
            <span className="text-amber-100">npm run ledger:apply-migration</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "alert" | "warn" | "neutral";
}) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-300"
      : tone === "alert"
        ? "text-red-300"
        : tone === "warn"
          ? "text-amber-300"
          : "text-neutral-200";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
      <p className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
