import type { CalendarEvent, CommandResult, MissionDraftPreview } from "@/features/hq/types";

export const MISSION_DRAFT_CHANGED_EVENT = "michael-hq:mission-draft-changed";

/** Auto-dismiss for the neutral “Proposition refusée” banner (ms). */
export const MISSION_DRAFT_CANCELLED_BANNER_MS = 8_000;

export const MISSION_DRAFT_UNAVAILABLE_NO_PENDING =
  "Aucune proposition active à confirmer.";

export const MISSION_DRAFT_UNAVAILABLE_MISMATCH =
  "Cette proposition ne correspond plus au brouillon en attente. Rafraîchis la page et réessaie.";

export const MISSION_DRAFT_CANCELLED_LABEL = "Proposition refusée";

export type MissionDraftPendingClientView = {
  status: "none" | "active" | "expired";
  pendingDraftId?: string;
  preview?: MissionDraftPreview;
  expiresAt?: string;
  remainingMs?: number;
  skillId?: "calendar.book";
};

export type MissionDraftPanelUxState =
  | "idle"
  | "loading"
  | "active"
  | "confirming"
  | "cancelling"
  | "confirmed"
  | "cancelled"
  | "expired"
  | "error"
  | "unavailable";

export type MissionDraftConfirmMapped =
  | {
      outcome: "confirmed";
      missionId: string;
      calendarEvent: CalendarEvent;
      summary?: string;
    }
  | {
      outcome: "unavailable";
      message: string;
    };

export type MissionDraftCancelMapped =
  | {
      outcome: "cancelled";
      message: string;
    }
  | {
      outcome: "unavailable";
      message: string;
    };

export function formatMissionDraftExpiryLabel(remainingMs?: number, expiresAt?: string): string {
  if (remainingMs !== undefined && remainingMs > 0) {
    const totalMinutes = Math.ceil(remainingMs / 60_000);
    if (totalMinutes <= 1) return "Expire dans moins d'une minute";
    return `Expire dans ${totalMinutes} min`;
  }

  if (expiresAt) {
    const remaining = Date.parse(expiresAt) - Date.now();
    if (remaining <= 0) return "Proposition expirée";
    const minutes = Math.ceil(remaining / 60_000);
    return minutes <= 1 ? "Expire dans moins d'une minute" : `Expire dans ${minutes} min`;
  }

  return "Expiration inconnue";
}

export function formatMissionDraftSchedule(preview: MissionDraftPreview): string | null {
  if (!preview.scheduledAt) return null;
  const { dateISO, startTime, endTime } = preview.scheduledAt;
  return `${dateISO} · ${startTime} – ${endTime}`;
}

export function mapPendingLoadToUxState(input: {
  loading: boolean;
  pending: MissionDraftPendingClientView | null;
  dismissedExpired: boolean;
}): MissionDraftPanelUxState {
  if (input.loading && !input.pending) {
    return "loading";
  }

  if (!input.pending || input.pending.status === "none") {
    return "idle";
  }

  if (input.pending.status === "expired" && !input.dismissedExpired) {
    return "expired";
  }

  if (input.pending.status === "active" && input.pending.preview) {
    return "active";
  }

  return "idle";
}

export function mapConfirmDraftResponse(body: Pick<
  CommandResult,
  "intent" | "summary" | "missionId" | "calendarEvent" | "requiresConfirmation"
>): MissionDraftConfirmMapped {
  if (
    body.intent === "calendar.book" &&
    body.calendarEvent &&
    body.missionId
  ) {
    return {
      outcome: "confirmed",
      missionId: body.missionId,
      calendarEvent: body.calendarEvent,
      summary: body.summary,
    };
  }

  const summary = body.summary?.trim() ?? "";

  if (/rien à confirmer/i.test(summary)) {
    return { outcome: "unavailable", message: MISSION_DRAFT_UNAVAILABLE_NO_PENDING };
  }

  if (/ne correspond plus/i.test(summary)) {
    return {
      outcome: "unavailable",
      message: summary || MISSION_DRAFT_UNAVAILABLE_MISMATCH,
    };
  }

  if (/expiré/i.test(summary)) {
    return {
      outcome: "unavailable",
      message:
        summary ||
        "La proposition calendrier a expiré. Demande un nouveau rendez-vous via Joris.",
    };
  }

  if (body.intent === "chat") {
    return {
      outcome: "unavailable",
      message: summary || MISSION_DRAFT_UNAVAILABLE_NO_PENDING,
    };
  }

  if (body.requiresConfirmation && summary) {
    return { outcome: "unavailable", message: summary };
  }

  return {
    outcome: "unavailable",
    message: summary || "Confirmation du rendez-vous impossible pour l'instant.",
  };
}

export function mapCancelDraftResponse(body: Pick<CommandResult, "intent" | "summary">): MissionDraftCancelMapped {
  const summary = body.summary?.trim() ?? "";

  if (/annulée/i.test(summary)) {
    return {
      outcome: "cancelled",
      message: summary || `${MISSION_DRAFT_CANCELLED_LABEL}. Tu peux reformuler un nouveau rendez-vous.`,
    };
  }

  if (/aucune mission draft en attente/i.test(summary) || /rien à confirmer/i.test(summary)) {
    return {
      outcome: "unavailable",
      message: MISSION_DRAFT_UNAVAILABLE_NO_PENDING,
    };
  }

  if (body.intent === "chat" && summary) {
    return { outcome: "unavailable", message: summary };
  }

  return {
    outcome: "unavailable",
    message: summary || MISSION_DRAFT_UNAVAILABLE_NO_PENDING,
  };
}

export function isMissionDraftActionInFlight(ux: MissionDraftPanelUxState): boolean {
  return ux === "confirming" || ux === "cancelling";
}
