import type { CommandResult, JorisIntent } from "@/features/hq/types";
import { chooseModel } from "@/server/ai/model-router";
import { parseCalendarIntent } from "@/server/calendar/intent-parser";
import { CalendarServiceError, createCalendarEvent } from "@/server/calendar/calendar-service";
import { checkPermission } from "@/server/permissions/permissions";

function detectIntent(message: string): JorisIntent {
  const lower = message.toLowerCase();

  if (lower.includes("book") || lower.includes("rendez-vous") || lower.includes("rdv")) {
    return "calendar.book";
  }

  if (lower.includes("rappelle-moi") || lower.includes("rappel")) {
    return "calendar.remind";
  }

  if (lower.includes("board") || lower.includes("comité") || lower.includes("hormozi")) {
    return "board.consult";
  }

  if (lower.includes("idée") || lower.includes("opportunité") || lower.includes("business")) {
    return "opportunity.score";
  }

  return "chat";
}

function buildFallbackSummary(intent: JorisIntent, message: string) {
  if (intent === "board.consult") {
    return "Je vais traiter ça comme une décision stratégique: Board activé, synthèse par Joris, puis une seule action prioritaire. La connexion modèle premium sera branchée côté serveur ensuite.";
  }

  if (intent === "opportunity.score") {
    return "Je capte une opportunité business. Je vais la scorer sur revenu, effort, focus, risque et vitesse de test avant de la mettre dans l’Opportunity Log.";
  }

  return `Reçu, CEO. Je garde ça en contexte et je le traiterai en français québécois canadien: ${message}`;
}

export async function runJorisCommand(message: string): Promise<CommandResult> {
  const intent = detectIntent(message);
  const route = chooseModel({
    message,
    highImpact: intent === "board.consult" || intent === "opportunity.score",
  });

  if (intent === "calendar.book") {
    const calendarIntent = parseCalendarIntent(message);
    const permission = checkPermission("calendar-simple");

    if (!permission.allowed) {
      return {
        intent,
        summary: `Je ne peux pas exécuter cette action sans confirmation: ${permission.reason}`,
        modelId: route.model.id,
        costMode: route.mode,
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
      requiresConfirmation: false,
    };
  }

  return {
    intent,
    summary: buildFallbackSummary(intent, message),
    modelId: route.model.id,
    costMode: route.mode,
    requiresConfirmation: false,
  };
}
