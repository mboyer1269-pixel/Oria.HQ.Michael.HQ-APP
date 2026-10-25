import { createAtelierMission, listAtelierMissions } from "./handlers";
import { atelierSession, isResponse } from "./session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** GET /api/atelier/missions — missions of the caller's workspace. */
export async function GET(request: Request) {
  const ctx = await atelierSession(request); if (isResponse(ctx)) return ctx;
  return listAtelierMissions(ctx);
}
/** POST /api/atelier/missions — create + start spec (202). */
export async function POST(request: Request) {
  const ctx = await atelierSession(request); if (isResponse(ctx)) return ctx;
  return createAtelierMission(ctx, await request.json().catch(() => null));
}
