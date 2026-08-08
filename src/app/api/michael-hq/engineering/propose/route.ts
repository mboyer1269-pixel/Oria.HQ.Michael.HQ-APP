import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { submitEngineeringProposal } from "@/server/agents/engineering-agent";
import { requireOwnerApiSession } from "@/server/auth/owner";

const proposeSchema = z
  .object({
    brief: z.string().min(20).max(12_000),
    missionId: z.string().min(1),
    client: z.string().min(1),
    email: z.string().email(),
    modeId: z.string().min(1).optional(),
    ventureId: z.string().min(1).optional(),
    autonomyLevel: z.number().int().min(0).max(5).optional(),
  })
  .strict();

/**
 * POST /api/michael-hq/engineering/propose
 *
 * Joris brief → Sovereign Engineering Agent → telemetry-enriched PENDING intent.
 */
export async function POST(request: Request) {
  const authResponse = await requireOwnerApiSession();
  if (authResponse) return authResponse;

  const body = await request.json().catch(() => null);
  const parsed = proposeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid engineering proposal request.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const ctx = getActiveWorkspaceContext();
  const modeId = parsed.data.modeId ?? ctx.activeMode.id;

  const result = await submitEngineeringProposal(ctx, {
    ...parsed.data,
    modeId,
  });

  if (!result.ok) {
    const status = result.errorCode === "llm_unavailable" ? 503 : 500;
    return NextResponse.json(
      { error: result.error, errorCode: result.errorCode },
      { status },
    );
  }

  return NextResponse.json(result, { status: 201 });
}
