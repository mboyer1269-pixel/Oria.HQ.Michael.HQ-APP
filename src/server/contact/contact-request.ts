// Pure, framework-free contact-request helpers (input validation + public error
// mapping), extracted from the /api/contact route so they can be unit-tested
// offline without Next, network, or env. Behaviour is unchanged — route.ts wraps
// these in NextResponse and keeps the rate-limit + honeypot flow.

import { z } from "zod";
import { ContactLeadRepositoryError } from "@/server/contact/contact-lead-repository";

const optionalTextSchema = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

export const contactRequestSchema = z.object({
  name: z.string().trim().min(2, "Le nom est requis.").max(120),
  email: z.string().trim().email("Courriel invalide.").max(254).transform((value) => value.toLowerCase()),
  phone: optionalTextSchema(40),
  company: optionalTextSchema(160),
  message: z.string().trim().min(10, "Le message doit contenir au moins 10 caracteres.").max(4000),
  source: z.string().trim().min(1).max(80).default("suivia-contact-form"),
  website: z.string().trim().max(200).optional().default(""),
});

export type ContactApiErrorResult = {
  status: number;
  body: { error: string; code?: string };
  /** True when the route should log this (an unexpected server error). */
  shouldLog: boolean;
};

/**
 * Maps a contact-write error to a PUBLIC-safe response shape. Never leaks
 * internal/Supabase details: a known repository failure surfaces a generic 503 +
 * a generic code; anything else is a generic 500 (and is logged by the caller).
 */
export function mapContactApiError(error: unknown): ContactApiErrorResult {
  if (error instanceof ContactLeadRepositoryError) {
    return {
      status: 503,
      body: { error: "Le formulaire de contact n'est pas disponible pour le moment.", code: error.code },
      shouldLog: false,
    };
  }

  return {
    status: 500,
    body: { error: "Le formulaire de contact a eu un probleme serveur." },
    shouldLog: true,
  };
}
