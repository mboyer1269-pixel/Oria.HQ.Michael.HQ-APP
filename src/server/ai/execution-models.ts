/**
 * Models this JSON path can actually place in a provider request.
 * Gemini, OpenRouter, subscriptions and local runtimes are not clients here.
 * They are refused. They are not announced as operational.
 *
 * The Haiku id matches ANTHROPIC_JSON_DEFAULT_MODEL. It is duplicated so the
 * router does not import the server-only HTTP client.
 */

export type ExecutionProvider = "anthropic" | "openai";

/** Map lookup does not inherit constructor, toString, or __proto__. */
const SUPPORTED_EXECUTION_MODELS = new Map<string, ExecutionProvider>([
  ["claude-sonnet-4-6", "anthropic"],
  ["claude-haiku-4-5-20251001", "anthropic"],
  ["gpt-4o", "openai"],
  ["gpt-4o-mini", "openai"],
]);

export type ExecutionTarget =
  | { callable: true; provider: ExecutionProvider }
  | { callable: false; reason: string };

export function executionTargetForModel(modelId: string): ExecutionTarget {
  const provider = SUPPORTED_EXECUTION_MODELS.get(modelId);
  if (provider === "anthropic" || provider === "openai") {
    return { callable: true, provider };
  }

  if (modelId === "gemini-flash") {
    return {
      callable: false,
      reason: "gemini-flash n'a pas de client JSON sur ce chemin: refus, sans substitution.",
    };
  }

  if (modelId.startsWith("openrouter/") || modelId.includes(":free")) {
    return {
      callable: false,
      reason: "Ce modèle OpenRouter n'est pas un appel opérationnel: refus, sans substitution.",
    };
  }

  return {
    callable: false,
    reason: `${modelId} n'est pas pris en charge. Aucun abonnement ni modèle local n'est opérationnel.`,
  };
}
