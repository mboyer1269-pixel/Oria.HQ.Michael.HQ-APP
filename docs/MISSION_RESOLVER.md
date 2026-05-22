# Mission Resolver

Last updated: 2026-05-21  
Branch: `claude/mission-resolver-service`  
File: `src/server/missions/mission-resolver.ts`

---

## What This Is

A pure function that maps a free-text query to a mission from a known list.

Extracted from `src/server/joris/brain.ts` so:
- Resolution logic is testable in isolation
- `brain.ts` stays focused on intent routing
- Future callers (other handlers, API routes) can reuse resolution without duplicating it

**No I/O. No writes. No AI calls.**

---

## API

```ts
resolveMissionFromText(query: string, missions: Mission[]): MissionResolveResult
```

### Result

```ts
type MissionResolveResult =
  | { found: true;  mission: Mission }
  | { found: false; reason: "no_match";  available: Mission[] }
  | { found: false; reason: "ambiguous"; candidates: Mission[] };
```

| Result | Meaning |
|--------|---------|
| `found: true` | Exactly one mission matched — ready to use |
| `found: false, reason: "no_match"` | Nothing matched; `available` lists non-terminal missions |
| `found: false, reason: "ambiguous"` | Multiple missions matched; `candidates` lists them for disambiguation |

---

## Resolution Order

1. **Direct ID match** — `\b(mission_\w+)\b` regex in the query. Fast, precise, no ambiguity.
2. **Exact title match** — case-insensitive full-title equality.
3. **Fuzzy match** — the query contains the mission title as a substring (case-insensitive).

Steps 2 and 3 return `ambiguous` if multiple missions match.

---

## Examples

```ts
// Direct ID
resolveMissionFromText("plan mission_ceo_brief_2026_05_21 for today", missions);
// → { found: true, mission: { id: "mission_ceo_brief_2026_05_21", ... } }

// Fuzzy title
resolveMissionFromText("planifie le CEO Brief du jour", missions);
// → { found: true, mission: { title: "CEO Brief du jour", ... } }

// No match
resolveMissionFromText("plan mission xyz_unknown", missions);
// → { found: false, reason: "no_match", available: [...non-terminal missions] }

// Ambiguous
resolveMissionFromText("plan mission audit", [missionA, missionB]);  // both titles contain "audit"
// → { found: false, reason: "ambiguous", candidates: [missionA, missionB] }
```

---

## How `brain.ts` Uses This

```ts
const resolved = resolveMissionFromText(message, missions);

if (!resolved.found) {
  if (resolved.reason === "ambiguous") { /* list candidates, ask to clarify */ }
  /* reason === "no_match": list available missions */
}

const { mission } = resolved;
// → proceed to buildDryRunMissionExecutionPlan()
```

---

## Known Limitation

The fuzzy match (`lower.includes(m.title.toLowerCase())`) is sensitive to title length.
Long titles are harder to include verbatim in a chat message; very short titles increase
false-positive risk. A future improvement could use word-overlap scoring or a
`missionResolver` with stemming. For now, `no_match` with the available list is the
safe fallback — the user is prompted with the exact ids and titles to choose from.
