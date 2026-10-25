import { verifyAtelierMission } from "../../handlers";
import { atelierSession, isResponse } from "../../session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ missionId: string }> }) {
  const ctx = await atelierSession(request); if (isResponse(ctx)) return ctx;
  const { missionId } = await params;
  const body = await request.json().catch(() => ({})) as { approveHarnessChange?: unknown; approveUnsandboxed?: unknown };
  return verifyAtelierMission(ctx, missionId, {}, body && typeof body === "object" ? body : {});
}
