import type { AgentModelProfile } from "@/server/agents/models/agent-model-profile-contract";
import { selectModel } from "@/server/agents/models/model-selection-policy";
import { createStaticProviderRegistry } from "@/server/agents/models/provider-registry-contract";
import type { ServerCapability } from "@/server/ai/server-capability-catalog";

/** Selection only. Catalog facts never grant emission or install a runtime.
 * The existing chat UI supplies an explicit model pin, not an automatic fallback.
 * Only the two existing API clients have compatibility adapters in P1.
 */
export function selectChatModel(capability: ServerCapability, agentId: string, route = "conversation") {
  const providerId = capability.provider;
  const hasCompatibilityAdapter = capability.billingKind === "api"
    && (providerId === "anthropic" || providerId === "openai");
  const result = createStaticProviderRegistry({
    providers: [{ id: providerId, label: providerId, kind: "api", trustLevel: "reviewed",
      supportsMcp: false, supportsToolUse: capability.tools }],
    models: [{ id: capability.modelId, providerId, label: capability.modelId,
      pricing: { promptUsdPerMTok: null, completionUsdPerMTok: null, perRequestUsd: null },
      costTier: "economy", supportsToolUse: capability.tools, supportsStructuredJson: false,
      supportsMcp: false, provenance: { source: "manual", retrievedAtIso: capability.observedAt } }],
    adapters: hasCompatibilityAdapter ? [{ id: `${providerId}-http-json`, label: `${providerId} existing JSON client`,
      providerId, kind: "http-api", sentinelle: { defaultZone: "yellow", requiresApprovalForToolUse: true },
      ledgerRequired: true }] : [],
  });
  if (!result.ok) return { eligible: false as const, reasonCode: "invalid_registry" as const,
    reason: "Chat registry descriptors are invalid", skipped: [] };
  const profile: AgentModelProfile = {
    agentId, displayName: "Conversation model profile",
    routes: { [route]: { bindingMode: "pinned", candidateModelIds: [capability.modelId],
      pinnedReason: "Explicit account/model selection supplied to the authenticated chat binding" } },
  };
  return selectModel(result.registry, { profile, route });
}
