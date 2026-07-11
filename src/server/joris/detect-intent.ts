import type { JorisIntent } from "@/core/types";

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

const GOVERNANCE_AUDIT_GOVERNANCE_PATTERN = /\b(?:gouvernance|governance)\b/;
const GOVERNANCE_AUDIT_REPORT_PATTERN =
  /\b(?:audit|rapport|historique des décisions|historique des decisions|décisions de gouvernance|decisions de gouvernance)\b/;

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

export function matchesCalendarBookingIntent(message: string): boolean {
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

  if (GOVERNANCE_AUDIT_GOVERNANCE_PATTERN.test(lower) && GOVERNANCE_AUDIT_REPORT_PATTERN.test(lower)) {
    return "governance.audit";
  }

  // Marketplace fiche prepare / inventory sync for dealership listings
  const marketplaceSignals = [
    "marketplace",
    "fiche marketplace",
    "annonce marketplace",
    "prépare fiche",
    "prepare fiche",
    "préparer fiche",
    "preparer fiche",
  ];
  const inventorySyncSignals = [
    "sync inventaire",
    "synchronise inventaire",
    "synchroniser inventaire",
    "rafraîchir inventaire",
    "rafraichir inventaire",
  ];
  if (
    marketplaceSignals.some((s) => lower.includes(s)) ||
    inventorySyncSignals.some((s) => lower.includes(s)) ||
    (lower.includes("fiche") && (lower.includes("stock") || lower.includes("inventaire")))
  ) {
    return "marketplace.listing.prepare";
  }

  if (matchesCalendarBookingIntent(message)) {
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

  if (
    lower.includes("brief") ||
    lower.includes("résumé") ||
    lower.includes("resume") ||
    lower.includes("priorité") ||
    lower.includes("priorite")
  ) {
    return "brief.generate";
  }

  return "chat";
}
