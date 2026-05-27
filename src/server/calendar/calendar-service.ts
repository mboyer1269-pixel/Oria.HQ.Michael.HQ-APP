import type {
  ActionLedgerStatus,
  CalendarEvent,
  CalendarEventSource,
  ModelMode,
} from "@/features/hq/types";
import { getActiveWorkspaceContext, type WorkspaceContext } from "@/core/workspace-context";
import { skillsCatalog } from "@/features/skills/seed";
import type { SkillProfile } from "@/features/skills/types";
import { LedgerEventValidationError, recordLedgerEvent } from "@/server/actions/ledger-events";
import {
  createCalendarRepository,
  type CalendarRepository,
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
  missionId?: string;
  modelId?: string;
  costMode?: ModelMode;
};

export type CalendarEventWriteResult = {
  event: CalendarEvent;
  ledgerStatus: ActionLedgerStatus;
};

export type CreateCalendarEventOptions = {
  recordLedger?: typeof recordLedgerEvent;
  calendarRepository?: CalendarRepository;
  workspaceContext?: WorkspaceContext;
};

export class CalendarServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code:
      | "CALENDAR_FORBIDDEN"
      | "CALENDAR_CONFIRMATION_REQUIRED"
      | "CALENDAR_WRITE_FAILED"
      | "CALENDAR_LEDGER_FAILED",
  ) {
    super(message);
    this.name = "CalendarServiceError";
  }
}

const calendarBookSkill = skillsCatalog.find((skill) => skill.id === "calendar.book");

function getCalendarBookSkill(): SkillProfile {
  if (!calendarBookSkill) {
    throw new CalendarServiceError(
      "La skill calendrier n'est pas configurée pour l'audit ledger.",
      500,
      "CALENDAR_LEDGER_FAILED",
    );
  }

  return calendarBookSkill;
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

function assertAssistantCanUseCalendarBook(ctx: WorkspaceContext) {
  if (ctx.activeAgentProfile.allowedTools.includes("calendar.book")) return;

  throw new CalendarServiceError(
    "L'assistant actif n'est pas autorise a utiliser calendar.book.",
    403,
    "CALENDAR_FORBIDDEN",
  );
}

type CalendarLedgerEventType = "decision" | "action";

type CalendarLedgerEventInput = {
  eventType: CalendarLedgerEventType;
  summary: string;
  metadata?: Record<string, unknown>;
};

async function recordCalendarLedgerEvent(
  ctx: WorkspaceContext,
  permission: ReturnType<typeof assertCalendarPermission>,
  skill: SkillProfile,
  command: CreateCalendarEventCommand,
  recordLedger: typeof recordLedgerEvent,
  input: CalendarLedgerEventInput,
) {
  await recordLedger(ctx, {
    actionType: "calendar.book",
    eventType: input.eventType,
    summary: input.summary,
    autonomyLevel: permission.autonomyLevel,
    requiresConfirmation: permission.requiresConfirmation,
    workspaceId: ctx.workspace.id,
    modeId: ctx.activeMode.id,
    skillId: skill.id,
    agentId: ctx.activeAgentProfile.id,
    modelId: command.modelId,
    costMode: command.costMode,
    missionId: command.missionId,
    effect: {
      kind: "schedule",
      operation: "create",
      target: "calendar_events",
    },
    ...(input.metadata ? { metadata: input.metadata } : {}),
  }, {
    skill,
  });
}

async function compensateCalendarCreate(
  calendarRepository: CalendarRepository,
  eventId: string,
): Promise<boolean> {
  try {
    return await calendarRepository.deleteById(eventId);
  } catch (error) {
    console.error(
      "Calendar compensation delete failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return false;
  }
}

export async function createCalendarEvent(
  command: CreateCalendarEventCommand,
  options?: CreateCalendarEventOptions,
): Promise<CalendarEventWriteResult> {
  const ctx = options?.workspaceContext ?? getActiveWorkspaceContext();
  assertAssistantCanUseCalendarBook(ctx);
  const permission = assertCalendarPermission(command.confirm);
  const calendarRepository = options?.calendarRepository ?? createCalendarRepository(ctx);
  const skill = getCalendarBookSkill();
  const recordLedger = options?.recordLedger ?? recordLedgerEvent;
  const remindersMinutes = command.remindersMinutes?.length
    ? command.remindersMinutes
    : defaultRemindersMinutes;

  try {
    await recordCalendarLedgerEvent(ctx, permission, skill, command, recordLedger, {
      eventType: "decision",
      summary: `Décision calendrier ${command.dateISO} ${command.startTime}-${command.endTime}`,
    });
  } catch (error) {
    const reason = error instanceof LedgerEventValidationError
      ? error.message
      : "Le ledger d'action n'est pas disponible.";
    console.error("Mandatory decision ledger write failed:", error instanceof Error ? error.message : "Unknown error");

    throw new CalendarServiceError(reason, 503, "CALENDAR_LEDGER_FAILED");
  }

  const event = await calendarRepository.create({
    title: command.title,
    dateISO: command.dateISO,
    startTime: command.startTime,
    endTime: command.endTime,
    source: command.source ?? "api",
    remindersMinutes,
  });

  try {
    await recordCalendarLedgerEvent(ctx, permission, skill, command, recordLedger, {
      eventType: "action",
      summary: `Création calendrier ${event.dateISO} ${event.startTime}-${event.endTime}`,
      metadata: {
        calendarEventId: event.id,
        source: event.source,
        remindersMinutes: event.remindersMinutes,
        storageMode: event.storageMode,
      },
    });
  } catch (error) {
    const reason = error instanceof LedgerEventValidationError
      ? error.message
      : "Le ledger d'action n'est pas disponible.";
    console.error("Mandatory action ledger write failed:", error instanceof Error ? error.message : "Unknown error");

    const compensated = await compensateCalendarCreate(calendarRepository, event.id);

    if (compensated) {
      throw new CalendarServiceError(reason, 503, "CALENDAR_LEDGER_FAILED");
    }

    return {
      event,
      ledgerStatus: "failed",
    };
  }

  return {
    event,
    ledgerStatus: "recorded",
  };
}

export async function listCalendarEvents(input?: ListCalendarEventsInput) {
  const ctx = getActiveWorkspaceContext();
  const calendarRepository = createCalendarRepository(ctx);

  return calendarRepository.list(input);
}
