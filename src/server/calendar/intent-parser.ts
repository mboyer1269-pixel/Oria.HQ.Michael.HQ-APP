import type { CalendarIntent } from "@/core/types";

const datePattern = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const timePattern = /(?:^|\s)(?:(à|a|@|pour|vers)\s*)?(\d{1,2})(?:\s*(:|h)\s*(\d{2})?)?\s*(am|pm)?(?=\s|$|[.,;!?])/i;

function formatLocalISODate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function toISODateForTodayOrTomorrow(message: string, startTime: string) {
  const explicitDate = message.match(datePattern);
  if (explicitDate) {
    const [, year, month, day] = explicitDate;
    const date = new Date(Number(year), Number(month) - 1, Number(day));

    if (
      date.getFullYear() === Number(year) &&
      date.getMonth() === Number(month) - 1 &&
      date.getDate() === Number(day)
    ) {
      return formatLocalISODate(date);
    }
  }

  const lower = message.toLowerCase();
  const now = new Date();
  const target = new Date(now);

  if (lower.includes("demain")) {
    target.setDate(target.getDate() + 1);
  }

  const [hour, minute] = startTime.split(":").map(Number);
  target.setHours(hour, minute, 0, 0);

  if (!lower.includes("demain") && target.getTime() < now.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  return formatLocalISODate(target);
}

function addMinutes(time: string, minutesToAdd: number) {
  const [hour, minute] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hour, minute + minutesToAdd, 0, 0);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function normalizeTime(match: RegExpMatchArray | null) {
  if (!match) return null;

  const [, cue, hourValue, separator, minuteValue, meridiemValue] = match;
  const hasExplicitTimeCue = Boolean(cue || separator || meridiemValue);
  if (!hasExplicitTimeCue) return null;

  let hour = Number(hourValue);
  const minute = Number(minuteValue ?? "00");
  const meridiem = meridiemValue?.toLowerCase();

  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  if (hour > 23 || minute > 59) return null;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function inferDurationMinutes(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("banque") || lower.includes("notaire") || lower.includes("déplacement")) return 90;
  if (lower.includes("appel") || lower.includes("call")) return 30;
  return 60;
}

function titleize(message: string) {
  const cleaned = message
    .replace(/^joris[, ]*/i, "")
    .replace(/^book[, : ]*/i, "")
    .replace(/^rendez-vous\s*/i, "")
    .replace(timePattern, "")
    .trim();

  if (!cleaned) return "Rendez-vous";

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function parseCalendarIntent(message: string): CalendarIntent | null {
  const startTime = normalizeTime(message.match(timePattern));
  if (!startTime) return null;

  const duration = inferDurationMinutes(message);
  const endTime = addMinutes(startTime, duration);

  return {
    title: titleize(message),
    dateISO: toISODateForTodayOrTomorrow(message, startTime),
    startTime,
    endTime,
    remindersMinutes: duration >= 60 ? [60, 15] : [15],
    needsConfirmation: false,
    confidence: 0.78,
    notes: "Créé par Joris Book avec defaults FR-CA.",
  };
}
