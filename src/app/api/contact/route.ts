import { NextResponse } from "next/server";
import { createContactLead } from "@/server/contact/contact-lead-service";
import { isAllowed } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { contactRequestSchema, mapContactApiError } from "@/server/contact/contact-request";

function toApiError(error: unknown) {
  const mapped = mapContactApiError(error);

  if (mapped.shouldLog) {
    logger.error("contact.api.failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
  }

  return NextResponse.json(mapped.body, { status: mapped.status });
}

/** 5 requests per hour per IP address. */
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export async function POST(request: Request) {
  // ---- Rate limiting ----
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (!(await isAllowed(ip, RATE_LIMIT, RATE_WINDOW_MS))) {
    return NextResponse.json(
      { error: "Trop de messages envoyes. Reessaie dans une heure." },
      { status: 429 },
    );
  }

  // ---- Validation ----
  const body = await request.json().catch(() => null);
  const parsed = contactRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Message de contact invalide.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // ---- Honeypot ----
  if (parsed.data.website) {
    return NextResponse.json(
      { ok: true, message: "Merci, ton message a bien ete recu.", notificationStatus: "skipped" },
      { status: 202 },
    );
  }

  // ---- Business logic ----
  try {
    const result = await createContactLead({
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      company: parsed.data.company,
      message: parsed.data.message,
      source: parsed.data.source,
    });

    return NextResponse.json(
      {
        ok: true,
        message: "Merci, ton message a bien ete recu. On revient vers toi sous 24-48h.",
        leadId: result.lead.id,
        storageMode: result.lead.storageMode,
        notificationStatus: result.notificationStatus,
      },
      { status: 201 },
    );
  } catch (error) {
    return toApiError(error);
  }
}
