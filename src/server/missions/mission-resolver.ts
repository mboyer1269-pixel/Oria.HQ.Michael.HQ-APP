import type { Mission } from "@/core/types";

// ---------------------------------------------------------------------------
// Mission resolution — maps a free-text query to a mission from a known list.
//
// Pure function — no I/O, no writes.
// Extracted from src/server/joris/brain.ts so resolution logic is testable
// and brain.ts stays focused on intent routing.
// ---------------------------------------------------------------------------

export type MissionResolveResult =
  | { found: true;  mission: Mission }
  | { found: false; reason: "no_match"; available: Mission[] }
  | { found: false; reason: "ambiguous"; candidates: Mission[] };

/**
 * Resolves a mission from a free-text query against a list of candidates.
 *
 * Resolution order:
 *   1. Direct ID match — regex `\b(mission_\w+)\b` in the query text
 *   2. Exact title match (case-insensitive)
 *   3. Fuzzy title match — query contains the full title as a substring
 *
 * Returns `ambiguous` when multiple missions match step 2 or 3.
 * Returns `no_match` with the non-terminal missions when nothing matches.
 */
export function resolveMissionFromText(
  query: string,
  missions: Mission[],
): MissionResolveResult {
  const lower = query.toLowerCase();

  // Step 1: direct ID match
  const idMatch = query.match(/\b(mission_\w+)\b/i);
  if (idMatch) {
    const byId = missions.find((m) => m.id.toLowerCase() === idMatch[1].toLowerCase());
    if (byId) return { found: true, mission: byId };
  }

  // Step 2: exact title match (case-insensitive)
  const exactMatches = missions.filter(
    (m) => m.title.toLowerCase() === lower.trim(),
  );
  if (exactMatches.length === 1) return { found: true, mission: exactMatches[0] };
  if (exactMatches.length > 1) return { found: false, reason: "ambiguous", candidates: exactMatches };

  // Step 3: fuzzy — query contains the mission title as a substring
  const fuzzyMatches = missions.filter((m) => lower.includes(m.title.toLowerCase()));
  if (fuzzyMatches.length === 1) return { found: true, mission: fuzzyMatches[0] };
  if (fuzzyMatches.length > 1) return { found: false, reason: "ambiguous", candidates: fuzzyMatches };

  // No match — return non-terminal missions as suggestions
  const available = missions.filter(
    (m) => !["completed", "failed", "cancelled"].includes(m.status),
  );
  return { found: false, reason: "no_match", available };
}
