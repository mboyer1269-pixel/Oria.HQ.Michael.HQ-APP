import type { JorisIntent } from "@/features/hq/types";

const CALENDAR_BOOK_NEGATIVE_PATTERNS = [
  /\bpas de rendez[- ]?vous\b/,
  /\baucun rendez[- ]?vous\b/,
  /\bje ne veux pas de rendez[- ]?vous\b/,
  /\bsans rendez[- ]?vous\b/,
  /\bpas de rdvs?\b/,
  /\baucun rdvs?\b/,
  /\bje ne veux pas de rdvs?\b/,
  /\bsans rdvs?\b/,
];

const CALENDAR_BOOK_POSITIVE_PATTERNS = [
  /\bbook(?:ing|er|ons|ez|e|é|ée|és|ées)?\b/,
  /\b(?:prendre|prends?)\s+rendez[- ]?vous\b/,
  /\brendez[- ]?vous\b/,
  /\brdvs?\b/,
];

function stripCalendarBookingNegations(message: string): string {
  let stripped = message;
  for (const pattern of CALENDAR_BOOK_NEGATIVE_PATTERNS) {
    stripped = stripped.replace(new RegExp(pattern.source, "gi"), " ");
  }
  return stripped;
}

function hasCalendarBookingPositiveSignal(message: string): boolean {
  return CALENDAR_BOOK_POSITIVE_PATTERNS.some((pattern) => pattern.test(message));
}

function matchesCalendarBookingIntent(message: string): boolean {
  const lower = message.toLowerCase();
  const hasNegative = CALENDAR_BOOK_NEGATIVE_PATTERNS.some((pattern) => pattern.test(lower));

  if (!hasNegative) {
    return hasCalendarBookingPositiveSignal(lower);
  }

  return hasCalendarBookingPositiveSignal(stripCalendarBookingNegations(lower));
}

export function detectIntent(message: string): JorisIntent {
  const lower = message.toLowerCase();

  const missionPlanSignals = [
    "plan",
    "planifie",
    "planifier",
    "lancer",
    "lance",
    "exécute",
    "execute",
    "prépare",
    "preparer",
    "évalue",
    "evaluer",
    "évaluation",
  ];
  if (lower.includes("mission") && missionPlanSignals.some((signal) => lower.includes(signal))) {
    return "mission.plan";
  }

  if (matchesCalendarBookingIntent(message)) {
    return "calendar.book";
  }

  if (/\brappelle-moi\b/.test(lower) || /\brappel\b/.test(lower)) {
    return "calendar.remind";
  }

  if (/\bboard\b/.test(lower) || /\bcomité\b/.test(lower) || /\bhormozi\b/.test(lower)) {
    return "board.consult";
  }

  if (/\bidée\b/.test(lower) || /\bopportunité\b/.test(lower) || /\bbusiness\b/.test(lower)) {
    return "opportunity.score";
  }

  if (
    /\bbrief\b/.test(lower) ||
    /\brésumé\b/.test(lower) ||
    /\bresume\b/.test(lower) ||
    /\bpriorité\b/.test(lower) ||
    /\bpriorite\b/.test(lower)
  ) {
    return "brief.generate";
  }

  return "chat";
}
