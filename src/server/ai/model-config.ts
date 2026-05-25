import type { ModelProfile } from "@/features/hq/types";
import { modelProfiles } from "@/features/hq/seed";

/**
 * OpenRouter gateway — unified access to 200+ models via a single API key.
 * Compatible with the OpenAI SDK: set baseURL to "https://openrouter.ai/api/v1"
 * and apiKey to serverEnv.openRouterApiKey. No extra SDK needed.
 *
 * Use these IDs when routing to OpenRouter profiles defined in seed.ts.
 */
export const OPENROUTER_PREFIX = "openrouter/";

/** Premium brain — judgment, strategy, high-impact decisions. */
export const PREMIUM_MODEL_ID = "claude-sonnet-4-6";

/** Economy brain — fast, low-cost operational tasks. */
export const ECONOMY_MODEL_ID = "gpt-4o-mini";

/** Optional long-context brain — used only when long-context signals match. */
export const LONG_CONTEXT_MODEL_ID = "gemini-flash";

export const DEFAULT_BRAIN_MODEL_IDS = [PREMIUM_MODEL_ID, ECONOMY_MODEL_ID] as const;

const profileById = new Map(modelProfiles.map((profile) => [profile.id, profile]));

export function resolveModelProfile(modelId: string): ModelProfile | undefined {
  return profileById.get(modelId);
}

export function resolveModelProfileOrFallback(
  modelId: string,
  fallbackId: string = ECONOMY_MODEL_ID,
): ModelProfile {
  return resolveModelProfile(modelId) ?? resolveModelProfile(fallbackId) ?? modelProfiles[0];
}

/** Ordered fallback when a target model is unavailable. */
export function fallbackModelIds(primaryId: string): readonly string[] {
  switch (primaryId) {
    case PREMIUM_MODEL_ID:
      return [PREMIUM_MODEL_ID, "gpt-4o", ECONOMY_MODEL_ID];
    case LONG_CONTEXT_MODEL_ID:
      return [LONG_CONTEXT_MODEL_ID, ECONOMY_MODEL_ID, PREMIUM_MODEL_ID];
    case ECONOMY_MODEL_ID:
    default:
      return [ECONOMY_MODEL_ID, LONG_CONTEXT_MODEL_ID, PREMIUM_MODEL_ID];
  }
}

export function pickAvailableModelId(
  primaryId: string,
  unavailableModelIds: ReadonlySet<string> = new Set(),
): string {
  const chain = fallbackModelIds(primaryId);
  return chain.find((id) => !unavailableModelIds.has(id)) ?? ECONOMY_MODEL_ID;
}
