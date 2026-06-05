import { z } from "zod";

const ISO_DATE_MESSAGE = "Date ISO requise.";
const IDEA_TITLE_MAX = 120;
const IDEA_RAW_TEXT_MAX = 4000;

const isoDateStringSchema = z
  .string()
  .trim()
  .min(1, ISO_DATE_MESSAGE)
  .refine((value) => !Number.isNaN(Date.parse(value)), ISO_DATE_MESSAGE);

const nonEmptyTextSchema = (max: number) =>
  z.string().trim().min(1, "Champ obligatoire.").max(max, `Maximum ${max} caractères.`);

export const ideaCapturedPayloadSchema = z
  .object({
    title: nonEmptyTextSchema(IDEA_TITLE_MAX),
    rawText: nonEmptyTextSchema(IDEA_RAW_TEXT_MAX),
    capturedAt: isoDateStringSchema,
  })
  .strict();

export type IdeaCapturedPayload = z.infer<typeof ideaCapturedPayloadSchema>;

export const eventTypeSchema = z.literal("idea.captured");
export type EventType = z.infer<typeof eventTypeSchema>;

export const eventPayloadSchemaByType = {
  "idea.captured": ideaCapturedPayloadSchema,
} satisfies Record<EventType, z.ZodType>;

export const eventRecordSchema = z
  .object({
    id: nonEmptyTextSchema(160),
    workspaceId: nonEmptyTextSchema(160),
    userId: nonEmptyTextSchema(160),
    streamId: nonEmptyTextSchema(240),
    type: eventTypeSchema,
    payload: ideaCapturedPayloadSchema,
    validFrom: isoDateStringSchema.nullable(),
    validTo: isoDateStringSchema.nullable(),
    recordedAt: isoDateStringSchema,
  })
  .strict();

export type EventRecord = z.infer<typeof eventRecordSchema>;
export type EventPayload = EventRecord["payload"];

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

export function parseEventPayload(type: EventType, payload: unknown): EventPayload {
  return eventPayloadSchemaByType[type].parse(payload) as EventPayload;
}
