import type { Mission } from "@/core/types";
import type { LedgerEventType } from "@/features/skills/types";
import type { ActionLedgerEntry } from "@/server/actions/action-ledger-repository";

export type LedgerActivityContext = {
  calendarEventId?: string;
  effectKind?: string;
  effectOperation?: string;
  modeId?: string;
};

export type LedgerMissionTraceKind = "linked" | "orphan" | "unknown_ref";

export type MissionLookupEntry = {
  title: string;
  status: string;
};

export type MissionLookup = ReadonlyMap<string, MissionLookupEntry>;

export type LedgerMissionTrace = {
  kind: LedgerMissionTraceKind;
  missionId?: string;
  missionTitle?: string;
  missionStatus?: string;
};

export type LedgerMissionTraceSummary = {
  linked: number;
  orphan: number;
  unknownRef: number;
};

const EVENT_TYPE_LABELS: Record<LedgerEventType, string> = {
  decision: "Décision",
  action: "Action",
  result: "Résultat",
  cost: "Coût",
  learning: "Apprentissage",
};

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNestedMetadata(
  entry: Pick<ActionLedgerEntry, "metadata" | "payload">,
): Record<string, unknown> | undefined {
  const topMetadata = isJsonRecord(entry.metadata) ? entry.metadata : undefined;
  const payload = isJsonRecord(entry.payload) ? entry.payload : undefined;
  const payloadMetadata = payload && isJsonRecord(payload.metadata) ? payload.metadata : undefined;

  if (!topMetadata && !payloadMetadata) return undefined;

  return {
    ...(payloadMetadata ?? {}),
    ...(topMetadata ?? {}),
  };
}

export function formatLedgerActivityTimestamp(iso: string): string {
  const date = new Date(iso);

  return new Intl.DateTimeFormat("fr-CA", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function getLedgerEventTypeLabel(eventType: LedgerEventType | undefined): string {
  if (!eventType) return "Non typé";
  return EVENT_TYPE_LABELS[eventType];
}

export function extractLedgerActivityContext(entry: ActionLedgerEntry): LedgerActivityContext {
  const context: LedgerActivityContext = {};

  if (isJsonRecord(entry.payload) && isJsonRecord(entry.payload.effect)) {
    context.effectKind = readStringField(entry.payload.effect, "kind");
    context.effectOperation = readStringField(entry.payload.effect, "operation");
  }

  const mergedMetadata = readNestedMetadata(entry);
  context.modeId = mergedMetadata ? readStringField(mergedMetadata, "modeId") : undefined;

  if (mergedMetadata) {
    context.calendarEventId = readStringField(mergedMetadata, "calendarEventId");
  }

  return context;
}

export function formatLedgerStorageLabel(storageMode: ActionLedgerEntry["storageMode"]): string {
  return storageMode === "supabase" ? "Supabase" : "Session locale";
}

export function resolveLedgerMissionId(entry: ActionLedgerEntry): string | undefined {
  if (entry.missionId) return entry.missionId;

  const mergedMetadata = readNestedMetadata(entry);
  return mergedMetadata ? readStringField(mergedMetadata, "missionId") : undefined;
}

export function buildMissionLookup(missions: Mission[]): MissionLookup {
  return new Map(
    missions.map((mission) => [
      mission.id,
      {
        title: mission.title,
        status: mission.status,
      },
    ]),
  );
}

export function classifyMissionTrace(entry: ActionLedgerEntry, missionLookup: MissionLookup): LedgerMissionTrace {
  const missionId = resolveLedgerMissionId(entry);

  if (!missionId) {
    return { kind: "orphan" };
  }

  const mission = missionLookup.get(missionId);

  if (!mission) {
    return {
      kind: "unknown_ref",
      missionId,
    };
  }

  return {
    kind: "linked",
    missionId,
    missionTitle: mission.title,
    missionStatus: mission.status,
  };
}

export function summarizeMissionTrace(
  entries: readonly ActionLedgerEntry[],
  missionLookup: MissionLookup,
): LedgerMissionTraceSummary {
  return entries.reduce<LedgerMissionTraceSummary>(
    (summary, entry) => {
      const trace = classifyMissionTrace(entry, missionLookup);

      if (trace.kind === "linked") {
        summary.linked += 1;
      } else if (trace.kind === "unknown_ref") {
        summary.unknownRef += 1;
      } else {
        summary.orphan += 1;
      }

      return summary;
    },
    { linked: 0, orphan: 0, unknownRef: 0 },
  );
}

export function getMissionTraceLabel(trace: LedgerMissionTrace): string {
  if (trace.kind === "linked") {
    return trace.missionTitle ?? trace.missionId ?? "Liée";
  }

  if (trace.kind === "unknown_ref") {
    return "Réf. inconnue";
  }

  return "Orphelin";
}
