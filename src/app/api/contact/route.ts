import { NextResponse } from "next/server";
import { z } from "zod";
import { createContactLead } from "@/server/contact/contact-lead-service";
import { ContactLeadRepositoryError } from "@/server/contact/contact-lead-repository";
import {
  CONTACT_POST_RATE_LIMIT_CONFIG,
  CONTACT_POST_RATE_LIMIT_SCOPE,
  enforceSharedRateLimit,
  getRequestClientIp,
  RateLimitServiceError,
} from "@/server/security/rate-limit-service";

const optionalTextSchema = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

const contactRequestSchema = z.object({
  name: z.string().trim().min(2, "Le nom est requis.").max(120),
  email: z.string().trim().email("Courriel invalide.").max(254).transform((value) => value.toLowerCase()),
  phone: optionalTextSchema(40),
  company: optionalTextSchema(160),
  message: z.string().trim().min(10, "Le message doit contenir au moins 10 caractères.").max(4000),
  source: z.string().trim().min(1).max(80).default("suivia-contact-form"),
  website: z.string().trim().max(200).optional().default(""),
});

function toApiError(error: unknown) {
  if (error instanceof RateLimitServiceError) {
    return NextResponse.json(
      {
        error: "Le formulaire de contact n'est pas disponible pour le moment.",
        code: error.code,
      },
      { status: 503 },
    );
  }

  if (error instanceof ContactLeadRepositoryError) {
    return NextResponse.json(
      {
        error: "Le formulaire de contact n'est pas disponible pour le moment.",
        code: error.code,
      },
      { status: 503 },
    );
  }

  console.error("Contact API failed:", error instanceof Error ? error.message : "Unknown error");

  return NextResponse.json(
    {
      error: "Le formulaire de contact a eu un problème serveur.",
    },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = contactRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Message de contact invalide.",
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  if (parsed.data.website) {
    return NextResponse.json(
      {
        ok: true,
        message: "Merci, ton message a bien été reçu.",
        notificationStatus: "skipped",
      },
      { status: 202 },
    );
  }

  try {
    const clientIp = getRequestClientIp(request);
    const rateLimit = await enforceSharedRateLimit({
      scope: CONTACT_POST_RATE_LIMIT_SCOPE,
      bucketKey: clientIp,
      config: CONTACT_POST_RATE_LIMIT_CONFIG,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Trop de soumissions récentes. Réessayez dans quelques minutes.",
          code: "RATE_LIMIT_EXCEEDED",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }

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
        message: "Merci, ton message a bien été reçu. On revient vers toi sous 24-48h.",
        leadId: result.lead.id,
        storageMode: result.lead.storageMode,
        notificationStatus: result.notificationStatus,
        notificationReason: result.notificationReason,
      },
      { status: 201 },
    );
  } catch (error) {
    return toApiError(error);
  }
}
