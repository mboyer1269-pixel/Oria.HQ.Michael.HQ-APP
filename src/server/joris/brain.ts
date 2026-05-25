import type { CommandResult, JorisIntent, MissionPlanResult } from "@/features/hq/types";
import { getActiveWorkspaceContext, type WorkspaceContext } from "@/core/workspace-context";
import { chooseModel } from "@/server/ai/model-router";
import { buildCeoBriefSnapshot } from "@/server/brief/ceo-brief-service";
import { parseCalendarIntent } from "@/server/calendar/intent-parser";
import { CalendarServiceError, createCalendarEvent } from "@/server/calendar/calendar-service";
import { checkPermission } from "@/server/permissions/permissions";
import { buildDryRunMissionExecutionPlan, listMissionsForWorkspace, resolveMissionFromText } from "@/server/missions";
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

export async function runJorisCommand(
  message: string,
  workspaceContext: WorkspaceContext = getActiveWorkspaceContext(),
): Promise<CommandResult> {
  const intent = detectIntent(message);
  const ctx = workspaceContext;
  const route = chooseModel({
    message,
    highImpact: intent === "board.consult" || intent === "opportunity.score",
  });

  const workspaceMeta = {
    workspaceId: ctx.workspace.id,
    modeId: ctx.activeMode.id,
    assistantId: ctx.activeAgentProfile.id,
  };

  if (intent === "brief.generate") {
    const brief = await buildCeoBriefSnapshot();

    return {
      intent,
      summary: `${brief.headline} ${brief.focusLine}`,
      modelId: route.model.id,
      costMode: route.mode,
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
        modelId: route.model.id,
        costMode: route.mode,
        ...workspaceMeta,
        requiresConfirmation: true,
      };
    }

    if (calendarIntent) {
      try {
        const { event, ledgerStatus } = await createCalendarEvent({
          title: calendarIntent.title,
          dateISO: calendarIntent.dateISO,
          startTime: calendarIntent.startTime,
          endTime: calendarIntent.endTime,
          source: "joris",
          remindersMinutes: calendarIntent.remindersMinutes,
          notes: calendarIntent.notes,
          modelId: route.model.id,
          costMode: route.mode,
        }, {
          workspaceContext: ctx,
        });
        const ledgerSummary =
          ledgerStatus === "recorded" ? "Action journalisée." : "Événement créé, ledger à rejournaliser.";
        const storageSummary =
          event.storageMode === "supabase" ? "Source de vérité Supabase." : "Stockage local de session.";

        return {
          intent,
          summary: `Booké, CEO: ${event.title} ${event.dateISO} de ${event.startTime} à ${event.endTime}. Rappels ${event.remindersMinutes.join(" min et ")} min avant. ${ledgerSummary} ${storageSummary}`,
          modelId: route.model.id,
          costMode: route.mode,
          ...workspaceMeta,
          calendarIntent,
          calendarEvent: event,
          ledgerStatus,
          storageMode: event.storageMode,
          requiresConfirmation: calendarIntent.needsConfirmation || permission.requiresConfirmation,
        };
      } catch (error) {
        if (error instanceof CalendarServiceError) {
          return {
            intent,
            summary: `Je ne peux pas booker ce rendez-vous tout de suite: ${error.message}`,
            modelId: route.model.id,
            costMode: route.mode,
            ...workspaceMeta,
            calendarIntent,
            requiresConfirmation: error.code === "CALENDAR_CONFIRMATION_REQUIRED",
          };
        }

        throw error;
      }
    }

    return {
      intent,
      summary: "Il me manque l’heure ou la date pour booker ça proprement. Donne-moi au moins l’heure, puis je le crée sans friction.",
      modelId: route.model.id,
      costMode: route.mode,
      ...workspaceMeta,
      requiresConfirmation: false,
    };
  }

  if (intent === "mission.plan") {
    const { missions } = await listMissionsForWorkspace({
      workspaceId: ctx.workspace.id,
      modeId: ctx.activeMode.id,
    });

    // Resolve mission server-side — caller cannot inject mission data.
    const resolved = resolveMissionFromText(message, missions);

    if (!resolved.found) {
      if (resolved.reason === "ambiguous") {
        const list = resolved.candidates.map((m) => `• "${m.title}" (${m.id})`).join("\n");
        return {
          intent,
          summary: `Plusieurs missions correspondent. Précise laquelle :\n${list}`,
          modelId: route.model.id,
          costMode: route.mode,
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
        modelId: route.model.id,
        costMode: route.mode,
        ...workspaceMeta,
        requiresConfirmation: false,
      };
    }

    const { mission } = resolved;

    // approvalConfirmed is NEVER set to true by Joris.
    // Joris surfaces the plan; the user must confirm explicitly through a separate action.
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
      modelId: route.model.id,
      costMode: route.mode,
      ...workspaceMeta,
      // requiresConfirmation is always true for mission.plan — Joris never auto-executes.
      requiresConfirmation: true,
      missionPlanResult,
    };
  }

  return {
    intent,
    summary: buildFallbackSummary(intent, message),
    modelId: route.model.id,
    costMode: route.mode,
    ...workspaceMeta,
    requiresConfirmation: false,
  };
}
