import { requireOwnerApiSession } from "@/server/auth/owner";
import { getAtelierMission } from "../handlers";

export const dynamic = "force-dynamic";
/** GET /api/atelier/missions/:missionId — mission status, steps, model proof, artifact index. */
export async function GET(_req: Request, { params }: { params: Promise<{ missionId: string }> }) {
  const denied = await requireOwnerApiSession();
  if (denied) return denied;
  return getAtelierMission((await params).missionId);
}
