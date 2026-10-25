import "server-only";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { checkCliArguments } from "@/server/agents/providers/cli-runtime-provider-contract";
import defaults from "./catalogs/subscription-runtimes.json";
import { resolveProbeExecutionEnvironment } from "@/server/agents/runtimes/local-runtime-probe";
import { createStaticProviderRegistry } from "@/server/agents/models/provider-registry-contract";
import { selectModel } from "@/server/agents/models/model-selection-policy";

const id = z.string().min(1).max(160).regex(/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/).refine(value => checkCliArguments([value]).ok);
export const subscriptionSelectionSchema = z.object({ runtimeId: z.enum(["codex", "claude-code"]), modelId: id, catalogRevision: id }).strict();
export type SubscriptionSelection = z.infer<typeof subscriptionSelectionSchema>;
export const subscriptionCatalogSchema = z.object({ revision: id, entries: z.array(subscriptionSelectionSchema.omit({ catalogRevision: true })).min(1).max(200) }).strict()
  .refine(value => new Set(value.entries.map(e => `${e.runtimeId}:${e.modelId}`)).size === value.entries.length);
export type SubscriptionCatalog = z.infer<typeof subscriptionCatalogSchema>;
export function subscriptionEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.ORIA_HQ_SUBSCRIPTION_RUNTIMES === "1" && resolveProbeExecutionEnvironment({ ...env, ORIA_ENABLE_LOCAL_RUNTIME_PROBE: "1" }).allowed;
}
export function catalogRevision(catalog: SubscriptionCatalog) {
  return createHash("sha256").update(JSON.stringify(catalog)).digest("hex");
}
export async function loadSubscriptionCatalog(): Promise<SubscriptionCatalog | null> {
  try {
    const file = process.env.ORIA_HQ_SUBSCRIPTION_RUNTIMES_FILE;
    if (!file) return subscriptionCatalogSchema.parse(defaults);
    if (!isAbsolute(file) || (await stat(file)).size > 200_000) return null;
    return subscriptionCatalogSchema.parse(JSON.parse(await readFile(file, "utf8")));
  } catch { return null; }
}
export function subscriptionOptions(catalog: SubscriptionCatalog | null, env = process.env) {
  return (catalog?.entries ?? []).map(entry => ({ ...entry, accountId: "local-session", provider: entry.runtimeId === "codex" ? "openai" : "anthropic",
    catalogRevision: catalogRevision(catalog!), billingKind: "subscription", consumptionMode: "subscription" as const,
    executable: subscriptionEnabled(env), reason: subscriptionEnabled(env) ? null : "Abonnement CLI local désactivé" }));
}
/** A pinned registry decision: no fallback candidate and no API adapter. */
export function selectSubscriptionModel(entry: SubscriptionCatalog["entries"][number]) {
  const providerId = entry.runtimeId === "codex" ? "openai" : "anthropic";
  const registry = createStaticProviderRegistry({
    providers: [{ id: providerId, label: providerId, kind: "local-runtime", trustLevel: "reviewed", supportsMcp: false, supportsToolUse: false }],
    models: [{ id: entry.modelId, providerId, label: entry.modelId, pricing: { promptUsdPerMTok: null, completionUsdPerMTok: null, perRequestUsd: null }, costTier: "economy", supportsToolUse: false, supportsStructuredJson: true, supportsMcp: false, provenance: { source: "manual", retrievedAtIso: "2026-10-25T00:00:00.000Z" } }],
    adapters: [{ id: entry.runtimeId, label: entry.runtimeId, providerId, kind: "cli-subscription", sentinelle: { defaultZone: "yellow", requiresApprovalForToolUse: true }, ledgerRequired: true }],
  });
  return registry.ok ? selectModel(registry.registry, { profile: { agentId: "conversation", displayName: "Local conversation", routes: { conversation: { bindingMode: "pinned", candidateModelIds: [entry.modelId], pinnedReason: "Explicit owner subscription selection" } } }, route: "conversation" }) : null;
}
