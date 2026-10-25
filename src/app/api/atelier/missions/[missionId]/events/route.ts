import { streamAtelierEvents } from "../../handlers";
import { atelierSession, isResponse } from "../../session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ missionId: string }> }) {
  const ctx = await atelierSession(request); if (isResponse(ctx)) return ctx;
  const { missionId } = await params;
  return streamAtelierEvents(ctx, missionId, request);
}
