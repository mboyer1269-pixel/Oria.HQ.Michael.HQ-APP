import type { FreeModelEntry } from "@/server/ai/cost-ladder";

type OpenRouterModelApiResponse = {
  data?: unknown;
};

type SnapshotOptions = {
  nowIso?: string;
  existingCatalog?: unknown;
};

export type OpenRouterFreeModelSnapshotEntry = FreeModelEntry & {
  prompt_price: string;
  completion_price: string;
  source: "openrouter";
  tier: "free";
  discovered_at: string;
};

export type OpenRouterFreeModelSnapshot = {
  generated_at: string;
  provider: "openrouter";
  router_fallback: "openrouter/free";
  models: OpenRouterFreeModelSnapshotEntry[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringOf(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberOf(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function priceString(value: unknown): string | undefined {
  const parsed = numberOf(value);
  if (parsed === undefined) return undefined;
  return parsed === 0 ? "0" : String(value);
}

function isZeroPrice(value: unknown): boolean {
  return numberOf(value) === 0;
}

function providerFromModelId(id: string): string {
  return id.includes("/") ? id.split("/")[0] : "openrouter";
}

function contextLengthOf(model: Record<string, unknown>): number | undefined {
  const direct = numberOf(model.context_length);
  if (direct !== undefined) return direct;

  const topProvider = asRecord(model.top_provider);
  return topProvider ? numberOf(topProvider.context_length) : undefined;
}

function supportsTextOutput(model: Record<string, unknown>): boolean {
  const architecture = asRecord(model.architecture);
  const outputModalities = architecture?.output_modalities;
  if (!Array.isArray(outputModalities)) return true;
  return outputModalities.some((modality) => modality === "text");
}

function existingFlags(existingCatalog: unknown): Map<string, { enabled: boolean; recommended: boolean }> {
  const catalog = asRecord(existingCatalog);
  const models = catalog?.models;
  const flags = new Map<string, { enabled: boolean; recommended: boolean }>();
  if (!Array.isArray(models)) return flags;

  for (const raw of models) {
    const model = asRecord(raw);
    const id = stringOf(model?.id);
    if (!id) continue;
    flags.set(id, {
      enabled: model?.enabled === true,
      recommended: model?.recommended === true,
    });
  }

  return flags;
}

export function buildOpenRouterFreeModelSnapshot(
  apiResponse: OpenRouterModelApiResponse,
  options: SnapshotOptions = {},
): OpenRouterFreeModelSnapshot {
  const nowIso = options.nowIso ?? new Date().toISOString();
  const flags = existingFlags(options.existingCatalog);
  const data = Array.isArray(apiResponse.data) ? apiResponse.data : [];
  const models: OpenRouterFreeModelSnapshotEntry[] = [];

  for (const raw of data) {
    const model = asRecord(raw);
    if (!model || !supportsTextOutput(model)) continue;

    const id = stringOf(model.id);
    if (!id) continue;

    const pricing = asRecord(model.pricing);
    const promptPrice = priceString(pricing?.prompt);
    const completionPrice = priceString(pricing?.completion);
    const requestPrice = pricing?.request;

    if (
      promptPrice !== "0" ||
      completionPrice !== "0" ||
      (requestPrice !== undefined && !isZeroPrice(requestPrice))
    ) {
      continue;
    }

    const preserved = flags.get(id);
    const contextLength = contextLengthOf(model);
    models.push({
      id,
      name: stringOf(model.name) ?? id,
      provider: providerFromModelId(id),
      ...(contextLength !== undefined ? { contextLength } : {}),
      prompt_price: promptPrice,
      completion_price: completionPrice,
      source: "openrouter",
      tier: "free",
      discovered_at: nowIso,
      enabled: preserved?.enabled ?? false,
      recommended: preserved?.recommended ?? false,
    });
  }

  models.sort(
    (a, b) =>
      (b.contextLength ?? 0) - (a.contextLength ?? 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  return {
    generated_at: nowIso,
    provider: "openrouter",
    router_fallback: "openrouter/free",
    models,
  };
}
