import { NextResponse } from 'next/server'
import { getProductionReadinessWarnings } from '@/lib/server-env'

/**
 * GET /api/health
 * Lightweight liveness probe for Docker HEALTHCHECK and Traefik upstream checks.
 * No auth required — returns 200 OK with service metadata.
 * No external calls. No secrets. No DB query.
 *
 * Also surfaces production readiness warnings: configuration gaps that degrade a
 * subsystem without stopping the boot. They carry a code and the affected
 * subsystem, never a value, so this stays safe to expose unauthenticated.
 * `ok` stays true — the service is live; `degraded` is what changes.
 */
export async function GET() {
  const warnings = getProductionReadinessWarnings()

  return NextResponse.json(
    {
      ok: true,
      service: 'oria',
      status: 'healthy',
      degraded: warnings.length > 0,
      warnings: warnings.map((warning) => ({
        code: warning.code,
        subsystem: warning.subsystem,
        message: warning.message,
      })),
      ts: Date.now(),
    },
    { status: 200 }
  )
}
