import { z } from "zod";
const id = z.string().min(1).max(160);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const profileId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
/** Exact native provider model identifier, never an alias such as sonnet, default or latest. */
export const observedProviderModelIdSchema = z.string().min(3).max(132)
  .regex(/^[a-z][a-z0-9._:-]{0,127}(?:\[1m\])?$/)
  .refine(value => /\d/.test(value) && !/(?:^|[-_.:])(?:default|latest)(?:$|[-_.:])/.test(value));
/** Exact ACP model identifier approved by HQ. `default` is allowed only as the
 * literal ACP value when ACP confirms that same value before the prompt. */
export const foundationModelIdSchema = z.union([observedProviderModelIdSchema, z.literal("default")]);
/**
 * One explicit, fully-spelled schema per supported provider — never a single
 * shared shape with `provider` loosened to an open enum. Supporting a new
 * provider means adding a new variant here, mirroring
 * integrations/openhands-runner/provider_policy.py's PROVIDER_POLICIES. A
 * discriminated union means a profile is only ever checked against the one
 * variant named by its own `provider`, so a Codex profile can never be
 * satisfied by Claude's variant (or vice versa) regardless of how its other
 * fields are filled in — no policy qualified for one provider can be
 * presented as another's just because their literal values coincide today.
 */
const claudeProviderProfileSchema = z.object({
  id: profileId,
  policySha256: hash,
  provider: z.literal("claude"),
  authentication: z.literal("subscription"),
  network: z.literal("restricted-proxy"),
  accountConnectors: z.literal("disabled"),
}).strict();
const codexProviderProfileSchema = z.object({
  id: profileId,
  policySha256: hash,
  provider: z.literal("codex"),
  authentication: z.literal("subscription"),
  network: z.literal("restricted-proxy"),
  accountConnectors: z.literal("disabled"),
}).strict();
/** Public policy identity only; credentials and host paths never belong here. */
export const providerProfileSchema = z.discriminatedUnion("provider", [
  claudeProviderProfileSchema,
  codexProviderProfileSchema,
]);
export const launchConfigSchema = z.object({ imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  foundationModelId: foundationModelIdSchema.optional(),
  executorVersion: z.literal("1.50.0"), runnerId: id,
  permissionPolicy: z.literal("deny"), maxCostCents: z.number().int().min(1).max(10000),
  maxTokens: z.number().int().min(1).max(200000), maxIterations: z.number().int().min(1).max(100),
  timeoutSeconds: z.number().int().min(1).max(1800), hardTokenLimitEnforced: z.literal(false),
  // Do not insert a default: existing offline approval hashes must remain stable.
  providerProfile: providerProfileSchema.optional() }).strict();
export type LaunchConfig = z.infer<typeof launchConfigSchema>;
export const launchBindingSchema = z.object({workspaceId:id,missionId:z.uuid(),reservationId:z.uuid(),
  payloadHash:hash,commitSha:z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),config:launchConfigSchema,launchHash:hash}).strict();
export type LaunchBinding = z.infer<typeof launchBindingSchema>;
