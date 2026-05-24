import type {
  CalendarEvent,
  CalendarEventSource,
  CalendarStorageMode,
} from "@/features/hq/types";
import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import type { ServerUserContext } from "@/server/auth/user-context";
import { createOptionalSupabaseAdminClient, hasSupabaseAdminConfig } from "@/server/supabase/admin";
import type { CalendarEventRow } from "@/server/db/types";

export type CreateCalendarEventInput = {
  title: string;
  dateISO: string;
  startTime: string;
  endTime: string;
  source: CalendarEventSource;
  remindersMinutes: number[];
};

export type ListCalendarEventsInput = {
  limit?: number;
  fromDateISO?: string;
  toDateISO?: string;
};

export type CalendarRepository = {
  mode: CalendarStorageMode;
  create(input: CreateCalendarEventInput): Promise<CalendarEvent>;
  list(input?: ListCalendarEventsInput): Promise<CalendarEvent[]>;
  deleteById(eventId: string): Promise<boolean>;
};

export class CalendarRepositoryError extends Error {
  constructor(
    message: string,
    public readonly code: "CALENDAR_READ_FAILED" | "CALENDAR_WRITE_FAILED",
  ) {
    super(message);
    this.name = "CalendarRepositoryError";
  }
}

const localEvents: CalendarEvent[] = [];

function createLocalId() {
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTime(value: string) {
  return value.slice(0, 5);
}

function normalizeSource(value: string): CalendarEventSource {
  if (value === "api" || value === "joris" || value === "internal") return value;

  return "internal";
}

function mapCalendarRow(row: CalendarEventRow, storageMode: CalendarStorageMode): CalendarEvent {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    dateISO: row.date_iso,
    startTime: normalizeTime(row.start_time),
    endTime: normalizeTime(row.end_time),
    source: normalizeSource(row.source),
    remindersMinutes: row.reminders_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    storageMode,
  };
}

function sortEvents(events: CalendarEvent[]) {
  return [...events].sort((left, right) => {
    const leftKey = `${left.dateISO}T${left.startTime}`;
    const rightKey = `${right.dateISO}T${right.startTime}`;

    return leftKey.localeCompare(rightKey);
  });
}

function createLocalCalendarRepository(user: ServerUserContext): CalendarRepository {
  return {
    mode: "local",
    async create(input) {
      const timestamp = new Date().toISOString();
      const event: CalendarEvent = {
        id: createLocalId(),
        userId: user.userId,
        title: input.title,
        dateISO: input.dateISO,
        startTime: input.startTime,
        endTime: input.endTime,
        source: input.source,
        remindersMinutes: input.remindersMinutes,
        createdAt: timestamp,
        updatedAt: timestamp,
        storageMode: "local",
      };

      localEvents.push(event);

      return event;
    },
    async list(input = {}) {
      const limit = input.limit ?? 20;
      const filtered = localEvents.filter((event) => {
        if (event.userId !== user.userId) return false;
        if (input.fromDateISO && event.dateISO < input.fromDateISO) return false;
        if (input.toDateISO && event.dateISO > input.toDateISO) return false;

        return true;
      });

      return sortEvents(filtered).slice(0, limit);
    },
    async deleteById(eventId) {
      const index = localEvents.findIndex(
        (event) => event.id === eventId && event.userId === user.userId,
      );

      if (index === -1) {
        return false;
      }

      localEvents.splice(index, 1);

      return true;
    },
  };
}

function createSupabaseCalendarRepository(user: ServerUserContext): CalendarRepository {
  const supabase = createOptionalSupabaseAdminClient();

  if (!supabase) {
    return createLocalCalendarRepository(user);
  }

  return {
    mode: "supabase",
    async create(input) {
      const { data, error } = await supabase
        .from("calendar_events")
        .insert({
          user_id: user.userId,
          title: input.title,
          date_iso: input.dateISO,
          start_time: input.startTime,
          end_time: input.endTime,
          source: input.source,
          reminders_minutes: input.remindersMinutes,
        })
        .select()
        .single();

      if (error) {
        throw new CalendarRepositoryError(error.message, "CALENDAR_WRITE_FAILED");
      }

      return mapCalendarRow(data, "supabase");
    },
    async list(input = {}) {
      let query = supabase
        .from("calendar_events")
        .select("*")
        .eq("user_id", user.userId)
        .order("date_iso", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(input.limit ?? 20);

      if (input.fromDateISO) {
        query = query.gte("date_iso", input.fromDateISO);
      }

      if (input.toDateISO) {
        query = query.lte("date_iso", input.toDateISO);
      }

      const { data, error } = await query;

      if (error) {
        throw new CalendarRepositoryError(error.message, "CALENDAR_READ_FAILED");
      }

      return data.map((row) => mapCalendarRow(row, "supabase"));
    },
    async deleteById(eventId) {
      const { data, error } = await supabase
        .from("calendar_events")
        .delete()
        .eq("id", eventId)
        .eq("user_id", user.userId)
        .select("id")
        .maybeSingle();

      if (error) {
        throw new CalendarRepositoryError(error.message, "CALENDAR_WRITE_FAILED");
      }

      return Boolean(data);
    },
  };
}

function createUnavailableCalendarRepository(): CalendarRepository {
  return {
    mode: "local",
    async create() {
      throw new CalendarRepositoryError(
        "Supabase configuration is required for calendar persistence in production.",
        "CALENDAR_WRITE_FAILED",
      );
    },
    async list() {
      throw new CalendarRepositoryError(
        "Supabase configuration is required for calendar persistence in production.",
        "CALENDAR_READ_FAILED",
      );
    },
    async deleteById() {
      return false;
    },
  };
}

export function createCalendarRepository(user: ServerUserContext): CalendarRepository {
  if (user.storagePreference === "supabase" && hasSupabaseAdminConfig()) {
    return createSupabaseCalendarRepository(user);
  }

  if (!isLocalPersistenceFallbackAllowed()) {
    return createUnavailableCalendarRepository();
  }

  return createLocalCalendarRepository(user);
}
