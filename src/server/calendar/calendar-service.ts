import type {
  ActionLedgerStatus,
  CalendarEvent,
  CalendarEventSource,
  ModelMode,
} from "@/features/hq/types";
import { createActionLedgerRepository } from "@/server/actions/action-ledger-repository";
import { getServerUserContext } from "@/server/auth/user-context";
import {
  createCalendarRepository,
  type ListCalendarEventsInput,
} from "@/server/calendar/calendar-repository";
import { checkPermission } from "@/server/permissions/permissions";

const defaultRemindersMinutes = [60, 15];

export type CreateCalendarEventCommand = {
  title: string;
  dateISO: string;
  startTime: string;
  endTime: string;
  source?: CalendarEventSource;
  remindersMinutes?: number[];
  notes?: string;
  confirm?: boolean;
  modelId?: string;
  costMode?: ModelMode;
};

export type CalendarEventWriteResult = {
  event: CalendarEvent;
  ledgerStatus: ActionLedgerStatus;
};

export class CalendarServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: "CALENDAR_FORBIDDEN" | "CALENDAR_CONFIRMATION_REQUIRED" | "CALENDAR_WRITE_FAILED",
  ) {
    super(message);
    this.name = "CalendarServiceError";
  }
}

function assertCalendarPermission(confirm?: boolean) {
  const permission = checkPermission("calendar-simple");

  if (!permission.allowed) {
    throw new CalendarServiceError(permission.reason, 403, "CALENDAR_FORBIDDEN");
  }

  if (permission.requiresConfirmation && !confirm) {
    throw new CalendarServiceError(permission.reason, 409, "CALENDAR_CONFIRMATION_REQUIRED");
  }

  return permission;
}

export async function createCalendarEvent(command: CreateCalendarEventCommand): Promise<CalendarEventWriteResult> {
  const permission = assertCalendarPermission(command.confirm);
  const user = getServerUserContext();
  const calendarRepository = createCalendarRepository(user);
  const actionLedgerRepository = createActionLedgerRepository(user);
  const remindersMinutes = command.remindersMinutes?.length
    ? command.remindersMinutes
    : defaultRemindersMinutes;

  const event = await calendarRepository.create({
    title: command.title,
    dateISO: command.dateISO,
    startTime: command.startTime,
    endTime: command.endTime,
    source: command.source ?? "api",
    remindersMinutes,
  });

  let ledgerStatus: ActionLedgerStatus = "recorded";

  try {
    await actionLedgerRepository.record({
      actionType: "calendar.book",
      summary: `Création calendrier: ${event.title} ${event.dateISO} ${event.startTime}-${event.endTime}`,
      autonomyLevel: permission.autonomyLevel,
      requiresConfirmation: permission.requiresConfirmation,
      modelId: command.modelId,
      costMode: command.costMode,
      metadata: {
        calendarEventId: event.id,
        source: event.source,
        notes: command.notes ?? null,
        remindersMinutes: event.remindersMinutes,
        storageMode: event.storageMode,
      },
    });
  } catch (error) {
    ledgerStatus = "failed";
    console.error("Action ledger write failed:", error instanceof Error ? error.message : "Unknown error");
  }

  return {
    event,
    ledgerStatus,
  };
}

export async function listCalendarEvents(input?: ListCalendarEventsInput) {
  const user = getServerUserContext();
  const calendarRepository = createCalendarRepository(user);

  return calendarRepository.list(input);
}
