import { z } from "zod";

const ISO_DATE_MESSAGE = "Date ISO requise.";
const IDEA_TITLE_MAX = 120;
const IDEA_RAW_TEXT_MAX = 4000;
const DIRECTION_ITEM_TEXT_MAX = 400;

const isoDateStringSchema = z
  .string()
  .trim()
  .min(1, ISO_DATE_MESSAGE)
  .refine((value) => !Number.isNaN(Date.parse(value)), ISO_DATE_MESSAGE);

const nonEmptyTextSchema = (max: number) =>
  z.string().trim().min(1, "Champ obligatoire.").max(max, `Maximum ${max} caractères.`);

// ---------------------------------------------------------------------------
// idea.captured
// ---------------------------------------------------------------------------

export const ideaCapturedPayloadSchema = z
  .object({
    title: nonEmptyTextSchema(IDEA_TITLE_MAX),
    rawText: nonEmptyTextSchema(IDEA_RAW_TEXT_MAX),
    capturedAt: isoDateStringSchema,
  })
  .strict();

export type IdeaCapturedPayload = z.infer<typeof ideaCapturedPayloadSchema>;

// ---------------------------------------------------------------------------
// daily.direction.generated
// ---------------------------------------------------------------------------

export const dailyDirectionItemSchema = z
  .object({
    /** Human-readable content of this direction item. */
    text: nonEmptyTextSchema(DIRECTION_ITEM_TEXT_MAX),
    /** IDs of the events that motivated this item (traceability). */
    sourceEventIds: z.array(z.string().uuid()),
  })
  .strict();

export type DailyDirectionItem = z.infer<typeof dailyDirectionItemSchema>;

export const dailyDirectionPayloadSchema = z
  .object({
    /** Date this direction covers, format YYYY-MM-DD. */
    dateIso: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD requis."),
    /** Three outcomes (résultats visés, not tasks). */
    outcomes: z.array(dailyDirectionItemSchema).length(3),
    /** The one action that moves closer to real revenue today. */
    cashAction: dailyDirectionItemSchema,
    /** The one action that advances ORIA or a venture. */
    buildAction: dailyDirectionItemSchema,
    /** The one decision to make today. */
    decisionToMake: dailyDirectionItemSchema,
    /** The one thing to cut or ignore to stay focused. */
    thingToCut: dailyDirectionItemSchema,
    /** IDs of all events fed as context to the generator. */
    generatorEventIds: z.array(z.string().uuid()),
    /** True when the generator had no real events to work from. */
    isZeroState: z.boolean(),
    /** Honest zero-state guidance when isZeroState=true. Null otherwise. */
    zeroStateMessage: z.string().nullable(),
    /** ISO timestamp of when the direction was generated. */
    generatedAt: isoDateStringSchema,
  })
  .strict();

export type DailyDirectionPayload = z.infer<typeof dailyDirectionPayloadSchema>;

// ---------------------------------------------------------------------------
// Event type registry
// ---------------------------------------------------------------------------

/**
 * All known event types. Extend this enum as new event categories are added.
 * Widget manifests and the event client both reference this union.
 */
export const eventTypeSchema = z.enum(["idea.captured", "daily.direction.generated"]);
export type EventType = z.infer<typeof eventTypeSchema>;

export const eventPayloadSchemaByType = {
  "idea.captured": ideaCapturedPayloadSchema,
  "daily.direction.generated": dailyDirectionPayloadSchema,
} satisfies Record<EventType, z.ZodType>;

// ---------------------------------------------------------------------------
// EventRecord schemas — one per type to maintain discriminated typing.
// ---------------------------------------------------------------------------

const eventRecordBaseFields = {
  id: nonEmptyTextSchema(160),
  workspaceId: nonEmptyTextSchema(160),
  userId: nonEmptyTextSchema(160),
  streamId: nonEmptyTextSchema(240),
  validFrom: isoDateStringSchema.nullable(),
  validTo: isoDateStringSchema.nullable(),
  recordedAt: isoDateStringSchema,
};

/**
 * EventRecord for idea.captured events.
 * Backward-compatible: type is still a literal, payload is still IdeaCapturedPayload.
 */
export const eventRecordSchema = z
  .object({
    ...eventRecordBaseFields,
    type: z.literal("idea.captured"),
    payload: ideaCapturedPayloadSchema,
  })
  .strict();

export type EventRecord = z.infer<typeof eventRecordSchema>;
export type EventPayload = EventRecord["payload"];

/**
 * EventRecord for daily.direction.generated events.
 */
export const dailyDirectionEventRecordSchema = z
  .object({
    ...eventRecordBaseFields,
    type: z.literal("daily.direction.generated"),
    payload: dailyDirectionPayloadSchema,
  })
  .strict();

export type DailyDirectionEventRecord = z.infer<typeof dailyDirectionEventRecordSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function deriveIdeaTitle(rawText: string): string {
  const firstLine = rawText
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .find(Boolean);

  if (!firstLine) return "";
  if (firstLine.length <= IDEA_TITLE_MAX) return firstLine;
  return `${firstLine.slice(0, IDEA_TITLE_MAX - 1).trimEnd()}…`;
}

export function buildIdeaCapturedPayload(input: {
  rawText: string;
  capturedAt?: string | Date;
}): IdeaCapturedPayload {
  const capturedAt =
    input.capturedAt instanceof Date
      ? input.capturedAt.toISOString()
      : input.capturedAt ?? new Date().toISOString();

  return ideaCapturedPayloadSchema.parse({
    title: deriveIdeaTitle(input.rawText),
    rawText: input.rawText,
    capturedAt,
  });
}

export function parseEventPayload(type: EventType, payload: unknown): IdeaCapturedPayload | DailyDirectionPayload {
  return eventPayloadSchemaByType[type].parse(payload) as IdeaCapturedPayload | DailyDirectionPayload;
}
