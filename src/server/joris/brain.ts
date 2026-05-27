import type { CommandResult, JorisIntent, MissionPlanResult } from "@/features/hq/types";
import { getActiveWorkspaceContext, type WorkspaceContext } from "@/core/workspace-context";
import { chooseModel } from "@/server/ai/model-router";
import { buildCeoBriefSnapshot } from "@/server/brief/ceo-brief-service";
import { parseCalendarIntent } from "@/server/calendar/intent-parser";
import { CalendarServiceError, createCalendarEvent } from "@/server/calendar/calendar-service";
import { checkPermission } from "@/server/permissions/permissions";
import {
  buildDryRunMissionExecutionPlan,
  listMissionsForWorkspace,
  resolveMissionFromText,
} from "@/server/missions";
import { classifyMissionDraftReply } from "@/server/missions/mission-draft-confirmation";
import {
  buildMissionDraftFromCalendar,
  createMissionDraftId,
  formatMissionDraftProposalSummary,
} from "@/server/missions/mission-draft-builder";
import { createLocalMissionDraft } from "@/server/missions/mission-draft-repository";
import {
  cacheMissionDraftConfirmation,
  clearPendingMissionDraft,
  getCachedMissionDraftConfirmation,
  getPendingMissionDraft,
  isPendingMissionDraftExpired,
  setPendingMissionDraft,
} from "@/server/missions/mission-draft-session";
import { detectIntent } from "@/server/joris/detect-intent";

function buildFallbackSummary(intent: JorisIntent, message: string) {
  if (intent === "board.consult") {
    return "Je vais traiter ça comme une décision stratégique: Board activé, synthèse par Joris, puis une seule action prioritaire. La connexion modèle premium sera branchée côté serveur ensuite.";
  }

  if (intent === "opportunity.score") {
    return "Je capte une opportunité business. Je vais la scorer sur revenu, effort, focus, risque et vitesse de test avant de la mettre dans l’Opportunity Log.";
  }

  return `Reçu, CEO. Je garde ça en contexte et je le traiterai en français québécois canadien: ${message}`;
}

async function handleMissionDraftReply(
  message: string,
  ctx: WorkspaceContext,
  route: ReturnType<typeof chooseModel>,
  workspaceMeta: Pick<CommandResult, "workspaceId" | "modeId" | "assistantId">,
): Promise<CommandResult | null> {
  const replyKind = classifyMissionDraftReply(message);
  if (replyKind === "none") return null;

  const pending = getPendingMissionDraft(ctx.workspace.id, ctx.userId);

  if (replyKind === "cancel") {
    if (pending) {
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

    return {
      intent: "chat",
      summary: "Il n'y a aucune mission draft en attente à annuler.",
      modelId: route.model.id,
      costMode: route.mode,
      ...workspaceMeta,
      requiresConfirmation: false,
    };
  }

  if (replyKind === "ambiguous") {
    if (pending) {
      return {
        intent: "mission.draft",
        summary:
          "Ta réponse mélange confirmation et nouvelle demande calendrier. Réponds seulement « confirme », « oui » ou « go » pour booker la mission draft en cours, ou « annule » pour abandonner.",
        modelId: route.model.id,
        costMode: route.mode,
        ...workspaceMeta,
        missionDraftPreview: pending.preview,
        pendingDraftId: pending.pendingDraftId,
        requiresConfirmation: true,
      };
    }

    return null;
  }

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

export async function runJorisCommand(
  message: string,
  workspaceContext: WorkspaceContext = getActiveWorkspaceContext(),
): Promise<CommandResult> {
  const ctx = workspaceContext;
  const route = chooseModel({
    message,
    highImpact: false,
  });

  const workspaceMeta = {
    workspaceId: ctx.workspace.id,
    modeId: ctx.activeMode.id,
    assistantId: ctx.activeAgentProfile.id,
  };

  const draftReplyResult = await handleMissionDraftReply(message, ctx, route, workspaceMeta);
  if (draftReplyResult) {
    return draftReplyResult;
  }

  const intent = detectIntent(message);
  const routedModel = chooseModel({
    message,
    highImpact: intent === "board.consult" || intent === "opportunity.score",
  });

  if (intent === "brief.generate") {
    const brief = await buildCeoBriefSnapshot();

    return {
      intent,
      summary: `${brief.headline} ${brief.focusLine}`,
      modelId: routedModel.model.id,
      costMode: routedModel.mode,
      ...workspaceMeta,
      requiresConfirmation: false,
    };
  }

  if (intent === "calendar.book") {
    const calendarIntent = parseCalendarIntent(message);
    const permission = checkPermission("calendar-simple");

    if (!permission.allowed) {
      return {
        intent,
        summary: `Je ne peux pas exécuter cette action sans confirmation: ${permission.reason}`,
        modelId: routedModel.model.id,
        costMode: routedModel.mode,
        ...workspaceMeta,
        requiresConfirmation: true,
      };
    }

    if (calendarIntent) {
      const pending = setPendingMissionDraft({
        workspaceId: ctx.workspace.id,
        userId: ctx.userId,
        calendarIntent,
        modelId: routedModel.model.id,
        costMode: routedModel.mode,
      });

      return {
        intent: "mission.draft",
        summary: formatMissionDraftProposalSummary(pending.preview),
        modelId: routedModel.model.id,
        costMode: routedModel.mode,
        ...workspaceMeta,
        calendarIntent,
        missionDraftPreview: pending.preview,
        pendingDraftId: pending.pendingDraftId,
        requiresConfirmation: true,
      };
    }

    return {
      intent,
      summary: "Il me manque l’heure ou la date pour booker ça proprement. Donne-moi au moins l’heure, puis je le crée sans friction.",
      modelId: routedModel.model.id,
      costMode: routedModel.mode,
      ...workspaceMeta,
      requiresConfirmation: false,
    };
  }

  if (intent === "mission.plan") {
    const { missions } = await listMissionsForWorkspace({
      workspaceId: ctx.workspace.id,
      modeId: ctx.activeMode.id,
    });

    const resolved = resolveMissionFromText(message, missions);

    if (!resolved.found) {
      if (resolved.reason === "ambiguous") {
        const list = resolved.candidates.map((m) => `• "${m.title}" (${m.id})`).join("\n");
        return {
          intent,
          summary: `Plusieurs missions correspondent. Précise laquelle :\n${list}`,
          modelId: routedModel.model.id,
          costMode: routedModel.mode,
          ...workspaceMeta,
          requiresConfirmation: false,
        };
      }
      const available = resolved.available
        .map((m) => `• "${m.title}" — ${m.status} (${m.id})`)
        .join("\n");
      return {
        intent,
        summary: available
          ? `Aucune mission trouvée pour ta demande. Missions disponibles :\n${available}`
          : "Aucune mission active dans ce workspace.",
        modelId: routedModel.model.id,
        costMode: routedModel.mode,
        ...workspaceMeta,
        requiresConfirmation: false,
      };
    }

    const { mission } = resolved;

    const planResult = buildDryRunMissionExecutionPlan({
      mission,
      mode: "dry_run",
      approvalConfirmed: false,
    });

    const missionPlanResult: MissionPlanResult = planResult.allowed
      ? {
          allowed: true,
          missionId: mission.id,
          stepCount: planResult.plan.steps.length,
          estimatedAutonomyCost: planResult.plan.estimatedAutonomyCost,
        }
      : {
          allowed: false,
          missionId: mission.id,
          blockReasons: planResult.blockReasons,
        };

    const summary = planResult.allowed
      ? [
          `Plan dry-run pour "${mission.title}" :`,
          `- ${planResult.plan.steps.length} étape(s) planifiée(s)`,
          `- Coût autonomie estimé : ${planResult.plan.estimatedAutonomyCost}/5`,
          `- Approbation requise : ${planResult.approvalEvaluation.required ? "oui" : "non"}`,
          `→ Prêt à exécuter sur confirmation explicite uniquement.`,
        ].join("\n")
      : [
          `Mission "${mission.title}" bloquée :`,
          ...planResult.blockReasons.map((r) => `- ${r}`),
          `→ Ce plan ne peut pas être exécuté dans l'état actuel.`,
        ].join("\n");

    return {
      intent,
      summary,
      modelId: routedModel.model.id,
      costMode: routedModel.mode,
      ...workspaceMeta,
      requiresConfirmation: true,
      missionPlanResult,
    };
  }

  return {
    intent,
    summary: buildFallbackSummary(intent, message),
    modelId: routedModel.model.id,
    costMode: routedModel.mode,
    ...workspaceMeta,
    requiresConfirmation: false,
  };
}
