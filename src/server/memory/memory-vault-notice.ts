/** Discreet notice for /hq/memory: count only, never titles or content. Null when N <= 0. */
export function excludedFilesNotice(excludedCount: number): string | null {
  if (!Number.isFinite(excludedCount) || excludedCount <= 0) return null;
  return `${Math.floor(excludedCount)} fichiers exclus, sans espace déclaré`;
}
