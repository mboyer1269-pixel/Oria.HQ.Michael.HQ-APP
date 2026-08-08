import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { getInfrastructurePackage } from "@/server/agents/engineering-package-store";
import { requireOwnerApiSession } from "@/server/auth/owner";

/**
 * GET /api/hq/infrastructure/packages/:packageId/export
 *
 * Download a CEO-approved code package as JSON (portable, zero lock-in).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ packageId: string }> },
) {
  const authResponse = await requireOwnerApiSession();
  if (authResponse) return authResponse;

  const { packageId } = await params;
  const ctx = getActiveWorkspaceContext();
  const pkg = getInfrastructurePackage(ctx.workspace.id, packageId);

  if (!pkg) {
    return NextResponse.json({ error: "Package not found." }, { status: 404 });
  }

  const filename = `${pkg.packageId}.json`;
  return new NextResponse(JSON.stringify(pkg, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
