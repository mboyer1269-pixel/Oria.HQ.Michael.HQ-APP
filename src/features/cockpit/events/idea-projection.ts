import { eventRecordSchema, type EventRecord, type IdeaCapturedPayload } from "./event-record";

export type IdeaProjection = {
  id: string;
  eventId: string;
  streamId: string;
  title: string;
  rawText: string;
  capturedAt: string;
  recordedAt: string;
};

function compareNewestFirst(left: EventRecord, right: EventRecord): number {
  if (left.recordedAt !== right.recordedAt) {
    return left.recordedAt < right.recordedAt ? 1 : -1;
  }

  return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
}

function toIdeaProjection(event: EventRecord): IdeaProjection {
  const payload: IdeaCapturedPayload = event.payload;

  return {
    id: event.id,
    eventId: event.id,
    streamId: event.streamId,
    title: payload.title,
    rawText: payload.rawText,
    capturedAt: payload.capturedAt,
    recordedAt: event.recordedAt,
  };
}

export function projectIdeas(events: readonly EventRecord[]): IdeaProjection[] {
  return events
    .map((event) => eventRecordSchema.parse(event))
    .filter((event) => event.type === "idea.captured")
    .sort(compareNewestFirst)
    .map(toIdeaProjection);
}
