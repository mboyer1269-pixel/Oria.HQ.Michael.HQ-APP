/** Explicit opt-in; Next.js also inlines this public flag for client components. */
export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_ORIA_DEMO_MODE === "1";
}

export const EMPTY_DATA_LABEL = "Aucune donnée — rien n’a encore été enregistré";
export const DEMO_DATA_LABEL = "Démo — données simulées";
