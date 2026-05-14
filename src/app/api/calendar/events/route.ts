import { NextResponse } from "next/server";
import { z } from "zod";
import { createCalendarEvent, CalendarServiceError, listCalendarEvents } from "@/server/calendar/calendar-service";
import { CalendarRepositoryError } from "@/server/calendar/calendar-repository";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu: YYYY-MM-DD")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    return (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    );
  }, "Date invalide");

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format attendu: HH:mm");

const createEventSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    dateISO: dateSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    source: z.enum(["api", "internal", "joris"]).default("api"),
    remindersMinutes: z.array(z.number().int().min(0).max(10080)).max(5).default([60, 15]),
    notes: z.string().trim().max(2000).optional(),
    confirm: z.boolean().default(false),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "L'heure de fin doit être après l'heure de début.",
    path: ["endTime"],
  });

const listEventsSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    fromDateISO: dateSchema.optional(),
    toDateISO: dateSchema.optional(),
  })
  .refine((data) => !data.fromDateISO || !data.toDateISO || data.toDateISO >= data.fromDateISO, {
    message: "La date de fin doit être après la date de début.",
    path: ["toDateISO"],
  });

function toApiError(error: unknown) {
  if (error instanceof CalendarServiceError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
      },
      { status: error.status },
    );
  }

  if (error instanceof CalendarRepositoryError) {
    return NextResponse.json(
      {
        error: "Le calendrier n'est pas disponible pour le moment.",
        code: error.code,
      },
      { status: 503 },
    );
  }

  console.error("Calendar API failed:", error instanceof Error ? error.message : "Unknown error");

  return NextResponse.json(
    {
      error: "Le calendrier a eu un problème serveur.",
    },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = listEventsSchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    fromDateISO: url.searchParams.get("fromDateISO") ?? undefined,
    toDateISO: url.searchParams.get("toDateISO") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Filtres calendrier invalides.",
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const events = await listCalendarEvents(parsed.data);

    return NextResponse.json({ events });
  } catch (error) {
    return toApiError(error);
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createEventSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Événement calendrier invalide.",
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const result = await createCalendarEvent(parsed.data);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toApiError(error);
  }
}
