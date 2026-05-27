import type { CommandResult } from "@/features/hq/types";
import type { WorkspaceContext } from "@/core/workspace-context";
import { chooseModel } from "@/server/ai/model-router";
import { CalendarServiceError, createCalendarEvent } from "@/server/calendar/calendar-service";
import { checkPermission } from "@/server/permissions/permissions";
import {
  buildMissionDraftFromCalendar,
  createMissionDraftId,
} from "@/server/missions/mission-draft-builder";
import { createLocalMissionDraft } from "@/server/missions/mission-draft-repository";
import {
  cacheMissionDraftConfirmation,
  clearPendingMissionDraft,
  getCachedMissionDraftConfirmation,
  getPendingMissionDraft,
  isPendingMissionDraftExpired,
} from "@/server/missions/mission-draft-session";
import type { MissionDraftPreview } from "@/features/hq/types";

export type MissionDraftPendingStatus = "none" | "active" | "expired";

export type MissionDraftPendingView = {
  status: MissionDraftPendingStatus;
  pendingDraftId?: string;
  preview?: MissionDraftPreview;
  expiresAt?: string;
  /** Milliseconds until expiry when status is active. */
  remainingMs?: number;
  skillId?: "calendar.book";
};

export type MissionDraftControlOptions = {
  pendingDraftId?: string;
};

function buildWorkspaceMeta(ctx: WorkspaceContext): Pick<CommandResult, "workspaceId" | "modeId" | "assistantId"> {
  return {
    workspaceId: ctx.workspace.id,
    modeId: ctx.activeMode.id,
    assistantId: ctx.activeAgentProfile.id,
  };
}

function buildRoute(message: string) {
  return chooseModel({
    message,
    highImpact: false,
  });
}

function assertPendingDraftId(
  pending: { pendingDraftId: string },
  expectedId: string | undefined,
): CommandResult | null {
  if (!expectedId || pending.pendingDraftId === expectedId) {
    return null;
  }

  return {
    intent: "mission.draft",
    summary: "Cette proposition ne correspond plus au brouillon en attente. Rafraîchis la page et réessaie.",
    requiresConfirmation: true,
    pendingDraftId: pending.pendingDraftId,
  };
}

export function getMissionDraftPendingView(ctx: WorkspaceContext): MissionDraftPendingView {
  const pending = getPendingMissionDraft(ctx.workspace.id, ctx.userId);

  if (!pending) {
    return { status: "none" };
  }

  if (isPendingMissionDraftExpired(pending)) {
    const preview = pending.preview;
    const expiresAt = pending.expiresAt;
    clearPendingMissionDraft(ctx.workspace.id, ctx.userId);
    return {
      status: "expired",
      pendingDraftId: pending.pendingDraftId,
      preview,
      expiresAt,
      skillId: pending.skillId,
    };
  }

  const remainingMs = Math.max(0, Date.parse(pending.expiresAt) - Date.now());

  return {
    status: "active",
    pendingDraftId: pending.pendingDraftId,
    preview: pending.preview,
    expiresAt: pending.expiresAt,
    remainingMs,
    skillId: pending.skillId,
  };
}

export function cancelPendingMissionDraft(
  ctx: WorkspaceContext,
  options: MissionDraftControlOptions = {},
): CommandResult {
  const route = buildRoute("annule");
  const workspaceMeta = buildWorkspaceMeta(ctx);
  const pending = getPendingMissionDraft(ctx.workspace.id, ctx.userId);

  if (!pending) {
    return {
      intent: "chat",
      summary: "Il n'y a aucune mission draft en attente à annuler.",
      modelId: route.model.id,
      costMode: route.mode,
      ...workspaceMeta,
      requiresConfirmation: false,
    };
  }

  const mismatch = assertPendingDraftId(pending, options.pendingDraftId);
  if (mismatch) {
    return {
      ...mismatch,
      modelId: route.model.id,
      costMode: route.mode,
      ...workspaceMeta,
      missionDraftPreview: pending.preview,
    };
  }

  clearPendingMissionDraft(ctx.workspace.id, ctx.userId);

  return {
    intent: "mission.draft",
    summary: "Mission draft annulée. Tu peux reformuler un nouveau rendez-vous quand tu veux.",
    modelId: route.model.id,
    costMode: route.mode,
    ...workspaceMeta,
    requiresConfirmation: false,
  };
}

export async function confirmPendingMissionDraft(
  ctx: WorkspaceContext,
  options: MissionDraftControlOptions = {},
): Promise<CommandResult> {
  const route = buildRoute("confirme");
  const workspaceMeta = buildWorkspaceMeta(ctx);
  const pending = getPendingMissionDraft(ctx.workspace.id, ctx.userId);

  if (!pending) {
    return {
      intent: "chat",
      summary: "Il n'y a rien à confirmer pour l'instant. Propose d'abord un rendez-vous à booker.",
      modelId: route.model.id,
      costMode: route.mode,
      ...workspaceMeta,
      requiresConfirmation: false,
    };
  }

  const mismatch = assertPendingDraftId(pending, options.pendingDraftId);
  if (mismatch) {
    return {
      ...mismatch,
      modelId: route.model.id,
      costMode: route.mode,
      ...workspaceMeta,
      missionDraftPreview: pending.preview,
      requiresConfirmation: true,
    };
  }

  const cachedBeforeBook = getCachedMissionDraftConfirmation(pending.pendingDraftId);
  if (cachedBeforeBook) {
    clearPendingMissionDraft(ctx.workspace.id, ctx.userId);
    return {
      intent: "calendar.book",
      summary: cachedBeforeBook.summary,
      modelId: route.model.id,
      costMode: route.mode,
      ...workspaceMeta,
      pendingDraftId: cachedBeforeBook.pendingDraftId,
      missionId: cachedBeforeBook.missionId,
      requiresConfirmation: false,
    };
  }

  if (isPendingMissionDraftExpired(pending)) {
    clearPendingMissionDraft(ctx.workspace.id, ctx.userId);
    return {
      intent: "mission.draft",
      summary:
        "La mission draft a expiré. Reformule le rendez-vous à booker (date et heure) pour que je prépare une nouvelle proposition.",
      modelId: route.model.id,
      costMode: route.mode,
      ...workspaceMeta,
      requiresConfirmation: false,
    };
  }

  if (pending.skillId !== "calendar.book" || pending.actionType !== "calendar.book") {
    return {
      intent: "mission.draft",
      summary: "La mission draft en attente ne correspond pas à calendar.book. Reformule ta demande.",
      modelId: route.model.id,
      costMode: route.mode,
      ...workspaceMeta,
      requiresConfirmation: false,
    };
  }

  const permission = checkPermission("calendar-simple");
  if (!permission.allowed) {
    return {
      intent: "calendar.book",
      summary: `Je ne peux pas exécuter cette action sans confirmation: ${permission.reason}`,
      modelId: route.model.id,
      costMode: route.mode,
      ...workspaceMeta,
      missionDraftPreview: pending.preview,
      pendingDraftId: pending.pendingDraftId,
      requiresConfirmation: true,
    };
  }

  const missionId = createMissionDraftId();
  const missionDraft = buildMissionDraftFromCalendar({
    missionId,
    calendarIntent: pending.calendarIntent,
    ctx,
    pendingDraftId: pending.pendingDraftId,
  });

  createLocalMissionDraft(missionDraft);

  try {
    const { event, ledgerStatus } = await createCalendarEvent(
      {
        ...pending.calendarCommand,
        confirm: true,
        missionId,
      },
      {
        workspaceContext: ctx,
      },
    );

    const summary = `Confirmé, CEO: mission ${missionId} créée et ${event.title} booké ${event.dateISO} de ${event.startTime} à ${event.endTime}.`;
    cacheMissionDraftConfirmation({
      pendingDraftId: pending.pendingDraftId,
      missionId,
      calendarEventId: event.id,
      summary,
    });
    clearPendingMissionDraft(ctx.workspace.id, ctx.userId);

    const ledgerSummary =
      ledgerStatus === "recorded" ? "Action journalisée." : "Événement créé, ledger à rejournaliser.";
    const storageSummary =
      event.storageMode === "supabase" ? "Source de vérité Supabase." : "Stockage local de session.";

    return {
      intent: "calendar.book",
      summary: `${summary} ${ledgerSummary} ${storageSummary}`,
      modelId: route.model.id,
      costMode: route.mode,
      ...workspaceMeta,
      calendarIntent: pending.calendarIntent,
      calendarEvent: event,
      ledgerStatus,
      storageMode: event.storageMode,
      missionDraftPreview: pending.preview,
      pendingDraftId: pending.pendingDraftId,
      missionId,
      requiresConfirmation: false,
    };
  } catch (error) {
    if (error instanceof CalendarServiceError) {
      return {
        intent: "calendar.book",
        summary: `Je ne peux pas booker ce rendez-vous tout de suite: ${error.message}`,
        modelId: route.model.id,
        costMode: route.mode,
        ...workspaceMeta,
        missionDraftPreview: pending.preview,
        pendingDraftId: pending.pendingDraftId,
        missionId,
        calendarIntent: pending.calendarIntent,
        requiresConfirmation: error.code === "CALENDAR_CONFIRMATION_REQUIRED",
      };
    }

    throw error;
  }
}
