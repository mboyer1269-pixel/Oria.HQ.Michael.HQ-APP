import { matchesCalendarBookingIntent } from "@/server/joris/detect-intent";

export type MissionDraftReplyKind = "confirm" | "cancel" | "ambiguous" | "none";

const CONFIRM_PATTERNS = [
  /^confirme(?:r| la mission)?[.!]?$/i,
  /^oui[.!]?$/i,
  /^go[.!]?$/i,
  /^ok pour la mission[.!]?$/i,
  /^c'est bon[.!]?$/i,
  /^oui,?\s*confirme[.!]?$/i,
];

const CANCEL_PATTERNS = [
  /^annule(?:r| la mission)?[.!]?$/i,
  /^cancel(?: la mission)?[.!]?$/i,
];

/**
 * Classifies short replies for the mission-draft confirmation gate.
 * Does not replace detectIntent — brain handles this before routing calendar.book.
 */
export function classifyMissionDraftReply(message: string): MissionDraftReplyKind {
  const trimmed = message.trim();
  if (!trimmed) return "none";

  const hasCancel = CANCEL_PATTERNS.some((pattern) => pattern.test(trimmed));
  const exactConfirm = CONFIRM_PATTERNS.some((pattern) => pattern.test(trimmed));
  const looseConfirm = /\b(confirme|confirmer|oui|go)\b/i.test(trimmed);

  if (hasCancel && (exactConfirm || looseConfirm)) return "ambiguous";
  if (hasCancel) return "cancel";

  const hasCalendarSignal = matchesCalendarBookingIntent(trimmed);
  if ((exactConfirm || looseConfirm) && hasCalendarSignal) return "ambiguous";
  if (exactConfirm) return "confirm";

  return "none";
}
