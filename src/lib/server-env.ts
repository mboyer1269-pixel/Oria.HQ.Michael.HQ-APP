// Server-only configuration. Do not import this module from Client Components.
export const serverEnv = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openAiApiKey: process.env.OPENAI_API_KEY,
  googleGenerativeAiApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  michaelHqOwnerId: process.env.MICHAEL_HQ_OWNER_ID,
  michaelHqOwnerEmail: process.env.MICHAEL_HQ_OWNER_EMAIL?.trim().toLowerCase(),
  contactNotificationEmail: process.env.CONTACT_NOTIFICATION_EMAIL,
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
