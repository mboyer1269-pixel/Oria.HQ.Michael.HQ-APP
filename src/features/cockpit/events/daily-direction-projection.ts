// src/features/cockpit/events/daily-direction-projection.ts
//
// Projects daily.direction.generated events into the DailyDirectionProjection
// read model used by the cockpit UI. Pure function — no I/O, no side effects.

import type { DailyDirectionEventRecord, DailyDirectionPayload } from "./event-record";

export type DailyDirectionProjection = {
  /** UUID of the underlying daily.direction.generated event. */
  eventId: string;
  /** The validated payload from the event. */
  payload: DailyDirectionPayload;
  /** ISO timestamp when the event was recorded in the DB. */
  recordedAt: string;
};

function compareNewestFirst(
  left: DailyDirectionEventRecord,
  right: DailyDirectionEventRecord,
): number {
  if (left.recordedAt !== right.recordedAt) {
    return left.recordedAt < right.recordedAt ? 1 : -1;
  }
  return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
}

/**
 * Returns the most recent daily.direction.generated event for `dateIso`,
 * or null if no direction exists for that date.
 *
 * Accepts a pre-filtered list (caller already filtered by date via the DB
 * query) — this function just picks the newest if multiple exist.
 */
export function projectTodayDailyDirection(
  events: DailyDirectionEventRecord[],
  dateIso: string,
): DailyDirectionProjection | null {
  const forToday = events.filter((e) => e.payload.dateIso === dateIso);
  if (forToday.length === 0) return null;

  const [newest] = [...forToday].sort(compareNewestFirst);

  return {
    eventId: newest.id,
    payload: newest.payload,
    recordedAt: newest.recordedAt,
  };
}
