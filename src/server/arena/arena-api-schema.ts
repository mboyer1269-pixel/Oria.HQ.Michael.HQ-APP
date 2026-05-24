import { z } from "zod";

// ---------------------------------------------------------------------------
// ArenaCandidate input schema — mirrors the ArenaCandidate type from roi-arena.ts
// but expressed as a Zod schema for runtime validation at the API boundary.
// ---------------------------------------------------------------------------

export const arenaCandidateSchema = z.object({
  id: z.string().trim().min(1, "id is required"),
  kind: z.enum(["mission", "idea", "agent-action"]),
  title: z.string().trim().min(1, "title is required").max(500),
  workspaceId: z.string().trim().min(1, "workspaceId is required"),
  missionId: z.string().trim().optional(),
  skillId: z.string().trim().optional(),
  agentId: z.string().trim().optional(),
  objective: z.string().trim().max(2000).optional(),
  expectedOutput: z.string().trim().max(2000).optional(),
  riskLevel: z.enum(["low", "medium", "high"]).optional(),
  autonomyLevel: z.number().int().min(1).max(5).optional(),
  assumedRevenueInfluencedCents: z.number().int().optional(),
  estimatedCostCents: z.number().int().optional(),
});

export const arenaEvaluationContextSchema = z.object({
  requestedMode: z.enum(["read-only", "dry-run"]).optional(),
});

export const arenaEvaluateRequestSchema = z.object({
  candidate: arenaCandidateSchema,
  context: arenaEvaluationContextSchema.optional(),
});

export const arenaBatchRequestSchema = z.object({
  candidates: z.array(arenaCandidateSchema).min(1, "candidates must not be empty").max(100),
  context: arenaEvaluationContextSchema.optional(),
  storeResults: z.boolean().optional().default(true),
  limit: z.number().int().min(1).max(100).optional().default(25),
});

export type ArenaEvaluateRequest = z.infer<typeof arenaEvaluateRequestSchema>;
export type ArenaBatchRequest = z.infer<typeof arenaBatchRequestSchema>;
