import { BookOpenCheck, DatabaseZap, Link2 } from "lucide-react";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import {
  buildMissionLookup,
  classifyMissionTrace,
  extractLedgerActivityContext,
  formatLedgerActivityTimestamp,
  formatLedgerStorageLabel,
  getLedgerEventTypeLabel,
  getMissionTraceLabel,
  summarizeMissionTrace,
  type LedgerMissionTrace,
} from "@/features/hq/ledger-activity";
import type { LedgerEventType } from "@/features/skills/types";
import { listActionLedgerForWorkspace } from "@/server/actions/action-ledger-read";
import { listMissionsForWorkspace } from "@/server/missions";

const EVENT_TYPE_STYLES: Record<LedgerEventType, string> = {
  decision: "border-sky-500/20 bg-sky-500/10 text-sky-200",
  action: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
  result: "border-violet-500/20 bg-violet-500/10 text-violet-200",
  cost: "border-amber-500/20 bg-amber-500/10 text-amber-200",
  learning: "border-neutral-500/20 bg-neutral-500/10 text-neutral-200",
};

function EventTypeBadge({ eventType }: { eventType: LedgerEventType | undefined }) {
  if (!eventType) {
    return (
      <span className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-400">
        Non typé
      </span>
    );
  }

  return (
    <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${EVENT_TYPE_STYLES[eventType]}`}>
      {getLedgerEventTypeLabel(eventType)}
    </span>
  );
}

const MISSION_TRACE_STYLES: Record<LedgerMissionTrace["kind"], string> = {
  linked: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
  orphan: "border-neutral-600/40 bg-neutral-900 text-neutral-400",
  unknown_ref: "border-amber-500/20 bg-amber-500/10 text-amber-200",
};

function MissionTraceBadge({ trace }: { trace: LedgerMissionTrace }) {
  return (
    <div className="space-y-1">
      <span
        className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${MISSION_TRACE_STYLES[trace.kind]}`}
      >
        {getMissionTraceLabel(trace)}
      </span>
      {trace.kind === "linked" && trace.missionStatus ? (
        <p className="text-[11px] text-neutral-500">{trace.missionStatus}</p>
      ) : null}
      {trace.kind === "unknown_ref" && trace.missionId ? (
        <p className="font-mono text-[11px] text-amber-100/80">{trace.missionId}</p>
      ) : null}
    </div>
  );
}

export async function LedgerActivity() {
  const { activeWorkspace } = getActiveWorkspaceContext();
  const [{ entries, source }, { missions }] = await Promise.all([
    listActionLedgerForWorkspace({
      workspaceId: activeWorkspace.id,
    }),
    listMissionsForWorkspace({
      workspaceId: activeWorkspace.id,
    }),
  ]);

  const missionLookup = buildMissionLookup(missions);
  const traceSummary = summarizeMissionTrace(entries, missionLookup);

  return (
    <section
      id="ledger-activity"
      aria-label="Ledger activity"
      className="scroll-mt-6 rounded-lg border border-neutral-800 bg-neutral-950/80 p-4 md:p-6"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-md border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-300">
            <BookOpenCheck className="h-3.5 w-3.5" />
            Ledger Activity
          </div>
          <h2 className="mt-4 text-2xl font-semibold text-white md:text-3xl">
            Événements ledger réels du workspace.
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-400">
            Read model dédié : affiche les entrées enregistrées par le write path (decision, action, etc.) et indique
            si chaque événement est lié à une mission, orphelin, ou référence une mission inconnue.
          </p>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Source</p>
          <p className="mt-1 flex items-center gap-2 text-sm text-white">
            <DatabaseZap className="h-4 w-4 text-sky-300" />
            {source === "supabase" ? "Supabase" : "Session locale"}
          </p>
          <p className="mt-1 font-mono text-xs text-neutral-500">{entries.length} entrée(s)</p>
        </div>
      </div>

      {entries.length > 0 ? (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-sm text-neutral-300">
          <Link2 className="h-4 w-4 text-sky-300" aria-hidden="true" />
          <span>
            <span className="font-medium text-emerald-200">{traceSummary.linked}</span> liée(s)
          </span>
          <span className="text-neutral-600">·</span>
          <span>
            <span className="font-medium text-neutral-200">{traceSummary.orphan}</span> orpheline(s)
          </span>
          {traceSummary.unknownRef > 0 ? (
            <>
              <span className="text-neutral-600">·</span>
              <span>
                <span className="font-medium text-amber-200">{traceSummary.unknownRef}</span> réf. inconnue(s)
              </span>
            </>
          ) : null}
        </div>
      ) : null}

      {entries.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-neutral-800 bg-neutral-900/40 px-4 py-8 text-center">
          <p className="text-sm text-neutral-300">Aucun événement ledger pour ce workspace.</p>
          <p className="mt-2 text-xs leading-6 text-neutral-500">
            En local, lance <span className="font-mono text-neutral-400">npm run smoke:joris</span> ou réserve via Joris
            pour voir decision + action apparaître ici.
          </p>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-lg border border-neutral-800">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-neutral-800 bg-neutral-900/70 text-[11px] uppercase tracking-[0.14em] text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Quand</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Résumé</th>
                <th className="px-4 py-3 font-medium">Mission</th>
                <th className="px-4 py-3 font-medium">Contexte</th>
                <th className="px-4 py-3 font-medium">Stockage</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const context = extractLedgerActivityContext(entry);
                const missionTrace = classifyMissionTrace(entry, missionLookup);

                return (
                  <tr key={entry.id} className="border-b border-neutral-800/80 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-300">
                      {formatLedgerActivityTimestamp(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <EventTypeBadge eventType={entry.eventType} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-neutral-200">
                      {entry.actionType}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-neutral-300">{entry.summary}</td>
                    <td className="px-4 py-3">
                      <MissionTraceBadge trace={missionTrace} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1 text-xs text-neutral-400">
                        {entry.skillId ? <p>skill: {entry.skillId}</p> : null}
                        {entry.agentId ? <p>agent: {entry.agentId}</p> : null}
                        {context.calendarEventId ? (
                          <p className="font-mono text-sky-200">event: {context.calendarEventId}</p>
                        ) : null}
                        {context.effectKind && context.effectOperation ? (
                          <p>
                            {context.effectKind} · {context.effectOperation}
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-neutral-500">
                      {formatLedgerStorageLabel(entry.storageMode)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
