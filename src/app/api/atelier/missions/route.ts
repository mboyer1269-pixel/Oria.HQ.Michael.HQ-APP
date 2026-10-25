import { requireOwnerApiSession } from "@/server/auth/owner";
import { listAtelierMissions } from "./handlers";

export const dynamic = "force-dynamic";
/** GET /api/atelier/missions — local atelier missions (owner only, read-only). */
export async function GET() {
  const denied = await requireOwnerApiSession();
  if (denied) return denied;
  return listAtelierMissions();
}
