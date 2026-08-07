import { NextResponse } from 'next/server'
import { getProductionReadinessWarnings } from '@/lib/server-env'

/**
 * GET /api/health
 * Lightweight liveness probe for Docker HEALTHCHECK and Traefik upstream checks.
 * No auth required — returns 200 OK with service metadata.
 * No external calls. No secrets. No DB query.
 *
 * Also surfaces production readiness warnings without exposing configuration
 * details to unauthenticated callers. `ok` stays true because this is a
 * liveness endpoint; `status` and `degraded` carry readiness separately.
 */
export async function GET() {
  const warnings = getProductionReadinessWarnings()

  return NextResponse.json(
    {
      ok: true,
      service: 'oria',
      status: warnings.length > 0 ? 'degraded' : 'healthy',
      degraded: warnings.length > 0,
      warnings: warnings.map((warning) => ({ code: warning.code })),
      ts: Date.now(),
    },
    { status: 200 }
  )
}
