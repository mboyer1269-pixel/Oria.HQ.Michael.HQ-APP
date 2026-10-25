/**
 * Explicit opt-in, fixed at build time: next.config.ts pins the normalized value
 * via `env`, so server and client bundles inline the same literal. Changing the
 * variable requires a rebuild. Keep the literal `process.env.NEXT_PUBLIC_…`
 * access (no destructuring) so the inlining applies; tests may still set it.
 */
export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_ORIA_DEMO_MODE === "1";
}

export const EMPTY_DATA_LABEL = "Aucune donnée — rien n’a encore été enregistré";
export const DEMO_DATA_LABEL = "Démo — données simulées";
