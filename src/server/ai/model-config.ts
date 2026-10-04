import type { ModelProfile } from "@/core/types";
import { modelProfiles } from "@/features/hq/seed";
import type { consultHqModelCatalog } from "@/server/ai/model-catalog-consultation";

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

/**
 * Availability is a yes/no on the requested id. An unavailable model is not
 * replaced by another paid model.
 */
/**
 * Read-only catalog of the model service. Loaded only when a caller asks for
 * the catalog. `chooseModel` does not call this and does not execute the rows.
 */
export async function readServerModelCatalog(
  input: Parameters<typeof consultHqModelCatalog>[0],
): Promise<Awaited<ReturnType<typeof consultHqModelCatalog>>> {
  const { consultHqModelCatalog: consult } = await import("@/server/ai/model-catalog-consultation");
  return consult(input);
}

export function pickAvailableModelId(
  primaryId: string,
  unavailableModelIds: ReadonlySet<string> = new Set(),
): string | null {
  if (unavailableModelIds.has(primaryId)) return null;
  return primaryId;
}
