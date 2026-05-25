import { NextResponse } from 'next/server'

/**
 * GET /api/health
 * Lightweight liveness probe for Docker HEALTHCHECK and Traefik upstream checks.
 * No auth required — returns 200 OK with service metadata.
 * No external calls. No secrets. No DB query.
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: 'oria',
      status: 'healthy',
      ts: Date.now(),
    },
    { status: 200 }
  )
}
