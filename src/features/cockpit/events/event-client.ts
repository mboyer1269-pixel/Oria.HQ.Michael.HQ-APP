import "server-only";

import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import type { EventInsert, EventRow, Json } from "@/server/db/types";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import {
  dailyDirectionEventRecordSchema,
  eventRecordSchema,
  parseEventPayload,
  type DailyDirectionEventRecord,
  type DailyDirectionPayload,
  type EventPayload,
  type EventRecord,
  type EventType,
  type IdeaCapturedPayload,
} from "./event-record";

export type EventPersistenceMode = "supabase" | "local" | "unavailable";

export type AppendEventInput = {
  workspaceId: string;
  userId: string;
  streamId: string;
  type: EventType;
  payload: IdeaCapturedPayload | DailyDirectionPayload;
  validFrom?: string | null;
  validTo?: string | null;
};

export type ListIdeaCapturedEventsInput = {
  workspaceId: string;
  userId: string;
  limit?: number;
};

export type ListDailyDirectionEventsInput = {
  workspaceId: string;
  userId: string;
  /** Filter by date YYYY-MM-DD (matches payload.dateIso). Null = all dates. */
  dateIso?: string | null;
  limit?: number;
};

const PRODUCTION_GUARD_MESSAGE =
  "Event persistence is unavailable: Supabase is not configured and local fallback is only available outside production.";

type SupabaseAdminClient = NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>;
type EventClientGlobals = typeof globalThis & {
  __cockpitEventClientFactory?: (() => SupabaseAdminClient | null) | null;
};

const localEvents: EventRow[] = [];

export class EventClientError extends Error {
  constructor(operation: "append" | "list") {
    super(`Cockpit event ${operation} failed.`);
    this.name = "EventClientError";
  }
}

function getSupabaseClient(): SupabaseAdminClient | null {
  const globals = globalThis as EventClientGlobals;
  if (globals.__cockpitEventClientFactory) {
    return globals.__cockpitEventClientFactory();
  }
  return createOptionalSupabaseAdminClient();
}

function assertLocalFallbackAvailable(): void {
  if (!isLocalPersistenceFallbackAllowed()) {
    throw new Error(PRODUCTION_GUARD_MESSAGE);
  }
}

function cloneRow(row: EventRow): EventRow {
  return structuredClone(row);
}

function byRecordedAtDesc(left: EventRow, right: EventRow): number {
  if (left.recorded_at !== right.recorded_at) {
    return left.recorded_at < right.recorded_at ? 1 : -1;
  }

  return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
}

function mapRowToEventRecord(row: EventRow): EventRecord {
  return eventRecordSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    streamId: row.stream_id,
    type: row.type,
    payload: row.payload,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    recordedAt: row.recorded_at,
  });
}

function mapRowToDailyDirectionRecord(row: EventRow): DailyDirectionEventRecord {
  return dailyDirectionEventRecordSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    streamId: row.stream_id,
    type: row.type,
    payload: row.payload,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    recordedAt: row.recorded_at,
  });
}

function toInsert(input: AppendEventInput): EventInsert {
  return {
    workspace_id: input.workspaceId,
    user_id: input.userId,
    stream_id: input.streamId,
    type: input.type,
    payload: parseEventPayload(input.type, input.payload) as unknown as Json,
    valid_from: input.validFrom ?? null,
    valid_to: input.validTo ?? null,
  };
}

export async function appendEvent(input: AppendEventInput): Promise<EventRecord | DailyDirectionEventRecord> {
  const insert = toInsert(input);
  const db = getSupabaseClient();

  if (!db) {
    assertLocalFallbackAvailable();
    const row: EventRow = {
      ...insert,
      id: crypto.randomUUID(),
      recorded_at: new Date().toISOString(),
    };
    localEvents.push(cloneRow(row));
    if (row.type === "daily.direction.generated") {
      return mapRowToDailyDirectionRecord(row);
    }
    return mapRowToEventRecord(row);
  }

  const { data, error } = await db.from("events").insert(insert).select("*").single();
  if (error) {
    throw new EventClientError("append");
  }

  if (data.type === "daily.direction.generated") {
    return mapRowToDailyDirectionRecord(data);
  }
  return mapRowToEventRecord(data);
}

export async function listIdeaCapturedEvents(
  input: ListIdeaCapturedEventsInput,
): Promise<EventRecord[]> {
  const limit = input.limit ?? 50;
  const db = getSupabaseClient();

  if (!db) {
    assertLocalFallbackAvailable();
    return localEvents
      .filter(
        (row) =>
          row.workspace_id === input.workspaceId &&
          row.user_id === input.userId &&
          row.type === "idea.captured",
      )
      .sort(byRecordedAtDesc)
      .slice(0, limit)
      .map((row) => mapRowToEventRecord(cloneRow(row)));
  }

  const { data, error } = await db
    .from("events")
    .select("*")
    .eq("workspace_id", input.workspaceId)
    .eq("user_id", input.userId)
    .eq("type", "idea.captured")
    .order("recorded_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error) {
    throw new EventClientError("list");
  }

  return (data ?? []).map(mapRowToEventRecord);
}

/**
 * Lists daily.direction.generated events for the given workspace/user,
 * optionally filtered to a specific date (payload.dateIso).
 */
export async function listDailyDirectionEvents(
  input: ListDailyDirectionEventsInput,
): Promise<DailyDirectionEventRecord[]> {
  const limit = input.limit ?? 10;
  const db = getSupabaseClient();

  if (!db) {
    assertLocalFallbackAvailable();
    return localEvents
      .filter((row) => {
        if (row.workspace_id !== input.workspaceId) return false;
        if (row.user_id !== input.userId) return false;
        if (row.type !== "daily.direction.generated") return false;
        if (input.dateIso) {
          const payload = row.payload as { dateIso?: string };
          if (payload.dateIso !== input.dateIso) return false;
        }
        return true;
      })
      .sort(byRecordedAtDesc)
      .slice(0, limit)
      .map((row) => mapRowToDailyDirectionRecord(cloneRow(row)));
  }

  let query = db
    .from("events")
    .select("*")
    .eq("workspace_id", input.workspaceId)
    .eq("user_id", input.userId)
    .eq("type", "daily.direction.generated")
    .order("recorded_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  // Supabase supports jsonb path filtering: payload->>'dateIso' = '2026-06-06'
  if (input.dateIso) {
    query = query.filter("payload->>dateIso", "eq", input.dateIso);
  }

  const { data, error } = await query;

  if (error) {
    throw new EventClientError("list");
  }

  return (data ?? []).map(mapRowToDailyDirectionRecord);
}

export function getEventPersistenceMode(): EventPersistenceMode {
  if (getSupabaseClient()) return "supabase";
  return isLocalPersistenceFallbackAllowed() ? "local" : "unavailable";
}

export function __clearCockpitEventsForTests(): void {
  localEvents.length = 0;
}

// Re-export EventPayload for callers that typed against the old union.
export type { EventPayload };
