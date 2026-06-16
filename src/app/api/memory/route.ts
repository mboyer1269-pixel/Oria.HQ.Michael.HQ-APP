import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import {
  approveMemoryVaultEntry,
  proposeMemoryVaultEntry,
  rejectMemoryVaultEntry,
} from "@/server/memory/memory-vault-repository";

/**
 * POST /api/memory
 *
 * Owner-only Memory Vault write surface — local, in-memory only.
 *
 * Discriminated by `action`:
 *   - "propose" : CEO creates a memory entry. `author` is forced to "human"
 *                 server-side, so the entry is created `verified` directly.
 *   - "approve" : promote a `proposed` entry to `verified` (stamps approvedBy).
 *   - "reject"  : demote a `proposed` entry to `draft`.
 *
 * Safety:
 *   - Owner session required (requireOwnerApiSession).
 *   - workspaceId is derived from the server context only — never from the
 *     client — so cross-workspace writes are impossible.
 *   - approvedBy is the authenticated owner (ctx.userId).
 *   - No persistence: the store is in-memory and resets on process restart.
 */

const entryTypeSchema = z.enum(["decision", "sop", "note", "source", "doc"]);

const proposeSchema = z.object({
  action: z.literal("propose"),
  type: entryTypeSchema,
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(8000),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
  sourceRef: z.string().min(1).max(500).optional(),
  expiresAt: z.string().min(1).max(40).optional(),
});

const approveSchema = z.object({
  action: z.literal("approve"),
  id: z.string().min(1),
});

const rejectSchema = z.object({
  action: z.literal("reject"),
  id: z.string().min(1),
});

const requestSchema = z.discriminatedUnion("action", [
  proposeSchema,
  approveSchema,
  rejectSchema,
]);

export async function POST(request: Request) {
  const authResponse = await requireOwnerApiSession();
  if (authResponse) return authResponse;

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Requête invalide.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const ctx = getActiveWorkspaceContext();
    const workspaceId = ctx.workspace.id;
    const data = parsed.data;

    if (data.action === "propose") {
      const entry = proposeMemoryVaultEntry({
        workspaceId,
        type: data.type,
        title: data.title,
        content: data.content,
        tags: data.tags ?? [],
        author: "human",
        sourceRef: data.sourceRef,
        expiresAt: data.expiresAt,
      });
      return NextResponse.json({ ok: true, entry }, { status: 200 });
    }

    const result =
      data.action === "approve"
        ? approveMemoryVaultEntry({ entryId: data.id, workspaceId, approvedBy: ctx.userId })
        : rejectMemoryVaultEntry({ entryId: data.id, workspaceId });

    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : 409;
      return NextResponse.json({ error: result.reason }, { status });
    }

    return NextResponse.json({ ok: true, entry: result.entry }, { status: 200 });
  } catch (error) {
    console.error(
      "POST /api/memory failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json({ error: "Action mémoire indisponible." }, { status: 500 });
  }
}
