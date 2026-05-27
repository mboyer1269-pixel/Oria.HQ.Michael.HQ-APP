import type { Mission } from "@/core/types";
import type { WorkspaceContext } from "@/core/workspace-context";
import type { CalendarIntent, MissionDraftPreview } from "@/features/hq/types";
import type { CreateCalendarEventCommand } from "@/server/calendar/calendar-service";

export const MISSION_DRAFT_TTL_MS = 10 * 60 * 1000;

export function createPendingDraftId(): string {
  return `pending_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createMissionDraftId(): string {
  return `mission_draft_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function buildCalendarCommandFromIntent(
  calendarIntent: CalendarIntent,
  modelId?: string,
  costMode?: CreateCalendarEventCommand["costMode"],
): CreateCalendarEventCommand {
  return {
    title: calendarIntent.title,
    dateISO: calendarIntent.dateISO,
    startTime: calendarIntent.startTime,
    endTime: calendarIntent.endTime,
    source: "joris",
    remindersMinutes: calendarIntent.remindersMinutes,
    notes: calendarIntent.notes,
    modelId,
    costMode,
  };
}

export function buildMissionDraftPreview(input: {
  pendingDraftId: string;
  calendarIntent: CalendarIntent;
  expiresAt: string;
}): MissionDraftPreview {
  return {
    pendingDraftId: input.pendingDraftId,
    title: input.calendarIntent.title,
    objective: `Booker ${input.calendarIntent.title} le ${input.calendarIntent.dateISO} de ${input.calendarIntent.startTime} à ${input.calendarIntent.endTime}.`,
    skillId: "calendar.book",
    actionType: "calendar.book",
    scheduledAt: {
      dateISO: input.calendarIntent.dateISO,
      startTime: input.calendarIntent.startTime,
      endTime: input.calendarIntent.endTime,
    },
    expiresAt: input.expiresAt,
  };
}

export function buildMissionDraftFromCalendar(input: {
  missionId: string;
  calendarIntent: CalendarIntent;
  ctx: WorkspaceContext;
  pendingDraftId: string;
}): Mission {
  const now = new Date().toISOString();

  return {
    id: input.missionId,
    workspaceId: input.ctx.workspace.id,
    modeId: input.ctx.activeMode.id,
    title: input.calendarIntent.title,
    objective: `Booker ${input.calendarIntent.title} le ${input.calendarIntent.dateISO} de ${input.calendarIntent.startTime} à ${input.calendarIntent.endTime}.`,
    assignedAgentId: input.ctx.activeAgentProfile.id,
    autonomyLevel: 2,
    status: "draft",
    riskLevel: "low",
    input: {
      skillId: "calendar.book",
      actionType: "calendar.book",
      pendingDraftId: input.pendingDraftId,
      calendarIntent: input.calendarIntent,
    },
    expectedOutput: "Événement calendrier créé et lié à la mission.",
    requiresApproval: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function formatMissionDraftProposalSummary(preview: MissionDraftPreview): string {
  const schedule = preview.scheduledAt
    ? `${preview.scheduledAt.dateISO} de ${preview.scheduledAt.startTime} à ${preview.scheduledAt.endTime}`
    : "horaire à confirmer";

  return [
    `Mission draft proposée pour calendar.book : "${preview.title}".`,
    `Créneau : ${schedule}.`,
    "Réponds « confirme », « oui » ou « go » pour créer la mission et booker le rendez-vous.",
    "Réponds « annule » pour abandonner.",
  ].join(" ");
}
