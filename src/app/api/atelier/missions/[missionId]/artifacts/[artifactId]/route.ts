import { requireOwnerApiSession } from "@/server/auth/owner";
import { getAtelierArtifact } from "../../../handlers";

export const dynamic = "force-dynamic";
/** GET /api/atelier/missions/:missionId/artifacts/:artifactId — raw artifact bytes (sha256 in header). */
export async function GET(_req: Request, { params }: { params: Promise<{ missionId: string; artifactId: string }> }) {
  const denied = await requireOwnerApiSession();
  if (denied) return denied;
  const { missionId, artifactId } = await params;
  return getAtelierArtifact(missionId, artifactId);
}
