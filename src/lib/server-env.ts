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
  // Supabase.
  //
  // The anon key was missing from this schema entirely while being required by
  // createServerSupabaseClient(), which every authenticated route reaches
  // through requireOwnerApiSession(). Production could therefore boot "clean"
  // with the URL and the service-role key set, and answer 401 to the owner on
  // every request: the client constructor throws, getCurrentAuthUser() maps
  // that to "no user", and the gate refuses. The fail-fast below now covers it.
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
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
  // Per-agent webhooks — INERT. No code path reads these; the only dispatcher
  // resolves N8N_WEBHOOK_URL. Kept declared so an existing deployment that sets
  // them still validates. See .env.example.
  AGENT_MARKETING_WEBHOOK_URL: z.string().url().optional(),
  AGENT_INVENTOR_WEBHOOK_URL: z.string().url().optional(),
  AGENT_HERMES_WEBHOOK_URL: z.string().url().optional(),
  // n8n execution bridge (optional — CEO-approval-gated dispatch via the
  // n8n_webhook_trigger MCP tool). N8N_SECRET secures the transfer
  // (x-webhook-secret); AGENT_WEBHOOK_SIGNING_SECRET signs the body (HMAC).
  // Declared, not required: the tool fails closed without them.
  N8N_WEBHOOK_URL: z.string().url().optional(),
  N8N_SECRET: z.string().min(1).optional(),
  AGENT_WEBHOOK_SIGNING_SECRET: z.string().min(1).optional(),
  // Background jobs (Inngest). Production-relevant but NOT boot-critical: the
  // SDK degrades to the dev server, and the scheduled rail is frozen. Reported
  // by getProductionReadinessWarnings() instead of throwing — a missing cron key
  // must not take the whole app down.
  INNGEST_EVENT_KEY: z.string().min(1).optional(),
  INNGEST_SIGNING_KEY: z.string().min(1).optional(),
  // Opt-in feature flags. Each gates a capability that is OFF unless the flag
  // is exactly "1"; they are declared here so the schema is the full inventory
  // of what the environment can change, not a partial one.
  ORIA_ENABLE_MEMEX_READONLY: z.enum(["0", "1"]).optional(),
  MEMEX_CORE_ROOT: z.string().min(1).optional(),
  ORIA_ENABLE_LOCAL_RUNTIME_PROBE: z.enum(["0", "1"]).optional(),
  ORIA_ALLOW_DEV_USER_FALLBACK: z.enum(["true", "false"]).optional(),
  ORIA_UNSAFE_ALLOW_FILE_DOCUMENT_STORE_IN_PROD: z.enum(["true", "false"]).optional(),
  // Durable archive directory for the document-processing CLI. Fails closed in
  // that script; never required to boot the app.
  MCL_ARCHIVE_DIR: z.string().min(1).optional(),
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
// Skipped during next build (NEXT_PHASE=phase-production-build) so CI
// does not require real API keys to compile the app.
// Throws with a clear list of missing critical variables at runtime.
// ---------------------------------------------------------------------------
const isNextBuild = process.env.NEXT_PHASE === "phase-production-build";

if (process.env.NODE_ENV === "production" && !isNextBuild) {
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

  // Supabase is required for production persistence AND for auth. The anon key
  // is not optional in practice: without it createServerSupabaseClient() throws,
  // getCurrentAuthUser() returns null, and requireOwnerApiSession() answers 401
  // to the owner on every request — an app that boots and serves nothing.
  if (!_parsed.NEXT_PUBLIC_SUPABASE_URL) criticalMissing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!_parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY) criticalMissing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
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
  supabaseAnonKey: _parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: _parsed.SUPABASE_SERVICE_ROLE_KEY,
  michaelHqOwnerId: _parsed.MICHAEL_HQ_OWNER_ID,
  michaelHqOwnerEmail: _parsed.MICHAEL_HQ_OWNER_EMAIL?.trim().toLowerCase(),
  contactNotificationEmail: _parsed.CONTACT_NOTIFICATION_EMAIL,
  resendApiKey: _parsed.RESEND_API_KEY,
  resendFromEmail: _parsed.RESEND_FROM_EMAIL,
  agentMarketingWebhookUrl: _parsed.AGENT_MARKETING_WEBHOOK_URL,
  agentInventorWebhookUrl: _parsed.AGENT_INVENTOR_WEBHOOK_URL,
  agentHermesWebhookUrl: _parsed.AGENT_HERMES_WEBHOOK_URL,
  n8nWebhookUrl: _parsed.N8N_WEBHOOK_URL,
  n8nSecret: _parsed.N8N_SECRET,
  agentWebhookSigningSecret: _parsed.AGENT_WEBHOOK_SIGNING_SECRET,
  inngestEventKey: _parsed.INNGEST_EVENT_KEY,
  inngestSigningKey: _parsed.INNGEST_SIGNING_KEY,
  memexCoreRoot: _parsed.MEMEX_CORE_ROOT,
  mclArchiveDir: _parsed.MCL_ARCHIVE_DIR,
};

/**
 * Production-relevant variables that are absent but must NOT stop the boot.
 *
 * Kept separate from criticalMissing on purpose: a missing scheduled-jobs key
 * degrades one subsystem, and turning that into a boot failure would take the
 * whole app down to protect a rail that is currently frozen. Reported so the
 * degradation is visible; never thrown.
 */
export function getProductionReadinessWarnings(): string[] {
  if (process.env.NODE_ENV !== "production") return [];

  const warnings: string[] = [];
  if (!serverEnv.inngestEventKey || !serverEnv.inngestSigningKey) {
    warnings.push(
      "INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY are unset — scheduled jobs cannot run in production.",
    );
  }
  if (serverEnv.n8nWebhookUrl && !serverEnv.agentWebhookSigningSecret) {
    warnings.push(
      "N8N_WEBHOOK_URL is set but AGENT_WEBHOOK_SIGNING_SECRET is not — every signed dispatch will be refused.",
    );
  }
  return warnings;
}

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
