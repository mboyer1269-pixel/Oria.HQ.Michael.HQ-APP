import { NextResponse } from "next/server";
import {
  buildStagingRuntimeDiagnostic,
  evaluateStagingRuntimeAccess,
} from "@/server/runtime/staging-runtime-diagnostic";

// Read the real per-request runtime environment on Vercel — never prerender or
// cache. Without this the handler could capture build-time env and report the
// wrong Supabase target.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/health/staging-runtime
 *
 * Read-only runtime diagnostic: confirms which Supabase project the deployed
 * Preview/Staging build actually points to, plus the state of a few non-secret
 * runtime flags. JSON only.
 *
 * SECURITY:
 *   - Fail-closed in production: returns 404 when VERCEL_ENV === "production"
 *     (or NODE_ENV production with no VERCEL_ENV).
 *   - Explicit opt-in: returns 404 unless ENABLE_STAGING_RUNTIME_DIAGNOSTIC is
 *     truthy. Fail-safe OFF.
 *   - Never returns secrets: keys are reported as presence booleans only; the
 *     Supabase URL is reduced to host + derived (public) project ref.
 *   - No DB reads, no user data, no service_role usage.
 */
export async function GET() {
  const access = evaluateStagingRuntimeAccess(process.env);
  if (!access.allowed) {
    // Uniform 404 with a generic body — does not reveal whether the block is
    // due to production or the disabled flag, and leaks no environment detail.
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: access.status },
    );
  }

  return NextResponse.json(buildStagingRuntimeDiagnostic(process.env), {
    status: 200,
  });
}
