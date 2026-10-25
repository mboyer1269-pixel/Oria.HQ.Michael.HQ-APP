import { getAtelierArtifact } from "../../../handlers";
import { atelierSession, isResponse } from "../../../session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ missionId: string; artifactId: string }> }) {
  const ctx = await atelierSession(request); if (isResponse(ctx)) return ctx;
  const { missionId, artifactId } = await params;
  return getAtelierArtifact(ctx, missionId, artifactId);
}
