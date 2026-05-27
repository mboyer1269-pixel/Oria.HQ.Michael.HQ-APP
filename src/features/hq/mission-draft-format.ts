import type { MissionDraftPreview } from "@/features/hq/types";

export const MISSION_DRAFT_CHANGED_EVENT = "michael-hq:mission-draft-changed";

export type MissionDraftPendingClientView = {
  status: "none" | "active" | "expired";
  pendingDraftId?: string;
  preview?: MissionDraftPreview;
  expiresAt?: string;
  remainingMs?: number;
  skillId?: "calendar.book";
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
