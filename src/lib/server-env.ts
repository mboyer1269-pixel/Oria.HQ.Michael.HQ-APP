import "server-only";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Server-side environment schema (Zod)
// ---------------------------------------------------------------------------
// All fields are optional at the type level — the app runs in local-fallback
// mode without Supabase or AI keys in development.
//
// PRODUCTION FAIL-FAST: validateProductionEnv() is called at module load time
// when NODE_ENV === "production". It throws immediately if any critical field
// is absent, preventing silent undefined crashes at the first LLM call.
// ---------------------------------------------------------------------------

const serverEnvSchema = z.object({
  // AI providers — at least one must be set in production (enforced below)
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
  ELEVENLABS_API_KEY: z.string().min(1).optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  // Owner identity — required in production
  MICHAEL_HQ_OWNER_ID: z.string().min(1).optional(),
  MICHAEL_HQ_OWNER_EMAIL: z.string().email().optional(),
  // Notifications
  CONTACT_NOTIFICATION_EMAIL: z.string().email().optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  // Rate limiting — Upstash Redis (optional — falls back to in-memory)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  // Agent webhooks (optional — fall back to built-in handlers)
  AGENT_MARKETING_WEBHOOK_URL: z.string().url().optional(),
  AGENT_INVENTOR_WEBHOOK_URL: z.string().url().optional(),
  AGENT_HERMES_WEBHOOK_URL: z.string().url().optional(),
});

type ParsedEnv = z.infer<typeof serverEnvSchema>;

function parseServerEnv(): ParsedEnv {
  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    // Zod validation failed (e.g. MICHAEL_HQ_OWNER_EMAIL is set but not a valid email).
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`[server-env] Invalid environment variables: ${issues}`);
  }
  return result.data;
}

const _parsed = parseServerEnv();

// ---------------------------------------------------------------------------
// Production fail-fast — runs at module load in production only.
// Throws with a clear list of missing critical variables.
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV === "production") {
  const criticalMissing: string[] = [];

  // At least one AI key must be present — the model router needs it.
  const hasAiKey =
    _parsed.ANTHROPIC_API_KEY ||
    _parsed.OPENAI_API_KEY ||
    _parsed.GOOGLE_GENERATIVE_AI_API_KEY ||
    _parsed.OPENROUTER_API_KEY;
  if (!hasAiKey) {
    criticalMissing.push("ANTHROPIC_API_KEY (or OPENAI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY / OPENROUTER_API_KEY)");
  }

  // Owner identity is required for auth gating in production.
  if (!_parsed.MICHAEL_HQ_OWNER_ID) criticalMissing.push("MICHAEL_HQ_OWNER_ID");
  if (!_parsed.MICHAEL_HQ_OWNER_EMAIL) criticalMissing.push("MICHAEL_HQ_OWNER_EMAIL");

  // Supabase is required for production persistence.
  if (!_parsed.NEXT_PUBLIC_SUPABASE_URL) criticalMissing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!_parsed.SUPABASE_SERVICE_ROLE_KEY) criticalMissing.push("SUPABASE_SERVICE_ROLE_KEY");

  if (criticalMissing.length > 0) {
    throw new Error(
      `[server-env] Missing critical environment variables in production:\n${criticalMissing.map((v) => `  - ${v}`).join("\n")}\n\nSet these in your deployment environment before starting the server.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Public serverEnv object — backward-compatible with all existing callers.
// ---------------------------------------------------------------------------

export const serverEnv = {
  anthropicApiKey: _parsed.ANTHROPIC_API_KEY,
  openAiApiKey: _parsed.OPENAI_API_KEY,
  googleGenerativeAiApiKey: _parsed.GOOGLE_GENERATIVE_AI_API_KEY,
  elevenLabsApiKey: _parsed.ELEVENLABS_API_KEY,
  openRouterApiKey: _parsed.OPENROUTER_API_KEY,
  supabaseUrl: _parsed.NEXT_PUBLIC_SUPABASE_URL,
  supabaseServiceRoleKey: _parsed.SUPABASE_SERVICE_ROLE_KEY,
  michaelHqOwnerId: _parsed.MICHAEL_HQ_OWNER_ID,
  michaelHqOwnerEmail: _parsed.MICHAEL_HQ_OWNER_EMAIL?.trim().toLowerCase(),
  contactNotificationEmail: _parsed.CONTACT_NOTIFICATION_EMAIL,
  resendApiKey: _parsed.RESEND_API_KEY,
  resendFromEmail: _parsed.RESEND_FROM_EMAIL,
  agentMarketingWebhookUrl: _parsed.AGENT_MARKETING_WEBHOOK_URL,
  agentInventorWebhookUrl: _parsed.AGENT_INVENTOR_WEBHOOK_URL,
  agentHermesWebhookUrl: _parsed.AGENT_HERMES_WEBHOOK_URL,
};

export function isLocalPersistenceFallbackAllowed() {
  return process.env.NODE_ENV !== "production";
}

export function getMissingServerSecrets() {
  return Object.entries({
    ANTHROPIC_API_KEY: serverEnv.anthropicApiKey,
    OPENAI_API_KEY: serverEnv.openAiApiKey,
    GOOGLE_GENERATIVE_AI_API_KEY: serverEnv.googleGenerativeAiApiKey,
    ELEVENLABS_API_KEY: serverEnv.elevenLabsApiKey,
  })
    .filter(([, value]) => !value)
    .map(([key]) => key);
}
