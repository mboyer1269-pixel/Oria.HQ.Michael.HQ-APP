import { z } from "zod";
const id = z.string().min(1).max(160);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
/** Public policy identity only; credentials and host paths never belong here. */
export const providerProfileSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  policySha256: hash,
  provider: z.literal("claude"),
  authentication: z.literal("subscription"),
  network: z.literal("restricted-proxy"),
  accountConnectors: z.literal("disabled"),
}).strict();
export const launchConfigSchema = z.object({ imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
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
