import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { planLocalRuntimeDryRun } from "@/server/agents/runtimes/local-runtime-dispatch";

// POST /api/runtimes/local/dry-run — plan a Claude/Codex CLI invocation.
// Never spawns a subprocess. enablesDispatch is always false.

const bodySchema = z.object({
  kind: z.enum(["claude_code_cli", "codex_cli"]),
  prompt: z.string().min(1).max(4000),
  permissionMode: z.enum(["default", "plan", "accept_edits"]).optional(),
});

export async function POST(request: Request) {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const ctx = getActiveWorkspaceContext();
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = planLocalRuntimeDryRun({
    kind: parsed.data.kind,
    prompt: parsed.data.prompt,
    permissionMode: parsed.data.permissionMode,
    requestedBy: ctx.userId,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        executed: false,
        enablesDispatch: false,
        errors: result.errors,
      },
      { status: 422 },
    );
  }

  return NextResponse.json({
    ok: true,
    kind: result.kind,
    binaryName: result.binaryName,
    plannedArgv: result.plannedArgv,
    executed: false,
    enablesDispatch: false,
    evidencePack: result.evidencePack,
    note: "Dry-run only — no subprocess. Real CLI dispatch needs a written approval PR.",
  });
}
