// src/server/agents/models/provider-registry-contract.ts
//
// Provider Registry — the single lookup surface between the Model Selection
// Policy and provider/model/adapter descriptors.
//
// This PR ships a STATIC registry only: descriptors are supplied by the
// caller (hand-written or parsed from cached catalog snapshots) and validated
// on construction. No fetch, no process.env, no persistence. A future PR may
// feed it from a cached OpenRouter catalog refresh — through the official
// JSON API, never HTML scraping.
//
// Unknown ids resolve to undefined by design: the selection policy treats
// unknown providers and unknown models as INELIGIBLE, never as a fallback.

import {
  validateModelCapabilityDescriptor,
  validateModelProviderDescriptor,
  validateRuntimeAdapterDescriptor,
  type ModelCapabilityDescriptor,
  type ModelProviderDescriptor,
  type RuntimeAdapterDescriptor,
} from "./model-provider-contract";

// ---------------------------------------------------------------------------
// Registry interface
// ---------------------------------------------------------------------------

export type ProviderRegistry = {
  getProvider(providerId: string): ModelProviderDescriptor | undefined;
  getModel(modelId: string): ModelCapabilityDescriptor | undefined;
  getAdapter(adapterId: string): RuntimeAdapterDescriptor | undefined;
  listProviders(): readonly ModelProviderDescriptor[];
  listModels(): readonly ModelCapabilityDescriptor[];
  listAdaptersForProvider(providerId: string): readonly RuntimeAdapterDescriptor[];
};

export type StaticRegistryInput = {
  providers: readonly ModelProviderDescriptor[];
  models: readonly ModelCapabilityDescriptor[];
  adapters: readonly RuntimeAdapterDescriptor[];
};

export type CreateRegistryResult =
  | { ok: true; registry: ProviderRegistry }
  | { ok: false; errors: readonly string[] };

// ---------------------------------------------------------------------------
// Static registry factory — pure, validated, in-memory
// ---------------------------------------------------------------------------

export function createStaticProviderRegistry(input: StaticRegistryInput): CreateRegistryResult {
  const errors: string[] = [];

  const providerById = new Map<string, ModelProviderDescriptor>();
  for (const provider of input.providers) {
    const validation = validateModelProviderDescriptor(provider);
    if (!validation.ok) errors.push(...validation.errors);
    if (providerById.has(provider.id)) {
      errors.push(`duplicate provider id "${provider.id}"`);
    }
    providerById.set(provider.id, provider);
  }

  const modelById = new Map<string, ModelCapabilityDescriptor>();
  for (const model of input.models) {
    const validation = validateModelCapabilityDescriptor(model);
    if (!validation.ok) errors.push(...validation.errors);
    if (modelById.has(model.id)) {
      errors.push(`duplicate model id "${model.id}"`);
    }
    if (!providerById.has(model.providerId)) {
      errors.push(`model "${model.id}" references unknown provider "${model.providerId}"`);
    }
    modelById.set(model.id, model);
  }

  const adapterById = new Map<string, RuntimeAdapterDescriptor>();
  const adaptersByProvider = new Map<string, RuntimeAdapterDescriptor[]>();
  for (const adapter of input.adapters) {
    const validation = validateRuntimeAdapterDescriptor(adapter);
    if (!validation.ok) errors.push(...validation.errors);
    if (adapterById.has(adapter.id)) {
      errors.push(`duplicate adapter id "${adapter.id}"`);
    }
    if (!providerById.has(adapter.providerId)) {
      errors.push(`adapter "${adapter.id}" references unknown provider "${adapter.providerId}"`);
    }
    adapterById.set(adapter.id, adapter);
    const forProvider = adaptersByProvider.get(adapter.providerId) ?? [];
    forProvider.push(adapter);
    adaptersByProvider.set(adapter.providerId, forProvider);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    registry: {
      getProvider: (providerId) => providerById.get(providerId),
      getModel: (modelId) => modelById.get(modelId),
      getAdapter: (adapterId) => adapterById.get(adapterId),
      listProviders: () => [...providerById.values()],
      listModels: () => [...modelById.values()],
      listAdaptersForProvider: (providerId) => [...(adaptersByProvider.get(providerId) ?? [])],
    },
  };
}
