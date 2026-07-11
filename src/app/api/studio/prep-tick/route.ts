import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import type { StudioCampaignPacket } from "@/features/studio/studio-campaign-packet";
import {
  buildDefaultStudioHeartbeatPackets,
  runStudioPrepTick,
} from "@/server/studio/studio-prep-tick";

// POST /api/studio/prep-tick — Studio campaign heartbeat (prepare-only).
// Never publishes or spends.

const packetSchema = z.object({
  packetId: z.string().min(1),
  ventureId: z.string().min(1),
  theme: z.string().min(1),
  audience: z.string().min(1),
  channel: z.enum([
    "linkedin_post",
    "x_post",
    "email_nurture",
    "landing_copy",
    "ad_creative_brief",
  ]),
  draftCopy: z.string().min(1),
  callToAction: z.string().min(1),
  rationale: z.string().min(1),
  createdAt: z.string().optional(),
});

const bodySchema = z.object({
  /** When true (default), use heartbeat seed packets if `packets` is empty. */
  useHeartbeatDefaults: z.boolean().optional(),
  packets: z.array(packetSchema).max(20).optional(),
});

export async function POST(request: Request) {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const ctx = getActiveWorkspaceContext();
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const nowIso = new Date().toISOString();
  const useDefaults = parsed.data.useHeartbeatDefaults !== false;
  let packets: StudioCampaignPacket[] = (parsed.data.packets ?? []).map((p) => ({
    ...p,
    channel: p.channel as StudioCampaignPacket["channel"],
    createdAt: p.createdAt ?? nowIso,
  }));

  if (packets.length === 0 && useDefaults) {
    packets = buildDefaultStudioHeartbeatPackets(nowIso);
  }

  if (packets.length === 0) {
    return NextResponse.json(
      { error: "No campaign packets provided and heartbeat defaults disabled." },
      { status: 400 },
    );
  }

  const result = await runStudioPrepTick({
    workspaceId: ctx.workspace.id,
    userId: ctx.userId,
    packets,
  });

  return NextResponse.json({
    ok: true,
    publishAuthorized: false,
    createdAt: result.createdAt,
    summary: result.plan.summary,
    enqueued: result.enqueued,
    note: "Studio prepare-only — CEO must approve manual publish. No auto-send.",
  });
}
