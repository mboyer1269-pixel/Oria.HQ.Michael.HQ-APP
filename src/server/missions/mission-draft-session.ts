// ---------------------------------------------------------------------------
// PRODUCTION WARNING — IN-MEMORY SESSION STORE
// ---------------------------------------------------------------------------
// This module uses module-scope Maps to hold pending mission drafts and
// confirmation results. This is intentional for single-instance development
// but has critical limitations in production:
//
//   1. MULTI-INSTANCE / SERVERLESS: State is NOT shared across Node.js
//      instances (Vercel, Docker multi-process, PM2 cluster). A draft created
//      on instance A will NOT be found on instance B. The user will see their
//      draft silently disappear between requests.
//
//   2. RESTART LOSS: Any in-progress draft is lost when the server restarts
//      (deploy, crash, cold start).
//
//   3. MEMORY GROWTH: The confirmationByPendingId Map is never evicted.
//      Long-running single instances will accumulate stale confirmation records.
//
// MIGRATION PATH (when multi-instance prod is needed):
//   Replace the Map store with a short-TTL Supabase table (e.g.
//   `pending_mission_drafts`) or a Redis/Upstash key-value store with automatic
//   TTL expiry. The TTL in MISSION_DRAFT_TTL_MS already defines the correct
//   expiry value to pass to the external store.
//
//   Do NOT begin this migration without an explicit mandate.
// ---------------------------------------------------------------------------

import type { CalendarIntent, MissionDraftPreview } from "@/features/hq/types";
import type { CreateCalendarEventCommand } from "@/server/calendar/calendar-service";
import {
  buildCalendarCommandFromIntent,
  buildMissionDraftPreview,
  createPendingDraftId,
  MISSION_DRAFT_TTL_MS,
} from "./mission-draft-builder";

export type PendingMissionDraft = {
  pendingDraftId: string;
  workspaceId: string;
  userId: string;
  skillId: "calendar.book";
  actionType: "calendar.book";
  createdAt: string;
  expiresAt: string;
  preview: MissionDraftPreview;
  calendarIntent: CalendarIntent;
  calendarCommand: CreateCalendarEventCommand;
};

export type MissionDraftConfirmationResult = {
  pendingDraftId: string;
  missionId: string;
  calendarEventId?: string;
  summary: string;
};

const pendingBySessionKey = new Map<string, PendingMissionDraft>();
const confirmationByPendingId = new Map<string, MissionDraftConfirmationResult>();

function sessionKey(workspaceId: string, userId: string): string {
  return `${workspaceId}:${userId}`;
}

export function isPendingMissionDraftExpired(draft: PendingMissionDraft, now = Date.now()): boolean {
  return Date.parse(draft.expiresAt) <= now;
}

export function getPendingMissionDraft(
  workspaceId: string,
  userId: string,
): PendingMissionDraft | undefined {
  const draft = pendingBySessionKey.get(sessionKey(workspaceId, userId));
  if (!draft) return undefined;

  if (isPendingMissionDraftExpired(draft)) {
    pendingBySessionKey.delete(sessionKey(workspaceId, userId));
    return undefined;
  }

  return draft;
}

export function setPendingMissionDraft(input: {
  workspaceId: string;
  userId: string;
  calendarIntent: CalendarIntent;
  modelId?: string;
  costMode?: CreateCalendarEventCommand["costMode"];
}): PendingMissionDraft {
  const pendingDraftId = createPendingDraftId();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + MISSION_DRAFT_TTL_MS).toISOString();
  const preview = buildMissionDraftPreview({
    pendingDraftId,
    calendarIntent: input.calendarIntent,
    expiresAt,
  });
  const calendarCommand = buildCalendarCommandFromIntent(
    input.calendarIntent,
    input.modelId,
    input.costMode,
  );

  const draft: PendingMissionDraft = {
    pendingDraftId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    skillId: "calendar.book",
    actionType: "calendar.book",
    createdAt,
    expiresAt,
    preview,
    calendarIntent: input.calendarIntent,
    calendarCommand,
  };

  pendingBySessionKey.set(sessionKey(input.workspaceId, input.userId), draft);
  return draft;
}

export function clearPendingMissionDraft(workspaceId: string, userId: string): boolean {
  return pendingBySessionKey.delete(sessionKey(workspaceId, userId));
}

export function getCachedMissionDraftConfirmation(
  pendingDraftId: string,
): MissionDraftConfirmationResult | undefined {
  return confirmationByPendingId.get(pendingDraftId);
}

export function cacheMissionDraftConfirmation(result: MissionDraftConfirmationResult): void {
  confirmationByPendingId.set(result.pendingDraftId, result);
}

export function resetMissionDraftSessionForTests(): void {
  pendingBySessionKey.clear();
  confirmationByPendingId.clear();
}
